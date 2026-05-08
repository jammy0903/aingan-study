#!/usr/bin/env python3
"""Build per-question deep study notes from local Hankuksa answer PDFs.

The COMCBT answer PDFs are laid out in two columns. Plain `pdftotext` output
interleaves both columns, so this script uses bbox coordinates, reconstructs
left-column then right-column reading order, splits the text into questions,
and generates concise analysis notes for each question.
"""

from __future__ import annotations

import html
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
TMP_DIR = ROOT / "tmp" / "pdfs" / "columns"
OUT_DIR = ROOT / "reports" / "hankuksa_question_deep_analysis"
JSON_OUT = ROOT / "reports" / "hankuksa_question_deep_analysis_59_75.json"
INDEX_OUT = OUT_DIR / "README.md"

PDFS = {
    59: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20220611(59회)(해설집).pdf",
    60: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20220806(60회)(해설집).pdf",
    61: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20221022(61회)(해설집).pdf",
    62: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20221203(62회)(해설집).pdf",
    63: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20230211(63회)(해설집).pdf",
    64: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20230415(64회)(해설집).pdf",
    65: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20230617(65회)(해설집).pdf",
    66: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20230813(66회)(해설집).pdf",
    67: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20231021(67회)(해설집).pdf",
    68: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20231202(68회)(해설집).pdf",
    69: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20240217(69회)(해설집).pdf",
    70: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20240525(70회)(해설집).pdf",
    71: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20240810(71회)(해설집).pdf",
    72: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20241020(72회)(해설집).pdf",
    73: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20250216(73회)(해설집).pdf",
    74: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20250524(74회)(해설집).pdf",
    75: "/mnt/c/Users/ksj/Downloads/한국사능력검정심화20250809(75회)(해설집).pdf",
}


@dataclass
class Word:
    x_min: float
    y_min: float
    x_max: float
    y_max: float
    text: str


@dataclass
class Question:
    round_no: int
    number: int
    lines: list[str]


WORD_RE = re.compile(
    r'<word xMin="([0-9.]+)" yMin="([0-9.]+)" xMax="([0-9.]+)" yMax="([0-9.]+)">(.*?)</word>',
    re.DOTALL,
)
PAGE_RE = re.compile(r'<page width="([0-9.]+)" height="([0-9.]+)">')
QUESTION_START_RE = re.compile(r"^(\d{1,2})\.\s+")
EXPLANATION_MARKERS = ("<문제 해설>", "문제 해설")
OPTION_RE = re.compile(r"([①②③④⑤])\s*([^①②③④⑤\n]+)")
FALLBACK_STOPWORDS = {
    "대한",
    "설명",
    "옳은",
    "옳지",
    "것은",
    "가장",
    "적절한",
    "문제",
    "해설",
    "다음",
    "밑줄",
    "그은",
    "보기",
    "자료",
    "시기",
    "내용",
    "사실",
    "모습",
}

BOILERPLATE_PATTERNS = (
    "본 해설집은",
    "최강 자격증",
    "전자문제집 CBT",
    "www.comcbt.com",
    "한국사능력검정 심화",
    "기출문제 및 해설집",
    "과목 구분 없음",
    "해설작성자",
    "기출문제 해설은",
)

