#!/usr/bin/env python3
"""Audit whether Hankuksa exam text choices are covered by app data.

This intentionally ignores image-only choices. Coverage is keyword based:
if a choice/view text contains a meaningful historical term, that term should
appear somewhere in `hankuksa/**/*.html` or `hankuksa/data/*.json`.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
ANALYZER = ROOT / "scripts" / "analyze_hankuksa_questions.py"
DEEP_ANALYSIS_JSON = ROOT / "reports" / "hankuksa_question_deep_analysis_59_75.json"
DEFAULT_ROUND = 59


STOPWORDS = {
    "가장",
    "같은",
    "결과",
    "것은",
    "관련",
    "내용",
    "다음",
    "대한",
    "등의",
    "때는",
    "모두",
    "문제",
    "보기",
    "사실",
    "상황",
    "선지",
    "설명",
    "시기",
    "위한",
    "이후",
    "이전",
    "있는",
    "있다",
    "있어",
    "있었",
    "자료",
    "전개",
    "중에",
    "통해",
    "하나",
    "하였다",
    "하였다.",
    "하였다..",
    "합니다",
    "였다",
    "되었다",
    "건립되었다",
    "그려졌다",
    "주조되었다",
    "간행되었다",
    "기술되었다",
    "사용되었다",
    "기록되었다",
    "운영되었다",
    "실시되었다",
    "설치하여",
    "파견하여",
    "가져왔다",
    "거두었다",
    "수출되었다",
    "재배되었다",
    "보냈다",
    "불렸다",
    "설립되었다",
    "창립되었다",
    "파병되",
    "궁궐로",
    "빠져",
    "일행",
    "공부하",
    "희생된",
    "연계하여",
    "터뜨리",
    "소속",
    "관원",
    "3사로",
    "학사라도고",
    "알아본다",
    "조사한다",
    "파악한다",
    "분석한다",
    "선출되었다",
    "수립되고",
    "제작된",
    "열었다",
    "옳은",
    "옳지",
    "적절",
    "밑줄",
    "그은",
    "해설",
    "정답",
    "해당",
    "활동",
    "모습",
    "국가",
    "나라",
    "왕의",
    "왕이",
    "왕은",
    "지역",
    "기구",
    "인물",
    "사람",
    "학생",
    "교사",
    "질문",
    "대화",
    "기사",
    "검색창",
    "연표",
    "발표",
    "추진",
    "시행",
    "설치",
    "전투",
    "운동",
    "개척하여",
    "결사였다",
    "결성되었다",
    "교유하였습니다",
    "구실로",
    "근거지로",
    "기록하였습니다",
    "두었다",
    "맡았다",
    "보관하",
    "보급되었다",
    "봉기하였어요",
    "비판적인",
    "상영되었습니다",
    "선포되었어요",
    "설립하여",
    "신설되",
    "신문인",
    "알려져",
    "위하여",
    "유배되었다",
    "저술하여",
    "제거되었다",
    "조직되었다",
    "조직하여",
    "주도하여",
    "지정되었습니다",
    "출판되었습니다",
    "칠레와",
    "통제하기",
    "파견되었다",
    "폐간되었다",
    "간행되었습니다",
    "검색한다",
    "견제한다",
    "발행되었다",
    "전말",
    "지역인",
    "체결되었다",
    "찾아본다",
    "해설하였습",
    "해결하기",
    "활용하여",
}

PARTICLE_RE = re.compile(
    r"(으로서|으로써|으로|에서|에게|까지|부터|마다|처럼|이라는|라는|하고|하며|하게|되어|되었|하였다|하였|했다|하며|함)$"
)


@dataclass
class Unit:
    question: int
    kind: str
    label: str
    text: str


def load_analyzer():
    spec = importlib.util.spec_from_file_location("hankuksa_question_analyzer", ANALYZER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load analyzer: {ANALYZER}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[\u200b\u00a0'\"`.,:;!?()\[\]{}<>〈〉＜＞·ㆍ/-]", "", text)
    return text


def compact_display(text: str, limit: int = 82) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def historical_files() -> list[Path]:
    return sorted(
        path
        for path in (ROOT / "hankuksa").rglob("*")
        if path.is_file() and path.suffix in {".html", ".json"}
    )


def load_corpus() -> tuple[str, dict[str, str]]:
    file_texts: dict[str, str] = {}
    merged: list[str] = []
    for path in historical_files():
        text = path.read_text(encoding="utf-8", errors="ignore")
        rel = str(path.relative_to(ROOT))
        file_texts[rel] = normalize(text)
        merged.append(text)
    return normalize("\n".join(merged)), file_texts


def extract_declared_terms() -> set[str]:
    terms: set[str] = set()
    analyzer = load_analyzer()
    terms.update(getattr(analyzer, "KEYWORD_BANK", []))
    quote_re = re.compile(r"['\"]([^'\"]{2,40})['\"]")
    arrays_re = re.compile(r"(?:keywords|tags|terms|concept_titles)\s*[:=]\s*\[(.*?)\]", re.DOTALL)
    for path in historical_files():
        text = path.read_text(encoding="utf-8", errors="ignore")
        for array_match in arrays_re.finditer(text):
            for quote_match in quote_re.finditer(array_match.group(1)):
                value = clean_term(quote_match.group(1))
                if is_good_term(value):
                    terms.add(value)
    extra_terms = {
        "철제 무기",
        "철제 농기구",
        "정복 활동",
        "동굴",
        "막집",
        "명도전",
        "반달 돌칼",
        "빗살무늬 토기",
        "무천",
        "소도",
        "1책12법",
        "상가",
        "대로",
        "패자",
        "전국 7웅",
        "연",
        "안동도호부",
        "사비성 함락",
        "나당 연합군",
        "매소성",
        "왜 격퇴",
        "천리장성",
        "살수",
        "등주",
        "황산벌",
        "안승",
        "익산 미륵사",
        "평양성 전투",
        "북위",
        "외사정",
        "동진",
        "마라난타",
        "은병",
        "부경",
        "덕대",
        "울산항",
        "울산",
        "아라비아 상인",
        "신라장적",
        "민정문서",
        "인구",
        "소",
        "말",
        "뽕나무",
        "잣나무",
        "대가야",
        "광평성",
        "욕살",
        "처려근지",
        "화백 회의",
        "사자",
        "조의",
        "선인",
        "3성 교대",
        "김흠돌",
        "무열왕계",
        "김헌창",
        "웅천주",
        "장안국",
        "완도",
        "청해진",
        "김흠돌의 난",
        "수선사 결사",
        "요세",
        "법화 신앙",
        "화엄일승법계도",
        "삼국유사",
        "왕오천축국전",
        "일연",
        "혜초",
        "의상",
        "지눌",
        "도병마사",
        "식목도감",
        "중추원",
        "삼사",
        "상서성",
        "중서문하성",
        "정당성",
        "도평의사사",
        "정방",
        "좌사정",
        "우사정",
        "9재",
        "변발",
        "호복",
        "편년체",
        "고승전",
        "대보단",
        "동국문헌비고",
        "이인임",
        "소격서",
        "폐지",
        "현량과",
        "위훈 삭제",
        "향약",
        "기묘사화",
        "조광조",
        "태조",
        "태종",
        "세종",
        "세조",
        "성종",
        "연산군",
        "중종",
        "영조",
        "정조",
        "무오사화",
        "갑자사화",
        "계유정난",
        "이시애의 난",
        "성삼문",
        "이인좌",
        "경국대전",
        "대전통편",
        "대전회통",
        "속대전",
        "금위영",
        "탕평비",
        "초계문신제",
        "세책가",
        "전기수",
        "동국정운",
        "계미자",
        "형평사",
        "경시서",
        "광작",
        "상평통보",
        "공인",
        "송상",
        "만상",
        "물주",
        "당항성",
        "영암",
        "동평관",
        "쇄환사",
        "결혼도감",
        "공녀",
        "원각사지 십층 석탑",
        "인왕제색도",
        "분청사기",
        "의금부",
        "검서관",
        "양명학",
        "강화학파",
        "의산문답",
        "사상 의학",
        "이제마",
        "제물포 조약",
        "갑신정변",
        "동학 농민 운동",
        "임술 농민 봉기",
        "홍경래의 난",
        "전봉준",
        "공주 우금치",
        "교조 신원 운동",
        "사발통문",
        "집강소",
        "전주 화약",
        "조미 수호 통상 조약",
        "조불 수호 통상 조약",
        "제물포 조약",
        "을사늑약",
        "통감부",
        "독립문",
        "독립신문",
        "만민공동회",
        "헌의 6조",
        "관민공동회",
        "국채 보상 운동",
        "독립 의군부",
        "복벽주의",
        "대한 광복회",
        "신민회",
        "신흥 강습소",
        "대한민국 임시 정부",
        "독립 공채",
        "2·8 독립 선언",
        "치안 유지법",
        "105인 사건",
        "간도 참변",
        "봉오동 전투",
        "조선 의용대",
        "영릉가 전투",
        "한국 독립군",
        "대전자령 전투",
        "참의부",
        "대한 독립군",
        "양전 사업",
        "지계",
        "거문도",
        "보은 집회",
        "박규수",
        "안핵사",
        "기정진",
        "척화주전론",
        "개혁 정강",
        "태양력",
        "자신회",
        "명동 성당",
        "나석주",
        "동양 척식 주식회사",
        "러일 전쟁",
        "포츠머스 강화 조약",
        "메가타",
        "대한매일신보",
        "을사의병",
        "민종식",
        "홍주성",
        "천도교",
        "대종교",
        "원불교",
        "불교",
        "만세보",
        "중광단",
        "배재 학당",
        "박중빈",
        "사찰령 폐지 운동",
        "안창호",
        "한국통사",
        "조선학 운동",
        "여유당전서",
        "백산 상회",
        "스티븐스",
        "내무총장",
        "참의부",
        "문재철",
        "암태도 소작쟁의",
        "정약전",
        "자산어보",
        "강주룡",
        "을밀대",
        "고공농성",
        "회사령",
        "미쓰야 협정",
        "경성 제국 대학",
        "토지 조사 사업",
        "조선 사상범 예방 구금령",
        "장개석",
        "카이로 회담",
        "조선 건국 동맹",
        "건국 준비 위원회",
        "한인 애국단",
        "민족 혁명당",
        "한국광복군",
        "건국 강령",
        "김구",
        "반민족 행위 특별 조사 위원회",
        "모스크바 3국 외상 회의",
        "좌우 합작 위원회",
        "5·10 총선거",
        "여수·순천 사건",
        "발췌 개헌",
        "사사오입 개헌",
        "한미 상호 방위 조약",
        "원조 물자",
        "3·15 부정 선거",
        "4·19 혁명",
        "5·16 군사 정변",
        "베트남 파병",
        "7·4 남북 공동 성명",
        "김대중 납치 사건",
        "유신 헌법",
        "3·1 민주 구국 선언",
        "YH 무역 사건",
        "신민당사",
        "백만인 서명 운동",
        "유신 철폐",
        "부마 민주 항쟁",
        "6월 민주 항쟁",
        "6·29 민주화 선언",
        "지방 자치제",
        "금융 실명제",
        "남북 기본 합의서",
        "해동제국기",
        "하멜 표류기",
        "파리 외방 전교회",
        "혼일강리역대국도지도",
        "민족 차별 철폐",
        "노동조합 전국평의회",
        "남북 조절 위원회",
        "남북한 유엔 동시 가입",
        "이산가족 고향 방문단",
        "칠레 FTA",
        "10·4 남북 정상 선언",
    }
    terms.update(extra_terms)
    return {term for term in terms if is_good_term(term)}


def clean_term(term: str) -> str:
    term = html_entity_cleanup(term)
    term = re.sub(r"\s+", " ", term).strip(" -–—:;,.()[]{}")
    term = PARTICLE_RE.sub("", term)
    term = re.sub(r"(은|는|이|가|을|를|에|의|와|과|도|만)$", "", term)
    return term.strip()


def html_entity_cleanup(text: str) -> str:
    return (
        text.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
    )


def is_good_term(term: str) -> bool:
    if not term or len(normalize(term)) < 2:
        return False
    if term in STOPWORDS:
        return False
    if re.fullmatch(r"[0-9]+", term):
        return False
    if re.fullmatch(r"[0-9]+점", term):
        return False
    if re.search(r"[{};=<>]", term):
        return False
    return True


def raw_text_path(round_no: int) -> Path:
    return ROOT / "tmp" / "pdfs" / "columns" / f"{round_no}.txt"


def report_md_path(round_no: int) -> Path:
    return ROOT / "reports" / f"hankuksa_{round_no}_coverage_audit.md"


def report_json_path(round_no: int) -> Path:
    return ROOT / "reports" / f"hankuksa_{round_no}_coverage_audit.json"


def load_question_text(round_no: int) -> str:
    raw_text = raw_text_path(round_no)
    if raw_text.exists():
        return raw_text.read_text(encoding="utf-8")
    analyzer = load_analyzer()
    pdfs = getattr(analyzer, "PDFS", {})
    if round_no not in pdfs:
        raise ValueError(f"Unsupported Hankuksa round: {round_no}")
    return analyzer.reconstruct_pdf_text(pdfs[round_no])


def pre_explanation_lines(lines: list[str]) -> list[str]:
    selected: list[str] = []
    for line in lines:
        if "<문제 해설>" in line or "문제 해설" in line:
            break
        if line.startswith("[[PAGE"):
            continue
        selected.append(line)
    return selected


def extract_units(question) -> list[Unit]:
    units: list[Unit] = []
    current_label: str | None = None
    current_text: list[str] = []
    before_options: list[str] = []

    def flush_option() -> None:
        nonlocal current_label, current_text
        if current_label is None:
            return
        text = " ".join(current_text).strip()
        if is_textual_unit(text):
            units.append(Unit(question.number, "선지", current_label, text))
        current_label = None
        current_text = []

    for raw in pre_explanation_lines(question.lines):
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            continue
        if re.match(rf"^{question.number}\.\s+", line):
            continue
        option_match = re.match(r"^([①②③④⑤])\s*(.*)", line)
        subchoice_match = re.match(r"^([ㄱ-ㅎ])[\).]\s*(.*)", line)
        if option_match:
            flush_option()
            current_label = option_match.group(1)
            current_text = [option_match.group(2)]
            continue
        if subchoice_match:
            flush_option()
            label = subchoice_match.group(1)
            text = subchoice_match.group(2)
            if is_textual_unit(text):
                units.append(Unit(question.number, "보기", label, text))
            continue
        if current_label is not None:
            current_text.append(line)
        else:
            if is_textual_unit(line):
                before_options.append(line)
    flush_option()
    if before_options:
        text = " ".join(before_options)
        if is_textual_unit(text):
            units.insert(0, Unit(question.number, "보기/자료", "자료", text))
    return units


def extract_deep_analysis_units(round_no: int) -> dict[int, list[Unit]]:
    if not DEEP_ANALYSIS_JSON.exists():
        return {}
    data = json.loads(DEEP_ANALYSIS_JSON.read_text(encoding="utf-8"))
    units: defaultdict[int, list[Unit]] = defaultdict(list)
    for question in data.get("questions", []):
        if question.get("round") != round_no:
            continue
        number = int(question["number"])
        keywords = [
            clean_term(str(term))
            for term in question.get("keywords", [])
            if is_good_term(clean_term(str(term)))
        ]
        if keywords:
            units[number].append(Unit(number, "심층분석", "핵심어", " ".join(keywords)))
        anchors = [
            str(anchor)
            for anchor in question.get("option_anchors", [])
            if "이미지/짧은 보기" not in str(anchor)
        ]
        if anchors:
            units[number].append(Unit(number, "심층분석", "선지앵커", " ".join(anchors)))
    return units


def is_textual_unit(text: str) -> bool:
    cleaned = re.sub(r"[①②③④⑤ㄱ-ㅎ\W_]+", "", text)
    if len(cleaned) < 4:
        return False
    if re.fullmatch(r"[①②③④⑤\s]+", text):
        return False
    return True


def extract_tokens(text: str) -> list[str]:
    raw_tokens = re.findall(r"[0-9A-Za-z가-힣·.]+", text)
    tokens: list[str] = []
    for token in raw_tokens:
        token = clean_term(token)
        if is_good_term(token) and token not in tokens:
            tokens.append(token)
    return tokens


def longest_declared_terms(text: str, terms: Iterable[str]) -> list[str]:
    norm_text = normalize(text)
    found = []
    for term in terms:
        norm_term = normalize(term)
        if len(norm_term) >= 2 and norm_term in norm_text:
            found.append(term)
    found.sort(key=lambda item: (-len(normalize(item)), item))
    selected: list[str] = []
    covered_parts: list[str] = []
    for term in found:
        norm_term = normalize(term)
        if any(norm_term in part for part in covered_parts):
            continue
        selected.append(term)
        covered_parts.append(norm_term)
    return selected[:10]


def terms_for_unit(text: str, declared_terms: set[str]) -> list[str]:
    selected = longest_declared_terms(text, declared_terms)
    if selected:
        return selected
    selected_norm = " ".join(normalize(term) for term in selected)
    fallback: list[str] = []
    for token in extract_tokens(text):
        norm_token = normalize(token)
        if len(norm_token) < 2 or norm_token in selected_norm:
            continue
        fallback.append(token)
    return fallback[:5]


def source_hits(term: str, file_texts: dict[str, str]) -> list[str]:
    norm = normalize(term)
    hits = [path for path, content in file_texts.items() if norm in content]
    return hits[:6]


def audit(round_no: int = DEFAULT_ROUND) -> dict[str, object]:
    analyzer = load_analyzer()
    raw_text = load_question_text(round_no)
    questions = analyzer.split_questions(round_no, raw_text)
    corpus, file_texts = load_corpus()
    declared_terms = extract_declared_terms()
    deep_units = extract_deep_analysis_units(round_no)

    details = []
    status_counter: Counter[str] = Counter()
    missing_counter: Counter[str] = Counter()
    question_status: dict[int, str] = {}
    question_units: defaultdict[int, list[dict[str, object]]] = defaultdict(list)

    for question in questions:
        units = extract_units(question) + deep_units.get(question.number, [])
        q_statuses: list[str] = []
        for unit in units:
            terms = terms_for_unit(unit.text, declared_terms)
            term_rows = []
            covered_count = 0
            for term in terms:
                hits = source_hits(term, file_texts)
                covered = bool(hits) or normalize(term) in corpus
                if covered:
                    covered_count += 1
                else:
                    missing_counter[term] += 1
                term_rows.append({"term": term, "covered": covered, "sources": hits})
            if not term_rows:
                status = "SKIP_IMAGE_OR_NO_KEYWORD"
            elif covered_count == len(term_rows):
                status = "OK"
            elif covered_count == 0:
                status = "MISSING"
            else:
                status = "PARTIAL"
            status_counter[status] += 1
            q_statuses.append(status)
            row = {
                "question": question.number,
                "kind": unit.kind,
                "label": unit.label,
                "text": unit.text,
                "status": status,
                "terms": term_rows,
            }
            details.append(row)
            question_units[question.number].append(row)
        if any(status == "MISSING" for status in q_statuses):
            question_status[question.number] = "MISSING"
        elif any(status == "PARTIAL" for status in q_statuses):
            question_status[question.number] = "PARTIAL"
        elif q_statuses:
            question_status[question.number] = "OK"
        else:
            question_status[question.number] = "SKIP_IMAGE_OR_NO_KEYWORD"

    return {
        "source": {
            "round": round_no,
            "question_count": len(questions),
            "corpus_files": sorted(file_texts),
            "coverage_basis": "hankuksa/**/*.html + hankuksa/data/*.json",
            "image_policy": "image-only choices are skipped, but analyzer-level question keywords are included",
        },
        "summary": {
            "unit_status_counts": dict(status_counter),
            "question_status_counts": dict(Counter(question_status.values())),
            "top_missing_terms": missing_counter.most_common(80),
        },
        "question_status": question_status,
        "details": details,
        "question_units": {str(key): value for key, value in sorted(question_units.items())},
    }


def render_markdown(result: dict[str, object]) -> str:
    summary = result["summary"]
    source = result["source"]
    lines = [
        f"# 한국사능력검정 심화 {source['round']}회 선지·보기 DB 커버리지 점검",
        "",
        "이미지로만 제공된 자료는 제외하되, 심층 분석에서 추출한 문항 핵심어까지 포함해 현재 `hankuksa` 앱 데이터에 들어있는지 점검했다.",
        "",
        "## 기준",
        "",
        f"- 대상: {source['round']}회, {source['question_count']}문항",
        f"- 대조 데이터: `{source['coverage_basis']}`",
        "- 판정: 문장 완전일치가 아니라 역사 키워드 단위 포함 여부",
        "- 제외: 사진·그림·지도 자체. 단, 심층 분석에 잡힌 문항 핵심어는 별도 점검",
        "",
        "## 요약",
        "",
    ]
    unit_counts = summary["unit_status_counts"]
    question_counts = summary["question_status_counts"]
    for key in ["OK", "PARTIAL", "MISSING", "SKIP_IMAGE_OR_NO_KEYWORD"]:
        lines.append(f"- 선지·보기 단위 {key}: {unit_counts.get(key, 0)}")
    lines.append("")
    for key in ["OK", "PARTIAL", "MISSING", "SKIP_IMAGE_OR_NO_KEYWORD"]:
        lines.append(f"- 문항 단위 {key}: {question_counts.get(key, 0)}")
    lines.extend(["", "## 많이 빠진 키워드", ""])
    for term, count in summary["top_missing_terms"][:40]:
        lines.append(f"- `{term}`: {count}회")

    lines.extend(["", "## 문항별 점검", ""])
    question_units: dict[str, list[dict[str, object]]] = result["question_units"]
    question_status = result["question_status"]
    for number in range(1, 51):
        q_status = question_status.get(number, "SKIP_IMAGE_OR_NO_KEYWORD")
        lines.append(f"### {number}번 - {q_status}")
        units = question_units.get(str(number), [])
        if not units:
            lines.append("- 이미지형 또는 텍스트 키워드 없음")
            lines.append("")
            continue
        for unit in units:
            status = unit["status"]
            if status == "OK":
                continue
            lines.append(f"- {unit['kind']} {unit['label']} `{status}`: {compact_display(unit['text'])}")
            missing = [term["term"] for term in unit["terms"] if not term["covered"]]
            covered = [term["term"] for term in unit["terms"] if term["covered"]]
            if missing:
                lines.append("  - 누락 후보: " + ", ".join(f"`{term}`" for term in missing[:12]))
            if covered:
                lines.append("  - 이미 있음: " + ", ".join(f"`{term}`" for term in covered[:8]))
        if all(unit["status"] == "OK" for unit in units):
            lines.append("- 모든 텍스트 선지·보기 키워드가 현재 데이터에서 확인됨")
        lines.append("")

    lines.extend(
        [
            "## 해석 주의",
            "",
            "- `PARTIAL`은 선지의 일부 핵심어만 데이터에 있고 나머지는 빠진 상태다.",
            "- `MISSING`은 해당 선지·보기에서 뽑힌 핵심어가 현재 앱 데이터에 거의 없다는 뜻이다.",
            "- 이미지형 문화재 문제는 이미지 자체를 판독할 수 없으므로, 텍스트 선지·해설에서 추출되는 키워드만 점검했다.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("round", nargs="?", type=int, default=DEFAULT_ROUND, help="한능검 회차")
    args = parser.parse_args()
    result = audit(args.round)
    report_json_path(args.round).write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    report_md_path(args.round).write_text(render_markdown(result), encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