KEYWORD_BANK = [
    # 선사/초기 국가
    "구석기",
    "신석기",
    "청동기",
    "철기",
    "주먹도끼",
    "뗀석기",
    "간석기",
    "빗살무늬 토기",
    "가락바퀴",
    "고인돌",
    "비파형 동검",
    "송국리",
    "민무늬 토기",
    "고조선",
    "단군",
    "위만",
    "우거왕",
    "준왕",
    "8조법",
    "한사군",
    "낙랑군",
    "부여",
    "고구려",
    "옥저",
    "동예",
    "삼한",
    "영고",
    "무천",
    "서옥제",
    "민며느리제",
    "책화",
    "소도",
    "천군",
    # 삼국/가야/남북국
    "태조왕",
    "고국천왕",
    "미천왕",
    "서안평",
    "소수림왕",
    "율령",
    "태학",
    "불교",
    "광개토",
    "장수왕",
    "평양 천도",
    "안시성",
    "살수대첩",
    "을지문덕",
    "연개소문",
    "천리장성",
    "대막리지",
    "대야성",
    "나당동맹",
    "황산벌",
    "백강 전투",
    "검모잠",
    "고연무",
    "안승",
    "매소성",
    "기벌포",
    "고이왕",
    "근초고왕",
    "고흥",
    "서기",
    "칠지도",
    "아직기",
    "왕인",
    "비유왕",
    "나제 동맹",
    "문주왕",
    "웅진",
    "동성왕",
    "무령왕",
    "22담로",
    "벽돌무덤",
    "성왕",
    "사비",
    "남부여",
    "관산성",
    "계백",
    "부여풍",
    "복신",
    "도침",
    "흑치상지",
    "박혁거세",
    "내물",
    "마립간",
    "지증왕",
    "우경",
    "동시전",
    "법흥왕",
    "이차돈",
    "금관가야",
    "건원",
    "진흥왕",
    "거칠부",
    "국사",
    "화랑도",
    "대가야",
    "순수비",
    "단양 적성비",
    "황룡사",
    "김춘추",
    "김유신",
    "신문왕",
    "관료전",
    "녹읍",
    "국학",
    "9주 5소경",
    "상수리",
    "민정문서",
    "정전",
    "혜공왕",
    "원성왕",
    "독서삼품과",
    "김헌창",
    "장보고",
    "청해진",
    "법화원",
    "원종",
    "애노",
    "적고적",
    "진성여왕",
    "최치원",
    "시무 10조",
    "격황소서",
    "선종",
    "풍수지리",
    "도선",
    "금관가야",
    "대가야",
    "중계 무역",
    "낙랑",
    "왜",
    "발해",
    "대조영",
    "무왕",
    "문왕",
    "선왕",
    "3성 6부",
    "상경",
    "용천부",
    "해동성국",
    "주자감",
    # 고려
    "왕건",
    "태조",
    "훈요 10조",
    "역분전",
    "광종",
    "노비안검법",
    "과거제",
    "공복",
    "성종",
    "최승로",
    "시무 28조",
    "12목",
    "중앙 관제",
    "거란",
    "서희",
    "강동 6주",
    "강감찬",
    "귀주대첩",
    "윤관",
    "별무반",
    "동북 9성",
    "묘청",
    "서경 천도",
    "무신",
    "정중부",
    "최충헌",
    "교정도감",
    "만적",
    "몽골",
    "강화도",
    "삼별초",
    "원 간섭",
    "쌍성총관부",
    "공민왕",
    "신돈",
    "전민변정도감",
    "홍건적",
    "왜구",
    "최무선",
    "화통도감",
    "위화도 회군",
    "과전법",
    "정몽주",
    "정도전",
    "불씨잡변",
    "팔관회",
    "연등회",
    "초조대장경",
    "팔만대장경",
    "직지",
    "상감 청자",
    # 조선 전기/후기
    "태조 이성계",
    "태종",
    "호패법",
    "6조 직계제",
    "세종",
    "집현전",
    "훈민정음",
    "4군 6진",
    "의정부 서사제",
    "세조",
    "직전법",
    "성종",
    "경국대전",
    "홍문관",
    "사림",
    "훈구",
    "무오사화",
    "갑자사화",
    "조광조",
    "현량과",
    "소격서",
    "기묘사화",
    "붕당",
    "서인",
    "동인",
    "임진왜란",
    "이순신",
    "한산도",
    "명량",
    "정유재란",
    "광해군",
    "대동법",
    "중립 외교",
    "인조반정",
    "정묘호란",
    "병자호란",
    "효종",
    "북벌",
    "예송",
    "환국",
    "영조",
    "탕평책",
    "균역법",
    "정조",
    "규장각",
    "장용영",
    "수원 화성",
    "신해통공",
    "금난전권",
    "세도 정치",
    "홍경래",
    "임술 농민 봉기",
    "흥선대원군",
    "경복궁",
    "호포제",
    "서원 철폐",
    "병인박해",
    "병인양요",
    "신미양요",
    "척화비",
    # 근대/일제/현대
    "강화도 조약",
    "조미 수호 통상 조약",
    "임오군란",
    "갑신정변",
    "동학 농민 운동",
    "전주 화약",
    "집강소",
    "갑오개혁",
    "을미사변",
    "아관파천",
    "대한 제국",
    "광무개혁",
    "독립협회",
    "만민공동회",
    "을사늑약",
    "헤이그 특사",
    "정미의병",
    "신민회",
    "국채 보상 운동",
    "3.1 운동",
    "대한민국 임시 정부",
    "국민 대표 회의",
    "한인 애국단",
    "이봉창",
    "윤봉길",
    "물산 장려 운동",
    "민립 대학 설립 운동",
    "6.10 만세 운동",
    "광주 학생 항일 운동",
    "신간회",
    "의열단",
    "김원봉",
    "조선 혁명 선언",
    "천도교",
    "만세보",
    "사찰령",
    "원불교",
    "박중빈",
    "배재 학당",
    "의민단",
    "한국 독립군",
    "쌍성보",
    "대전자령",
    "조선 혁명군",
    "영릉가",
    "흥경성",
    "한국광복군",
    "건국 강령",
    "조선 태형령",
    "헌병 경찰",
    "경성 제국 대학",
    "조선 농민 총동맹",
    "황국 신민 서사",
    "창씨개명",
    "국가총동원법",
    "민족 말살",
    "모스크바 3국 외상 회의",
    "반민족 행위 특별 조사 위원회",
    "농지 개혁",
    "6.25 전쟁",
    "4.19 혁명",
    "5.16 군사 정변",
    "유신 헌법",
    "부마 민주 항쟁",
    "5.18 민주화 운동",
    "6월 민주 항쟁",
    "6.29 민주화 선언",
    "남북 기본 합의서",
    "6.15 남북 공동 선언",
    "10.4 남북 공동 선언",
]

ERA_RULES = [
    ("선사", ["구석기", "신석기", "청동기", "철기", "주먹도끼", "빗살무늬", "고인돌", "비파형"]),
    ("초기 국가/고조선", ["고조선", "위만", "우거왕", "8조법", "부여", "옥저", "동예", "삼한", "소도", "영고", "무천"]),
    (
        "삼국/가야",
        [
            "고구려",
            "백제",
            "신라",
            "가야",
            "소수림왕",
            "근초고왕",
            "문주왕",
            "무령왕",
            "성왕",
            "진흥왕",
            "법흥왕",
            "사비",
            "웅진",
            "남부여",
            "관산성",
            "대야성",
            "황산벌",
            "나당",
        ],
    ),
    ("남북국", ["통일신라", "신문왕", "9주 5소경", "발해", "대조영", "문왕", "선왕", "해동성국"]),
    ("고려", ["고려", "왕건", "광종", "성종", "거란", "몽골", "공민왕", "위화도", "팔만대장경"]),
    ("조선 전기", ["조선", "태종", "세종", "세조", "성종", "경국대전", "훈민정음", "사림", "사화"]),
    ("조선 후기", ["임진왜란", "병자호란", "대동법", "예송", "영조", "정조", "세도", "홍경래", "임술"]),
    ("근대", ["강화도 조약", "임오군란", "갑신정변", "동학", "갑오개혁", "대한 제국", "을사늑약"]),
    (
        "일제 강점기",
        [
            "3.1 운동",
            "임시 정부",
            "의열단",
            "신간회",
            "한국광복군",
            "한인 애국단",
            "물산 장려",
            "천도교",
            "만세보",
            "사찰령",
            "의민단",
            "조선 태형령",
            "헌병 경찰",
            "경성 제국 대학",
            "조선 농민 총동맹",
            "황국 신민 서사",
            "창씨개명",
            "국가총동원법",
            "민족 말살",
        ],
    ),
    ("현대", ["모스크바", "반민족", "농지 개혁", "6.25", "4.19", "5.16", "유신", "5.18", "6월 민주"]),
]

SPECIAL_NOTES = [
    (("구석기", "신석기", "청동기", "철기"), "도구-생업-주거-사회 변화 네 칸 표로 비교해야 하는 선사 단서형이다."),
    (("고조선", "위만", "우거왕", "한사군"), "고조선은 건국 전승보다 위만 집권-우거왕-한 무제 침공-한사군 설치 순서를 잡는 문제가 자주 나온다."),
    (("부여", "옥저", "동예", "삼한"), "초기 국가는 제천 행사, 혼인 풍습, 경제 생활, 정치 조직을 1:1로 연결해야 한다."),
    (("소수림왕", "율령", "태학", "불교"), "소수림왕은 율령 반포-불교 수용-태학 설립을 한 덩어리 중앙집권 세트로 외워야 한다."),
    (("근초고왕", "고흥", "서기", "칠지도", "요서", "규슈"), "근초고왕은 백제 전성기 카드다. 서기 편찬, 부자 상속, 대외 진출, 칠지도를 함께 묶는다."),
    (("미천왕", "낙랑군", "서안평"), "미천왕은 서안평 공격과 낙랑군 축출을 고구려 4세기 팽창 흐름에 놓아야 한다."),
    (("비유왕", "나제"), "나제 동맹은 비유왕 때의 고구려 견제 동맹과 동성왕 때의 혼인 동맹을 구분해야 한다."),
    (("문주왕", "웅진"), "문주왕의 웅진 천도는 장수왕의 한성 공격 뒤 백제 수도 이동 맥락으로 나온다."),
    (("무령왕", "22담로", "벽돌무덤"), "무령왕은 지방 통제 22담로와 남조 문화 영향의 벽돌무덤을 함께 보는 카드다."),
    (("성왕", "사비", "남부여", "노리사치계"), "성왕은 사비 천도, 남부여 국호, 일본 불교 전파, 관산성 전사까지 연결된다."),
    (("지증왕", "우경", "동시전"), "지증왕은 왕호 사용, 신라 국호, 우경, 순장 금지, 동시전 설치를 체제 정비로 묶는다."),
    (("법흥왕", "이차돈", "금관가야", "건원"), "법흥왕은 율령-공복-병부-골품 정비-불교 공인-금관가야 병합의 국가 체제 정비 카드다."),
    (("진흥왕", "거칠부", "화랑도", "대가야", "순수비"), "진흥왕은 신라 전성기다. 한강 장악, 화랑도 정비, 국사 편찬, 대가야 병합, 순수비를 함께 본다."),
    (("살수대첩", "을지문덕"), "살수대첩은 수 침입-을지문덕-수 멸망-당 건국으로 이어지는 전쟁사 순서를 묻는다."),
    (("대야성", "김춘추", "나당동맹"), "대야성 전투는 김춘추 외교 전환과 나당동맹의 배경으로 연결된다."),
    (("백강", "부여풍", "복신", "도침"), "백제 부흥 운동은 부여풍 추대, 복신·도침, 왜 지원, 백강 전투 실패를 같이 본다."),
    (("검모잠", "고연무", "안승"), "고구려 부흥 운동은 신라 지원, 안승의 금마저, 당의 한반도 지배 야욕과 연결해야 한다."),
    (("매소성", "기벌포"), "나당 전쟁은 매소성-기벌포 승리로 삼국 통일 완성 흐름을 마무리한다."),
    (("신문왕", "관료전", "녹읍", "국학", "9주 5소경"), "신문왕은 통일 직후 왕권 강화와 지방 제도 정비 문제의 핵심이다."),
    (("혜공왕", "원성왕", "김헌창", "장보고", "진성여왕"), "신라 하대는 왕위 쟁탈, 독서삼품과, 지방 반란, 장보고, 진성여왕, 6두품·호족 성장으로 이어진다."),
    (("발해", "무왕", "문왕", "선왕"), "발해는 무왕의 팽창, 문왕의 제도 정비와 당 문화 수용, 선왕의 해동성국을 비교한다."),
    (("왕건", "훈요", "역분전"), "고려 태조는 통합 정책, 북진 정책, 호족 포섭, 훈요 10조를 한 카드로 정리한다."),
    (("광종", "노비안검법", "과거제"), "광종은 왕권 강화 문제다. 노비안검법, 과거제, 공복 제정 순으로 잡는다."),
    (("성종", "최승로", "12목"), "성종은 유교 정치 질서와 지방관 파견을 묻는 정비형 카드다."),
    (("서희", "강동 6주", "강감찬"), "거란 침입은 서희 외교 담판-강동 6주-강감찬 귀주대첩을 순서로 외운다."),
    (("윤관", "별무반", "동북 9성"), "여진 문제는 윤관의 별무반과 동북 9성 설치·반환까지 묶어야 한다."),
    (("무신", "최충헌", "교정도감", "만적"), "무신 정권은 권력 기구와 신분 해방 운동을 같이 꼬는 경향이 있다."),
    (("공민왕", "전민변정도감", "쌍성총관부"), "공민왕은 반원 자주 개혁, 쌍성총관부 수복, 신돈 등용을 연결한다."),
    (("위화도 회군", "과전법", "정도전"), "고려 말-조선 건국은 위화도 회군, 과전법, 신진 사대부 분화, 정도전을 순서로 잡는다."),
    (("세종", "훈민정음", "4군 6진"), "세종은 문화·과학과 영토 확장을 함께 묻는다."),
    (("성종", "경국대전", "홍문관"), "성종은 조선 통치 체제 완성 카드다. 경국대전 완성, 홍문관, 사림 등용을 묶는다."),
    (("임진왜란", "이순신", "한산도", "명량"), "임진왜란은 전투 순서와 전후 영향까지 보기가 섞인다."),
    (("광해군", "대동법", "중립 외교"), "광해군은 대동법 시행과 후금·명 사이 중립 외교를 구분해 잡는다."),
    (("영조", "탕평", "균역법"), "영조는 탕평책, 균역법, 신문고 부활, 속대전 등을 묶어야 한다."),
    (("정조", "규장각", "장용영", "신해통공"), "정조는 규장각·장용영·수원 화성과 신해통공을 시기별로 분리해야 한다."),
    (("흥선대원군", "경복궁", "호포제", "서원"), "흥선대원군은 왕권 강화책과 통상 수교 거부 정책을 나눠서 본다."),
    (("강화도 조약", "조미", "임오군란", "갑신정변"), "개항기 초반은 조약-군란-정변 순서와 청·일 개입을 정확히 세워야 한다."),
    (("동학", "전주 화약", "집강소", "갑오개혁"), "동학 농민 운동은 1차 봉기, 전주 화약, 집강소, 2차 봉기를 사건 순서로 푼다."),
    (("대한 제국", "광무개혁", "독립협회"), "대한 제국기는 광무개혁과 독립협회 활동을 같은 시기 안에서 비교한다."),
    (("을사늑약", "헤이그", "정미의병"), "국권 피탈기는 을사늑약-헤이그 특사-고종 강제 퇴위-정미의병 순서가 핵심이다."),
    (("3.1 운동", "임시 정부"), "3.1 운동은 대한민국 임시 정부 수립과 이후 항일 운동 분화의 출발점으로 나온다."),
    (("의열단", "김원봉", "조선 혁명 선언"), "의열단은 김원봉, 신채호의 조선 혁명 선언, 개인 폭력 투쟁 노선을 연결한다."),
    (("신간회", "광주 학생"), "신간회는 민족 유일당 운동과 광주 학생 항일 운동 지원을 함께 묻는다."),
    (("한인 애국단", "이봉창", "윤봉길"), "한인 애국단은 이봉창-윤봉길 의거와 중국 국민당의 임시 정부 지원 변화를 연결한다."),
    (("한국광복군", "건국 강령"), "1940년대 독립운동은 한국광복군, 건국 강령, 국내 진공 작전 준비를 묶는다."),
    (("모스크바", "반민족", "농지 개혁"), "해방 직후는 좌우 대립, 정부 수립, 반민특위, 농지 개혁 순서를 자주 꼰다."),
    (("4.19", "5.16", "유신", "5.18", "6월 민주"), "현대사는 민주화 운동의 원인, 결과, 헌법 변화를 시간순으로 풀어야 한다."),
]


def run(args: list[str]) -> str:
    completed = subprocess.run(
        args,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return completed.stdout


def page_count(pdf_path: str) -> int:
    info = run(["pdfinfo", pdf_path])
    match = re.search(r"^Pages:\s+(\d+)", info, re.MULTILINE)
    if not match:
        raise RuntimeError(f"Could not detect page count: {pdf_path}")
    return int(match.group(1))


def words_from_bbox(xml: str) -> tuple[float, float, list[Word]]:
    page_match = PAGE_RE.search(xml)
    if not page_match:
        raise RuntimeError("No <page> element in bbox output")
    width = float(page_match.group(1))
    height = float(page_match.group(2))
    words: list[Word] = []
    for match in WORD_RE.finditer(xml):
        raw_text = html.unescape(re.sub(r"<[^>]+>", "", match.group(5))).strip()
        if not raw_text:
            continue
        words.append(
            Word(
                x_min=float(match.group(1)),
                y_min=float(match.group(2)),
                x_max=float(match.group(3)),
                y_max=float(match.group(4)),
                text=raw_text,
            )
        )
    return width, height, words


def join_words(line_words: Iterable[Word]) -> str:
    text = " ".join(word.text for word in sorted(line_words, key=lambda item: item.x_min))
    text = re.sub(r"\s+([,.:;?!\]\)])", r"\1", text)
    text = re.sub(r"([\[\(])\s+", r"\1", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def group_lines(words: list[Word]) -> list[str]:
    words = sorted(words, key=lambda item: (item.y_min, item.x_min))
    grouped: list[list[Word]] = []
    for word in words:
        if not grouped:
            grouped.append([word])
            continue
        last_line = grouped[-1]
        last_y = sum(item.y_min for item in last_line) / len(last_line)
        if abs(word.y_min - last_y) <= 4.8:
            last_line.append(word)
        else:
            grouped.append([word])

    lines: list[str] = []
    for line_words in grouped:
        line = join_words(line_words)
        if is_boilerplate(line):
            continue
        if line:
            lines.append(line)
    return lines


def is_boilerplate(line: str) -> bool:
    compact = re.sub(r"\s+", " ", line)
    if any(pattern in compact for pattern in BOILERPLATE_PATTERNS):
        return True
    if re.fullmatch(r"[◐◑]?\s*\d{4}\s+\d{2}\s+\d{2}\s+\d{2}.*", compact):
        return True
    if re.fullmatch(r"[◐◑]+", compact):
        return True
    return False


def reconstruct_pdf_text(pdf_path: str) -> str:
    lines: list[str] = []
    pages = page_count(pdf_path)
    for page in range(1, pages + 1):
        xml = run(["pdftotext", "-bbox-layout", "-f", str(page), "-l", str(page), pdf_path, "-"])
        width, height, words = words_from_bbox(xml)
        usable = [
            word
            for word in words
            if 55 <= word.y_min <= height - 48
            and word.x_min >= 15
            and word.x_max <= width - 12
        ]
        mid = width / 2
        left = [word for word in usable if ((word.x_min + word.x_max) / 2) < mid]
        right = [word for word in usable if ((word.x_min + word.x_max) / 2) >= mid]
        page_lines = group_lines(left) + group_lines(right)
        lines.append(f"[[PAGE {page}]]")
        lines.extend(page_lines)
    return "\n".join(lines)


def extract_answer_key(text: str) -> dict[int, str]:
    key: dict[int, str] = {}
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for index in range(len(lines) - 1):
        numbers = [int(item) for item in re.findall(r"\b([1-9]|[1-4][0-9]|50)\b", lines[index])]
        answers = re.findall(r"[①②③④⑤]", lines[index + 1])
        if len(numbers) >= 5 and len(numbers) == len(answers):
            for number, answer in zip(numbers, answers):
                key[number] = answer
    return {number: key[number] for number in sorted(key) if 1 <= number <= 50}


QUESTION_STEM_CUES = (
    "다음",
    "밑줄",
    "(가)",
    "(나)",
    "(다)",
    "(라)",
    "㉠",
    "㉡",
    "교사의",
    "검색창",
    "기사",
    "자료",
    "대화",
    "연표",
    "지역",
    "왕",
    "단체",
    "기구",
    "국가",
    "나라",
    "인물",
)

QUESTION_TASK_CUES = (
    "옳은",
    "옳지 않은",
    "적절",
    "고른",
    "나열",
    "설명",
    "활동",
    "내용",
    "사실",
    "모습",
    "시기",
    "탐구",
    "정책",
    "전개",
    "배경",
    "결과",
    "문화",
    "재위",
    "순서",
    "들어갈",
)


def detected_question_start_number(line: str) -> int | None:
    match = QUESTION_START_RE.match(line)
    if not match:
        return None
    number = int(match.group(1))
    if not 1 <= number <= 50:
        return None
    if "?" in line or re.search(r"\[[123]점\]", line):
        return number
    # Some PDF lines split before "것은? [2점]". In that case the heading
    # still has a question stem shape, while option-commentary lines do not.
    if len(line) >= 18:
        has_stem = any(cue in line for cue in QUESTION_STEM_CUES)
        has_task = any(cue in line for cue in QUESTION_TASK_CUES)
        looks_like_commentary = any(mark in line for mark in (" = ", " -> ", "--->", "정답", ">", ":"))
        if has_stem and has_task and not looks_like_commentary:
            return number
    return None


def find_orphan_question_start(lines: list[str]) -> int | None:
    """Find a missing image-stem question embedded after the prior explanation."""
    seen_explanation = False
    for index, line in enumerate(lines):
        if any(marker in line for marker in EXPLANATION_MARKERS):
            seen_explanation = True
            continue
        if not seen_explanation or not line.startswith("①"):
            continue
        nearby = lines[index + 1 : index + 10]
        has_second_option = any(item.startswith("②") for item in nearby)
        has_later_explanation = any(
            any(marker in item for marker in EXPLANATION_MARKERS) for item in lines[index + 1 :]
        )
        if has_second_option and has_later_explanation:
            return index
    return None


def split_questions(round_no: int, text: str) -> list[Question]:
    questions: list[Question] = []
    current: list[str] = []
    current_number: int | None = None

    def append_with_gap(next_number: int) -> None:
        nonlocal current, current_number
        if current_number is None:
            for missing in range(1, next_number):
                questions.append(
                    Question(
                        round_no=round_no,
                        number=missing,
                        lines=[f"{missing}. [이미지형 문항 - 제목 자동 추출 실패]"],
                    )
                )
            return

        if next_number == current_number + 1:
            questions.append(Question(round_no=round_no, number=current_number, lines=current))
            return

        orphan_index = find_orphan_question_start(current)
        if orphan_index is None:
            questions.append(Question(round_no=round_no, number=current_number, lines=current))
            for missing in range(current_number + 1, next_number):
                questions.append(
                    Question(
                        round_no=round_no,
                        number=missing,
                        lines=[f"{missing}. [이미지형 문항 - 제목 자동 추출 실패]"],
                    )
                )
            return

        questions.append(Question(round_no=round_no, number=current_number, lines=current[:orphan_index]))
        orphan_lines = current[orphan_index:]
        first_missing = current_number + 1
        questions.append(
            Question(
                round_no=round_no,
                number=first_missing,
                lines=[f"{first_missing}. [이미지형 문항 - 제목 자동 추출 실패]"] + orphan_lines,
            )
        )
        for missing in range(first_missing + 1, next_number):
            questions.append(
                Question(
                    round_no=round_no,
                    number=missing,
                    lines=[f"{missing}. [이미지형 문항 - 제목 자동 추출 실패]"],
                )
            )

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("[[PAGE "):
            continue
        detected_number = detected_question_start_number(line)
        if detected_number is not None and (current_number is None or detected_number > current_number):
            if current:
                append_with_gap(detected_number)
            current = [line]
            current_number = detected_number
            continue
        if current:
            current.append(line)
    if current:
        questions.append(Question(round_no=round_no, number=current_number or 1, lines=current))
    if questions and questions[-1].number < 50:
        for missing in range(questions[-1].number + 1, 51):
            questions.append(
                Question(
                    round_no=round_no,
                    number=missing,
                    lines=[f"{missing}. [이미지형 문항 - 제목 자동 추출 실패]"],
                )
            )
    return questions


def clean_block(question: Question) -> str:
    lines = [
        line
        for line in question.lines
        if not is_boilerplate(line) and not line.startswith("[") and "해설작성자" not in line
    ]
    return "\n".join(lines)


def stem_snippet(question: Question) -> str:
    for line in question.lines:
        if QUESTION_START_RE.match(line):
            snippet = re.sub(r"\[[123]점\]", "", line).strip()
            snippet = re.sub(r"\[[123]\s*$", "", snippet).strip()
            snippet = re.sub(r"\s+", " ", snippet)
            return snippet[:80]
    return ""


def extract_options(text: str) -> list[str]:
    options: list[str] = []
    for match in OPTION_RE.finditer(text):
        value = re.sub(r"\s+", " ", match.group(2)).strip()
        if not value or len(value) < 3 or "문제 해설" in value or "<문제" in value:
            continue
        keywords = extract_keywords(value)[:3]
        if keywords:
            anchor = ", ".join(keywords)
        else:
            tokens: list[str] = []
            for token in re.split(r"[^0-9A-Za-z가-힣·.]+", value):
                token = re.sub(r"(으로|에서|에게|까지|부터|이라는|라는|하고|하며|되었다|하였다|하였)$", "", token)
                token = re.sub(r"(은|는|이|가|을|를|에|의|와|과|도|만)$", "", token)
                if len(token) >= 2 and token not in FALLBACK_STOPWORDS:
                    tokens.append(token)
            anchor = ", ".join(tokens[:2]) if tokens else "이미지/짧은 보기"
        options.append(f"{match.group(1)} {anchor}")
    return options[:5]


def extract_keywords(text: str) -> list[str]:
    compact = re.sub(r"\s+", " ", text)
    found: list[tuple[int, str]] = []
    for keyword in KEYWORD_BANK:
        variants = {keyword, keyword.replace(" ", "")}
        positions = [compact.find(variant) for variant in variants if variant in compact]
        if positions:
            found.append((min(pos for pos in positions if pos >= 0), keyword))
    found.sort(key=lambda item: item[0])
    unique: list[str] = []
    for _, keyword in found:
        if keyword not in unique:
            unique.append(keyword)
    return unique[:12]


def classify_era(text: str, keywords: list[str]) -> str:
    haystack = re.sub(r"\s+", " ", text) + " " + " ".join(keywords)
    scores: list[tuple[int, str]] = []
    for era, needles in ERA_RULES:
        score = sum(1 for needle in needles if needle in haystack or needle.replace(" ", "") in haystack)
        if score:
            scores.append((score, era))
    if not scores:
        return "미분류"
    scores.sort(key=lambda item: (-item[0], item[1]))
    return scores[0][1]


def classify_type(text: str) -> str:
    first = text.splitlines()[0] if text.splitlines() else text
    if any(token in first for token in ("사이의 시기", "이후", "이전", "순서", "순서대로", "시기")):
        return "연표/시기 배열"
    if any(token in first for token in ("왕", "국왕", "임금", "군주")):
        return "왕별 업적 식별"
    if any(token in first for token in ("나라", "국가", "지역", "도읍")):
        return "국가/지역 식별"
    if any(token in first for token in ("문화유산", "유물", "유적", "그림", "사진", "탑", "불상")):
        return "문화재/자료 판독"
    if any(token in first for token in ("인물", "밑줄 그은", "활동한 사람")):
        return "인물 활동 식별"
    if any(token in first for token in ("단체", "조직", "기관", "기구")):
        return "단체/기구 식별"
    if any(token in first for token in ("정책", "제도", "법령", "조약", "개혁")):
        return "정책/제도 식별"
    if any(token in first for token in ("운동", "의병", "항쟁", "전투", "사건")):
        return "운동/사건 흐름"
    if "자료" in first or "(가)" in first or "(나)" in first:
        return "사료 단서 해석"
    return "개념 식별"


def extract_answer(text: str) -> str:
    compact = re.sub(r"\s+", " ", text)
    match = re.search(r"([①②③④⑤]|[1-5])[^①②③④⑤1-5]{0,24}\(?정답\)?", compact)
    if match:
        return match.group(1)
    match = re.search(r"\(?정답\)?[^①②③④⑤1-5]{0,24}([①②③④⑤]|[1-5])", compact)
    if match:
        return match.group(1)
    return "원문 해설에서 자동 확정 못함"


def special_notes(keywords: list[str], text: str) -> list[str]:
    haystack = re.sub(r"\s+", " ", text) + " " + " ".join(keywords)
    notes: list[str] = []
    for needles, note in SPECIAL_NOTES:
        hits = [
            needle
            for needle in needles
            if needle in haystack or needle.replace(" ", "") in haystack
        ]
        if needles[0] in hits or len(hits) >= 2:
            if note not in notes:
                notes.append(note)
    return notes[:2]


def intent_for(qtype: str, era: str) -> str:
    if qtype == "연표/시기 배열":
        return "사건명을 아는지보다 앞뒤 사건을 같은 연표에 놓을 수 있는지를 본다."
    if qtype == "왕별 업적 식별":
        return "왕 이름과 업적을 분리 암기했는지, 비슷한 왕의 정비책을 섞지 않는지를 본다."
    if qtype == "국가/지역 식별":
        return "사료·지도·문화재 단서로 국가 또는 지역을 먼저 고정하는 능력을 본다."
    if qtype == "문화재/자료 판독":
        return "사진·사료의 고유 키워드를 시대와 국가에 연결하는 문제다."
    if qtype == "인물 활동 식별":
        return "인물의 대표 활동뿐 아니라 같은 시기 단체·사건과 연결되는지를 본다."
    if qtype == "정책/제도 식별":
        return "정책 이름을 외우는 데서 끝나지 않고 시행 배경과 결과까지 구분하는 문제다."
    if qtype == "운동/사건 흐름":
        return "사건의 원인-전개-결과와 참여 세력을 순서대로 잡는지를 본다."
    return f"{era} 범위의 핵심 단서를 보고 보기의 시대 착오를 제거하는 문제다."


def trap_for(qtype: str, era: str, keywords: list[str], options: list[str]) -> str:
    if qtype == "연표/시기 배열":
        return "보기는 보통 한두 단계 앞뒤 사건을 섞는다. 먼저 기준 사건의 절대 위치를 잡고, 나머지를 전후로만 잘라야 한다."
    if qtype == "왕별 업적 식별":
        return "같은 나라의 앞뒤 왕 업적을 섞는 방식이 핵심 함정이다. 업적을 왕별 단독 암기보다 세기별 흐름으로 묶어야 한다."
    if qtype == "문화재/자료 판독":
        return "사진형 보기는 시대가 달라도 이름이 비슷한 문화재를 섞는다. 양식, 출토지, 제작 국가 키워드를 먼저 확인한다."
    if qtype == "국가/지역 식별":
        return "국가 이름을 바로 고르기보다 주변국·수도·무역로·문화재를 섞어 헷갈리게 한다."
    if qtype == "정책/제도 식별":
        return "정책의 시행자와 시행 연도를 바꾸는 오답이 많다. 정책-왕/정부-결과를 3칸으로 묶어 확인한다."
    if qtype == "운동/사건 흐름":
        return "원인과 결과가 뒤집히거나, 같은 항일/민주 운동 안의 다른 단체가 섞이는 식으로 꼰다."
    if options:
        return "보기 키워드를 시대별로 먼저 갈라낸 뒤, 남은 보기에서 사료 단서와 직접 맞는 것만 남기는 방식으로 풀어야 한다."
    return "한 단어 매칭으로 풀면 틀리기 쉬우므로 사료 단서와 시대 배경을 동시에 확인해야 한다."


def routine_for(qtype: str, keywords: list[str]) -> str:
    clue = ", ".join(f"`{keyword}`" for keyword in keywords[:4]) if keywords else "핵심 명사"
    if qtype == "연표/시기 배열":
        return f"1) {clue}로 기준 사건을 고정 2) 보기 사건을 이전/이후로 분리 3) 같은 시대 사건끼리 한 번 더 순서 확인."
    if qtype == "왕별 업적 식별":
        return f"1) {clue}가 가리키는 왕을 확정 2) 그 왕의 체제 정비/전성기/대외 관계 업적만 남김 3) 앞뒤 왕 업적 제거."
    if qtype == "문화재/자료 판독":
        return f"1) 자료의 양식·출토지·명칭 단서 확인 2) 국가와 시대 고정 3) 보기의 문화재를 시대별로 제거."
    if qtype == "국가/지역 식별":
        return f"1) {clue}로 국가 또는 지역 고정 2) 수도·제도·대외 관계 단서 확인 3) 다른 국가 업적 제거."
    return f"1) {clue}를 표시 2) 시대를 먼저 고정 3) 보기의 왕·단체·정책이 그 시대에 들어가는지 확인."


def elimination_for(answer: str, options: list[str], qtype: str) -> str:
    if answer in {"①", "②", "③", "④", "⑤"}:
        answer_anchor = next((option for option in options if option.startswith(answer)), f"{answer} 보기")
        other_anchors = [option for option in options if not option.startswith(answer)]
        if other_anchors:
            return (
                f"정답 앵커는 `{answer_anchor}`이다. "
                f"오답은 {' / '.join(other_anchors[:3])}처럼 시대·국가·인물 축으로 먼저 분리해서 제거."
            )
        return f"정답 앵커 `{answer_anchor}`가 결정 단서와 직접 맞는지 원문 자료와 대조한다."
    if qtype == "연표/시기 배열":
        return "정답표를 대조한 뒤, 오답은 기준 사건보다 앞인지 뒤인지 한 번씩 표시해서 제거."
    return "정답표를 대조한 뒤, 오답 보기의 시대·국가·인물 불일치 지점을 표시."


def study_link_for(era: str, keywords: list[str]) -> str:
    if era in ("삼국/가야", "남북국"):
        return "통합 연표에서 같은 세기 고구려·백제·신라·가야·발해 사건을 나란히 비교."
    if era == "초기 국가/고조선":
        return "초기 국가 표에서 제천 행사, 풍습, 경제, 정치 조직을 1:1로 암기."
    if era == "선사":
        return "선사 시대는 도구-토기-주거-경제-사회 변화를 한 줄로 비교."
    if era == "고려":
        return "고려 왕별 개혁과 대외 항쟁을 별도 연표로 연결."
    if era in ("조선 전기", "조선 후기"):
        return "조선은 왕별 제도 정비와 붕당·전쟁·탕평 흐름을 분리해서 복습."
    if era in ("근대", "일제 강점기", "현대"):
        return "근현대는 조약·운동·정부 정책을 날짜 순서로 재배열하며 복습."
    if keywords:
        return f"`{keywords[0]}` 관련 단원을 통합 연표에서 검색해 앞뒤 사건까지 확인."
    return "문항 단서가 약하므로 원문 해설과 교재 해당 단원을 대조."


def analyze_question(question: Question, official_answer: str | None = None) -> dict[str, object]:
    text = clean_block(question)
    keywords = extract_keywords(text)
    era = classify_era(text, keywords)
    qtype = classify_type(text)
    options = extract_options(text)
    notes = special_notes(keywords, text)
    answer = official_answer or extract_answer(text)
    return {
        "round": question.round_no,
        "number": question.number,
        "stem_snippet": stem_snippet(question),
        "type": qtype,
        "era": era,
        "answer": answer,
        "answer_source": "정답표" if official_answer else "해설문 자동 추정",
        "keywords": keywords,
        "option_anchors": options,
        "intent": intent_for(qtype, era),
        "trap": trap_for(qtype, era, keywords, options),
        "routine": routine_for(qtype, keywords),
        "elimination": elimination_for(answer, options, qtype),
        "study_link": study_link_for(era, keywords),
        "special_notes": notes,
        "line_count": len(question.lines),
    }


def md_for_round(round_no: int, items: list[dict[str, object]]) -> str:
    lines: list[str] = []
    lines.append(f"# 한국사능력검정 심화 {round_no}회 문항별 딥 분석")
    lines.append("")
    lines.append(
        "원문 문항 전체를 재수록하지 않고, 각 문항의 핵심 단서와 풀이 구조를 공부용으로 재정리했다."
    )
    lines.append("")
    for item in items:
        keywords = item["keywords"]
        options = item["option_anchors"]
        notes = item["special_notes"]
        lines.append(f"## {round_no}회 {item['number']}번")
        lines.append(f"- 문항 감지: {item['stem_snippet']}")
        lines.append(f"- 유형: {item['type']}")
        lines.append(f"- 시대/주제: {item['era']}")
        lines.append(
            "- 결정 단서: "
            + (", ".join(f"`{keyword}`" for keyword in keywords) if keywords else "자동 추출 단서 부족")
        )
        lines.append(f"- 정답 확인: {item['answer']} ({item['answer_source']})")
        if options:
            lines.append("- 보기 키워드: " + " / ".join(f"`{option}`" for option in options[:5]))
        lines.append(f"- 출제 의도: {item['intent']}")
        lines.append(f"- 꼬는 방식: {item['trap']}")
        lines.append(f"- 풀이 루틴: {item['routine']}")
        lines.append(f"- 오답 제거: {item['elimination']}")
        if notes:
            for note in notes:
                lines.append(f"- 암기 연결: {note}")
        lines.append(f"- 복습 연결: {item['study_link']}")
        lines.append("")
    return "\n".join(lines)


def md_index(diagnostics: list[dict[str, object]]) -> str:
    lines = [
        "# 한국사능력검정 심화 59~75회 문항별 딥 분석",
        "",
        "각 회차별 PDF 해설집을 좌표 기반으로 재조립한 뒤, 1~50번 문항별로 단서·유형·함정·풀이 루틴을 붙인 분석본이다.",
        "",
        "## 파일",
        "",
    ]
    for round_no in sorted(PDFS):
        lines.append(f"- [{round_no}회](./{round_no}회.md)")
    lines.extend(["", "## 추출 점검", ""])
    for row in diagnostics:
        status = "OK" if row["question_count"] == 50 else "확인 필요"
        lines.append(
            f"- {row['round']}회: {row['question_count']}문항 감지, 정답 {row['answer_count']}개, {row['page_count']}쪽, 상태 {status}"
        )
    lines.extend(
        [
            "",
            "## 읽는 법",
            "",
            "- `결정 단서`: 문제를 풀 때 먼저 잡아야 하는 키워드.",
            "- `꼬는 방식`: 한능검이 오답을 만드는 대표 패턴.",
            "- `풀이 루틴`: 실제 시험장에서 적용할 순서.",
            "- `암기 연결`: 같은 단원에서 같이 묶어야 할 왕·사건·제도.",
            "",
            "이미지형 문항은 제목이 자동 추출되지 않을 수 있어 `이미지형 문항`으로 표시하고, 선택지·해설·정답표 기준으로 분석했다.",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_items: list[dict[str, object]] = []
    diagnostics: list[dict[str, object]] = []
    for round_no, pdf_path in PDFS.items():
        pdf = Path(pdf_path)
        if not pdf.exists():
            raise FileNotFoundError(pdf_path)
        reconstructed = reconstruct_pdf_text(str(pdf))
        (TMP_DIR / f"{round_no}.txt").write_text(reconstructed, encoding="utf-8")
        answer_key = extract_answer_key(reconstructed)
        questions = split_questions(round_no, reconstructed)
        items = [analyze_question(question, answer_key.get(question.number)) for question in questions]
        (OUT_DIR / f"{round_no}회.md").write_text(md_for_round(round_no, items), encoding="utf-8")
        all_items.extend(items)
        diagnostics.append(
            {
                "round": round_no,
                "page_count": page_count(str(pdf)),
                "question_count": len(questions),
                "answer_count": len(answer_key),
                "numbers": [question.number for question in questions],
            }
        )
    JSON_OUT.write_text(
        json.dumps({"diagnostics": diagnostics, "questions": all_items}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    INDEX_OUT.write_text(md_index(diagnostics), encoding="utf-8")
    print(json.dumps(diagnostics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
