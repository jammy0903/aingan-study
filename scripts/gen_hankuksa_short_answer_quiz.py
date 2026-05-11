#!/usr/bin/env python3
"""Generate short-answer Hankuksa quiz data from local question analysis.

The source analysis intentionally does not republish full exam questions. This
script turns the extracted clues, era labels, and study notes into short-answer
recall prompts for the static quiz page.
"""

from __future__ import annotations

import json
import re
import hashlib
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "reports" / "hankuksa_question_deep_analysis_59_75.json"
LESSON_FILES = sorted((ROOT / "hankuksa").glob("[0-9][0-9]/index.html"))
OUT_DIR = ROOT / "hankuksa" / "quiz"
OUT_FILE = OUT_DIR / "questions.json"
TARGET_COUNT = 1000

ERA_ALIASES = {
    "선사": ["선사 시대", "선사시대"],
    "초기 국가/고조선": ["초기 국가", "초기국가", "고조선"],
    "삼국/가야": ["삼국", "삼국 시대", "삼국시대", "가야"],
    "남북국": ["남북국 시대", "남북국시대", "통일신라와 발해", "통일 신라와 발해"],
    "고려": ["고려 시대", "고려시대"],
    "조선 전기": ["조선전기"],
    "조선 후기": ["조선후기"],
    "근대": ["근대사", "개항기"],
    "일제 강점기": ["일제강점기", "일제", "일제시대", "일제 시대"],
    "현대": ["현대사"],
}

STOP_TERMS = {
    "자료",
    "보기",
    "정답",
    "문제",
    "해설",
    "시대",
    "국가",
    "지역",
    "인물",
    "활동",
    "사료",
    "단서",
    "정책",
    "사건",
    "설명",
    "내용",
    "사실",
    "가장",
    "옳은",
    "옳지",
    "자동 추출 단서 부족",
    "이미지/짧은 보기",
    "배경",
    "전개",
    "결과",
    "의미",
    "분야",
    "장면",
    "핵심",
    "원인→결과",
    "멸망",
    "침략국",
    "전투",
    "빌미",
    "후속",
    "피해",
    "초기",
    "철수",
    "통치 변화",
    "호족·사상",
}

PERSON_TERMS = {
    "단군왕검",
    "위만",
    "우거왕",
    "주몽",
    "온조",
    "박혁거세",
    "김수로",
    "소수림왕",
    "광개토 대왕",
    "장수왕",
    "을지문덕",
    "연개소문",
    "검모잠",
    "안승",
    "근초고왕",
    "침류왕",
    "무령왕",
    "성왕",
    "계백",
    "이차돈",
    "지증왕",
    "법흥왕",
    "진흥왕",
    "선덕여왕",
    "무열왕",
    "김춘추",
    "김유신",
    "문무왕",
    "신문왕",
    "원효",
    "의상",
    "혜초",
    "장보고",
    "견훤",
    "궁예",
    "왕건",
    "태조 왕건",
    "광종",
    "성종",
    "서희",
    "강감찬",
    "윤관",
    "묘청",
    "김부식",
    "최충",
    "일연",
    "의천",
    "지눌",
    "최충헌",
    "만적",
    "공민왕",
    "신돈",
    "안향",
    "이색",
    "정몽주",
    "정도전",
    "권근",
    "이성계",
    "태조",
    "태종",
    "세종",
    "세조",
    "성종",
    "연산군",
    "중종",
    "조광조",
    "이황",
    "이이",
    "선조",
    "광해군",
    "인조",
    "효종",
    "숙종",
    "영조",
    "정조",
    "정약용",
    "박지원",
    "박제가",
    "홍대용",
    "김정호",
    "신사임당",
    "허준",
    "이순신",
    "곽재우",
    "김상헌",
    "최명길",
    "흥선대원군",
    "고종",
    "민영환",
    "최익현",
    "김홍집",
    "김옥균",
    "박영효",
    "홍영식",
    "서재필",
    "유길준",
    "전봉준",
    "손병희",
    "이준",
    "이상설",
    "이위종",
    "신돌석",
    "유인석",
    "민종식",
    "나철",
    "오기호",
    "이재명",
    "장인환",
    "전명운",
    "안중근",
    "안창호",
    "양기탁",
    "서상돈",
    "이승훈",
    "이회영",
    "이상재",
    "방정환",
    "김구",
    "이승만",
    "여운형",
    "김규식",
    "신채호",
    "박은식",
    "한용운",
    "김원봉",
    "윤봉길",
    "이봉창",
    "유관순",
    "홍범도",
    "김좌진",
    "지청천",
    "양세봉",
    "조만식",
    "박정희",
    "전두환",
    "노태우",
    "김영삼",
    "김대중",
}

PERSON_ALIASES = {
    "왕건": ["태조 왕건", "고려 태조"],
    "태조 왕건": ["왕건", "고려 태조"],
    "이성계": ["태조 이성계", "조선 태조"],
    "세종": ["세종대왕"],
    "흥선대원군": ["대원군"],
    "광개토 대왕": ["광개토대왕", "광개토태왕"],
    "김춘추": ["무열왕", "태종 무열왕"],
    "무열왕": ["김춘추", "태종 무열왕"],
    "정조": ["정조대왕"],
}

NOISY_TEXT_MARKERS = (
    "통합 연표",
    "근현대는",
    "별도 연표",
    "한 줄로 비교",
    "보기 키워드",
    "오답",
    "선지",
    "헷갈릴 때",
    "가리키는 왕",
    "왕을 확정",
    "업적 제거",
    "시험 포인트",
    "시험포인트",
    "포인트",
    "묻는다",
    "장면",
    "같은 키워드",
    "암기어",
    "연결해서 기억",
    "순서로 잡는다",
)

ACHIEVEMENT_NOISE = (
    "문제",
    "선지",
    "오답",
    "헷갈",
    "흐름",
    "카드",
    "비교",
    "떠올",
    "확인",
    "구분",
    "먼저",
    "가리키는 왕",
    "왕을 확정",
    "업적 제거",
    "시험 포인트",
    "시험포인트",
    "포인트",
    "묻는다",
    "장면",
    "같은 키워드",
    "암기어",
    "연결해서 기억",
    "순서로 잡는다",
)


def is_single_answer(value: str) -> bool:
    value = normalize_term(value)
    if not value:
        return False
    if re.search(r"(과|와)\s+", value):
        return False
    if "/" in value:
        return False
    if re.search(r"(?<!\d)·|·(?!\d)", value):
        return False
    if " vs " in value.lower():
        return False
    return True


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", "", value or "")
    value = value.replace("`", "")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def normalize_term(value: str) -> str:
    value = clean_text(value)
    value = re.sub(r"^[①②③④⑤]\s*", "", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip(" .,;:/·-")


def short_answer_label(answer: str) -> str:
    answer = re.sub(r" 시대 도구와 생활$", " 시대", answer)
    if answer.endswith("의 체제 정비"):
        return answer.removesuffix("의 체제 정비")
    if answer.endswith("의 정복 활동"):
        return answer.removesuffix("의 정복 활동")
    if answer.endswith("의 영토 확장"):
        return answer.removesuffix("의 영토 확장")
    if answer.endswith("의 개혁"):
        return answer.removesuffix("의 개혁")
    return answer


def useful_term(term: str) -> bool:
    term = normalize_term(term)
    if term in STOP_TERMS:
        return False
    if len(term) < 2 or len(term) > 24:
        return False
    if re.fullmatch(r"[0-9~.\-년월일 ]+", term):
        return False
    if "," in term and len(term.split(",")) > 2:
        return False
    return True


def aliases_for(answer: str) -> list[str]:
    aliases: list[str] = []
    aliases.extend(PERSON_ALIASES.get(answer, []))
    if answer in ERA_ALIASES:
        aliases.extend(ERA_ALIASES[answer])
    if "/" in answer:
        aliases.extend(part.strip() for part in answer.split("/") if part.strip())
    paren = re.sub(r"\([^)]*\)", "", answer).strip()
    if paren and paren != answer:
        aliases.append(paren)
    if re.fullmatch(r"\d{3,4}", answer):
        aliases.append(f"{answer}년")
    date_match = re.fullmatch(r"(\d{3,4})\.(\d{1,2})(?:\.(\d{1,2}))?", answer)
    if date_match:
        year, month, day = date_match.groups()
        aliases.append(year)
        aliases.append(f"{year}년")
        aliases.append(f"{year}년 {int(month)}월")
        if day:
            aliases.append(f"{year}년 {int(month)}월 {int(day)}일")
    range_match = re.fullmatch(r"(\d{3,4})~(\d{3,4})", answer)
    if range_match:
        start, end = range_match.groups()
        aliases.append(f"{start}년~{end}년")
        aliases.append(f"{start}~{end}년")
    if answer == "과거":
        aliases.append("과거제")
    # Preserve order while deduplicating.
    seen = set()
    return [a for a in aliases if not (a in seen or seen.add(a))]


def strip_hint_noise(text: str) -> str:
    text = clean_text(text)
    patterns = [
        r"^헷갈릴 때는 흐름으로 끊어 봐\.\s*",
        r"^결과까지 이어서 보면 더 선명해져\.\s*",
        r"^이 이야기는 .*? 장면이야\.\s*",
        r"여기서는 사건 이름만 외우면 금방 헷갈려\.\s*",
        r"먼저 앞 상황을 잡고, 그 상황이 어떤 선택이나 충돌을 만들었는지 본 다음, 그 결과가 다음 시대로 어떻게 이어졌는지를 따라가면 돼\.\s*",
    ]
    for pattern in patterns:
        text = re.sub(pattern, "", text)
    return text.strip()


def answer_in_text(answer: str, text: str) -> bool:
    compact_answer = re.sub(r"\s+", "", answer)
    compact_text = re.sub(r"\s+", "", text)
    return bool(compact_answer) and compact_answer in compact_text


def clue_allowed(clue: str, answer: str) -> bool:
    clue = normalize_term(strip_hint_noise(clue))
    if not useful_term(clue):
        return False
    if answer_in_text(answer, clue) or answer_in_text(clue, answer):
        return False
    return True


def split_clues(text: str, answer: str) -> list[str]:
    text = strip_hint_noise(text)
    text = re.sub(r"^[^:：]{1,8}[:：]\s*", "", text)
    parts = re.split(r"\s*(?:/|→|,|;|·|\n|\.)\s*", text)
    clues: list[str] = []
    for part in parts:
        part = re.sub(r"^[가-힣A-Za-z0-9 ]{1,8}[:：]\s*", "", part).strip()
        part = part.strip(" -")
        if clue_allowed(part, answer):
            clues.append(part)
    return clues


def direct_clues(*groups: list[str], answer: str, limit: int = 6) -> list[str]:
    out: list[str] = []
    for group in groups:
        for clue in group:
            clue = normalize_term(strip_hint_noise(clue))
            if not clue_allowed(clue, answer):
                continue
            if clue not in out:
                out.append(clue)
            if len(out) >= limit:
                return out
    return out


def sorted_person_terms() -> list[str]:
    return sorted(PERSON_TERMS, key=lambda value: (-len(value), value))


def person_present(text: str, person: str) -> bool:
    if " " in person:
        return re.sub(r"\s+", "", person) in re.sub(r"\s+", "", text)
    return person in text


def persons_in_text(text: str) -> list[str]:
    found: list[str] = []
    for person in sorted_person_terms():
        if not person_present(text, person):
            continue
        if any(person_present(old, person) for old in found):
            continue
        found.append(person)
    return found


def is_king_term(person: str) -> bool:
    return person.endswith("왕") or person in {
        "태조",
        "태종",
        "세종",
        "세조",
        "성종",
        "연산군",
        "중종",
        "선조",
        "광해군",
        "인조",
        "효종",
        "숙종",
        "영조",
        "정조",
        "고종",
        "광종",
    }


def split_sentences(text: str) -> list[str]:
    text = strip_hint_noise(text)
    text = re.sub(r"【[^】]+】", ". ", text)
    pieces = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [clean_achievement_sentence(piece) for piece in pieces if clean_text(piece)]


def clean_achievement_sentence(sentence: str) -> str:
    sentence = clean_text(sentence).strip(" .")
    sentence = re.sub(r"^그다음 핵심 전개를 보면,\s*", "", sentence)
    sentence = re.sub(r"^그다음 핵심 전개를 보면\s*", "", sentence)
    sentence = re.sub(r"^이때\s*", "", sentence)
    return sentence.strip(" .")


def person_sentence_allowed(sentence: str, person: str) -> bool:
    if len(sentence) < 14 or len(sentence) > 140:
        return False
    if any(marker in sentence for marker in NOISY_TEXT_MARKERS):
        return False
    if any(marker in sentence for marker in ACHIEVEMENT_NOISE):
        return False
    if len(persons_in_text(sentence)) > 2:
        return False
    action_markers = (
        "설치",
        "시행",
        "편찬",
        "저술",
        "창제",
        "창건",
        "건립",
        "수립",
        "파견",
        "정비",
        "개혁",
        "철폐",
        "중건",
        "발행",
        "공인",
        "정복",
        "천도",
        "수복",
        "주장",
        "조직",
        "창립",
        "의거",
        "봉기",
        "전투",
        "등용",
        "작성",
        "선포",
        "발표",
        "반대",
        "건국",
        "집권",
        "즉위",
        "체결",
        "운영",
        "활동",
        "도입",
        "폐지",
        "강화",
        "회복",
    )
    return any(marker in sentence for marker in action_markers)


def blank_person(sentence: str, person: str) -> str:
    variants = [person, *PERSON_ALIASES.get(person, [])]
    variants = sorted(variants, key=lambda value: -len(value))
    out = sentence
    for variant in variants:
        pattern = re.escape(variant).replace(r"\ ", r"\s*")
        out, count = re.subn(pattern, "____", out)
        if count:
            return out
    return sentence.replace(person, "____", 1)


def clean_event_name(value: str) -> str:
    value = clean_text(value)
    value = re.split(r"[.!?]\s*|\s→\s|\s-\s|[:：]", value)[-1]
    value = re.sub(r"^(과|와|및|또는|그리고|그래서)\s*", "", value)
    value = re.sub(r"^.*직후\s+", "", value)
    value = re.sub(r"^(사건|정책|개혁|순서|흐름|핵심|시기|연도)\s*[:：]\s*", "", value)
    value = normalize_term(value)
    return value


def extract_dated_events(text: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    generic_events = {
        "해산",
        "폐위",
        "공포",
        "발행",
        "설립",
        "설치",
        "공인",
        "수용",
        "체결",
        "파견",
        "반포",
        "집권",
    }
    event_markers = (
        "조약",
        "운동",
        "전쟁",
        "양요",
        "박해",
        "사변",
        "정변",
        "군란",
        "개혁",
        "의병",
        "의거",
        "전투",
        "대첩",
        "천도",
        "설립",
        "반포",
        "공인",
        "수용",
        "건국",
        "수립",
        "창립",
        "설치",
        "체결",
        "파견",
        "사건",
        "봉기",
        "화약",
        "조서",
        "협약",
        "늑약",
        "합방",
        "병합",
        "토벌",
        "발행",
        "중건",
        "폐위",
        "해산",
        "공포",
    )
    pattern = re.compile(r"([가-힣A-Za-z0-9·\s제차을갑병신정경러한미일중청국대한민국임시정부]+?)\((\d{3,4}(?:\.\d{1,2})?(?:~\d{3,4}(?:\.\d{1,2})?)?)\)")
    for match in pattern.finditer(text):
        event = clean_event_name(match.group(1))
        date_value = normalize_term(match.group(2))
        if not event or not date_value:
            continue
        if not is_single_answer(event):
            continue
        if event in PERSON_TERMS:
            continue
        if event in generic_events:
            continue
        if not any(marker in event for marker in event_markers):
            continue
        if len(event) < 2 or len(event) > 24:
            continue
        out.append((event, date_value))
    return out


def dated_kind_and_prompt(event: str, date_value: str) -> tuple[str, str]:
    if re.fullmatch(r"\d{3,4}", date_value):
        return "연도 맞히기", f"'{event}'이/가 일어난 연도를 쓰세요."
    return "시기 맞히기", f"'{event}'이/가 일어난 시기를 쓰세요."


def source_label(question: dict) -> str:
    return f"{question['round']}회 {question['number']}번"


def infer_era(question: dict, explanation: str = "") -> str:
    era = question.get("era") or "미분류"
    if era != "미분류":
        return era
    blob = " ".join(
        [
            explanation,
            question.get("stem_snippet") or "",
            " ".join(question.get("keywords") or []),
            " ".join(question.get("special_notes") or []),
        ]
    )
    rules = [
        ("조선 후기", ("정조", "규장각", "장용영", "신해통공", "영조", "균역법")),
        ("고려", ("고려", "광종", "공민왕", "무신", "삼별초", "팔만대장경")),
        ("남북국", ("발해", "신문왕", "통일신라", "장보고", "청해진")),
        ("초기 국가/고조선", ("고조선", "위만", "우거왕", "한사군")),
        ("일제 강점기", ("일제", "신간회", "3.1", "대한민국 임시정부")),
    ]
    for label, terms in rules:
        if any(term in blob for term in terms):
            return label
    return era


def make_item(
    *,
    qid: str,
    kind: str,
    prompt: str,
    answer: str,
    clues: list[str],
    question: dict,
    explanation: str,
) -> dict:
    raw_answer = normalize_term(answer)
    answer = short_answer_label(raw_answer)
    aliases = aliases_for(answer)
    if raw_answer != answer:
        aliases.append(raw_answer)
    return {
        "id": qid,
        "kind": kind,
        "prompt": clean_text(prompt),
        "answer": answer,
        "aliases": list(dict.fromkeys(aliases)),
        "clues": [normalize_term(c) for c in clues if useful_term(c)][:6],
        "era": infer_era(question, explanation),
        "type": question.get("type") or "기출 단서",
        "round": question.get("round"),
        "number": question.get("number"),
        "source": source_label(question),
        "explanation": clean_text(explanation),
    }


def make_concept_item(
    *,
    qid: str,
    kind: str,
    prompt: str,
    answer: str,
    clues: list[str],
    era: str,
    source: str,
    explanation: str,
) -> dict:
    raw_answer = normalize_term(answer)
    answer = short_answer_label(raw_answer)
    aliases = aliases_for(answer)
    if raw_answer != answer:
        aliases.append(raw_answer)
    return {
        "id": qid,
        "kind": kind,
        "prompt": clean_text(prompt),
        "answer": answer,
        "aliases": list(dict.fromkeys(aliases)),
        "clues": [normalize_term(c) for c in clues if useful_term(c)][:6],
        "era": era,
        "type": "개념 회상",
        "round": None,
        "number": None,
        "source": source,
        "explanation": clean_text(explanation),
    }


def cloze_text(text: str, term: str) -> str:
    text = clean_text(text)
    pattern = re.escape(term)
    return re.sub(pattern, "____", text, count=1)


def pick_cloze_terms(text: str, keywords: list[str]) -> list[str]:
    terms = [normalize_term(k) for k in keywords if useful_term(k)]
    terms = [t for t in terms if t and t in text]
    terms.sort(key=lambda value: (-len(value), value))
    picked: list[str] = []
    for term in terms:
        if any(term in existing or existing in term for existing in picked):
            continue
        picked.append(term)
        if len(picked) == 2:
            break
    return picked


def extract_json_array_after(source: str, marker: str) -> list[dict]:
    pos = source.find(marker)
    if pos < 0:
        return []
    start = source.find("[", pos)
    if start < 0:
        return []

    depth = 0
    in_string = False
    escaped = False
    for idx in range(start, len(source)):
        ch = source[idx]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return json.loads(source[start : idx + 1])
    return []


def era_from_lesson_file(path: Path) -> str:
    labels = {
        "01": "선사/초기 국가",
        "02": "삼국/남북국",
        "03": "고려",
        "04": "조선",
        "05": "근대",
        "06": "일제 강점기",
        "07": "현대",
    }
    return labels.get(path.parent.name, path.parent.name)


def build_concept_candidates() -> list[dict]:
    items: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for path in LESSON_FILES:
        lessons = extract_json_array_after(path.read_text(encoding="utf-8"), "const LESSONS =")
        era = era_from_lesson_file(path)
        unit = path.parent.name
        for lesson in lessons:
            chapter = lesson.get("chapter") or era
            for concept in lesson.get("items") or []:
                title = normalize_term(concept.get("title") or "")
                keywords = [normalize_term(k) for k in concept.get("keywords", []) if useful_term(k)]
                answer = ""
                if title and len(keywords) >= 2:
                    answer = short_answer_label(title)
                    if not is_single_answer(answer):
                        answer = ""
                if answer and len(keywords) >= 2:
                    clues = direct_clues(keywords, answer=answer)
                    if len(clues) < 2:
                        continue
                    prompt = "다음 단서들이 가리키는 개념을 고르세요."
                    key = (prompt + "|".join(clues), answer)
                    if key not in seen:
                        seen.add(key)
                        items.append(
                            make_concept_item(
                                qid=f"k-{unit}-{len(items)}",
                                kind="개념 객관식",
                                prompt=prompt,
                                answer=answer,
                                clues=clues,
                                era=era,
                                source=f"{unit}권 개념카드 · {chapter}",
                                explanation=concept.get("explanation")
                                or concept.get("background")
                                or concept.get("why")
                                or title,
                            )
                        )

    return items


def add_person_candidates_from_text(
    *,
    items: list[dict],
    seen: set[tuple[str, str, str]],
    text: str,
    keywords: list[str],
    era: str,
    source: str,
    qid_prefix: str,
) -> None:
    for sentence_idx, sentence in enumerate(split_sentences(text)):
        people = persons_in_text(sentence)
        if not people:
            continue
        for person in people[:1]:
            if not person_sentence_allowed(sentence, person):
                continue
            blanked = blank_person(sentence, person)
            fragments = [
                normalize_term(part)
                for part in re.split(r"\s*(?:,|·|;|/|및|그리고)\s*", blanked)
                if "____" not in part
            ]
            clues = direct_clues(fragments, keywords, answer=person)
            if len(clues) < 2:
                continue
            kind = "왕 업적" if is_king_term(person) else "인물 업적"
            if kind == "왕 업적":
                prompt = f"다음 업적을 한 왕을 쓰세요. {blanked}"
            else:
                prompt = f"다음 활동을 한 인물을 쓰세요. {blanked}"
            key = (kind, person, prompt)
            if key in seen:
                continue
            seen.add(key)
            items.append(
                make_concept_item(
                    qid=f"{qid_prefix}-p-{len(items)}-{sentence_idx}",
                    kind=kind,
                    prompt=prompt,
                    answer=person,
                    clues=clues,
                    era=era,
                    source=source,
                    explanation=sentence,
                )
            )


def add_dated_candidates_from_text(
    *,
    items: list[dict],
    seen: set[tuple[str, str, str]],
    text: str,
    keywords: list[str],
    era: str,
    source: str,
    qid_prefix: str,
) -> None:
    for event_idx, (event, date_value) in enumerate(extract_dated_events(text)):
        kind, prompt = dated_kind_and_prompt(event, date_value)
        clues = direct_clues([event], keywords, answer=date_value, limit=4)
        key = (kind, event, date_value)
        if key in seen:
            continue
        seen.add(key)
        items.append(
            make_concept_item(
                qid=f"{qid_prefix}-d-{len(items)}-{event_idx}",
                kind=kind,
                prompt=prompt,
                answer=date_value,
                clues=clues,
                era=era,
                source=source,
                explanation=f"{event}: {date_value}",
            )
        )


def build_targeted_candidates(questions: list[dict]) -> tuple[list[dict], list[dict]]:
    person_items: list[dict] = []
    date_items: list[dict] = []
    person_seen: set[tuple[str, str, str]] = set()
    date_seen: set[tuple[str, str, str]] = set()

    for question in questions:
        keywords = [normalize_term(k) for k in question.get("keywords", []) if useful_term(k)]
        source = source_label(question)
        texts = []
        texts.extend(question.get("special_notes") or [])
        if question.get("study_link"):
            texts.append(question["study_link"])
        for idx, text in enumerate(texts):
            add_person_candidates_from_text(
                items=person_items,
                seen=person_seen,
                text=text,
                keywords=keywords,
                era=infer_era(question, text),
                source=source,
                qid_prefix=f"q-{question['round']}-{question['number']}-{idx}",
            )
            add_dated_candidates_from_text(
                items=date_items,
                seen=date_seen,
                text=text,
                keywords=keywords,
                era=infer_era(question, text),
                source=source,
                qid_prefix=f"q-{question['round']}-{question['number']}-{idx}",
            )

    for path in LESSON_FILES:
        lessons = extract_json_array_after(path.read_text(encoding="utf-8"), "const LESSONS =")
        era = era_from_lesson_file(path)
        unit = path.parent.name
        for lesson_idx, lesson in enumerate(lessons):
            chapter = lesson.get("chapter") or era
            for concept_idx, concept in enumerate(lesson.get("items") or []):
                title = normalize_term(concept.get("title") or "")
                keywords = [normalize_term(k) for k in concept.get("keywords", []) if useful_term(k)]
                texts = [
                    title,
                    " ".join(keywords),
                    concept.get("background") or "",
                    concept.get("explanation") or "",
                    concept.get("why") or "",
                    concept.get("trap") or "",
                ]
                for row in concept.get("table") or []:
                    texts.append(" / ".join(clean_text(str(value)) for value in row.values()))
                for text_idx, text in enumerate(texts):
                    if not text:
                        continue
                    source = f"{unit}권 개념카드 · {chapter}"
                    qid_prefix = f"l-{unit}-{lesson_idx}-{concept_idx}-{text_idx}"
                    add_person_candidates_from_text(
                        items=person_items,
                        seen=person_seen,
                        text=text,
                        keywords=keywords,
                        era=era,
                        source=source,
                        qid_prefix=qid_prefix,
                    )
                    add_dated_candidates_from_text(
                        items=date_items,
                        seen=date_seen,
                        text=text,
                        keywords=keywords,
                        era=era,
                        source=source,
                        qid_prefix=qid_prefix,
                    )

    return person_items, date_items


def build_candidates(questions: list[dict]) -> list[dict]:
    cloze_items: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for question in questions:
        keywords = [normalize_term(k) for k in question.get("keywords", []) if useful_term(k)]
        explanation_pool = []
        explanation_pool.extend(question.get("special_notes") or [])
        if question.get("study_link"):
            explanation_pool.append(question["study_link"])

        for idx, text in enumerate(explanation_pool):
            text = clean_text(text)
            if len(text) < 18:
                continue
            if "통합 연표에서 검색" in text:
                continue
            for term in pick_cloze_terms(text, keywords):
                clean_hint = strip_hint_noise(cloze_text(text, term))
                other_clues = direct_clues(keywords, answer=term)
                if len(other_clues) < 2:
                    continue
                prompt = f"다음 문장의 빈칸에 들어갈 말을 쓰세요. {clean_hint}"
                key = (prompt + "|".join(other_clues), term)
                if key in seen:
                    continue
                seen.add(key)
                cloze_items.append(
                    make_item(
                        qid=f"c-{question['round']}-{question['number']}-{idx}-{len(cloze_items)}",
                        kind="빈칸 단답",
                        prompt=prompt,
                        answer=term,
                        clues=other_clues,
                        question=question,
                        explanation=text,
                    )
                )

    return cloze_items


def interleave_by(items: list[dict], field: str) -> list[dict]:
    buckets: dict[str, list[dict]] = {}
    order: list[str] = []
    for item in items:
        key = str(item.get(field) or "기타")
        if key not in buckets:
            buckets[key] = []
            order.append(key)
        buckets[key].append(item)

    mixed: list[dict] = []
    while any(buckets[key] for key in order):
        for key in order:
            if buckets[key]:
                mixed.append(buckets[key].pop(0))
    return mixed


def balanced_sample(cloze_items: list[dict], concept_items: list[dict]) -> list[dict]:
    picked = interleave_by(cloze_items, "kind")
    if len(picked) < TARGET_COUNT:
        extra = interleave_by(concept_items, "era")
        picked.extend(extra[: TARGET_COUNT - len(picked)])
    return picked[:TARGET_COUNT]


def unique_answers(items: list[dict]) -> list[str]:
    answers: list[str] = []
    seen: set[str] = set()
    for item in items:
        answer = normalize_term(item.get("answer") or "")
        if not answer:
            continue
        key = re.sub(r"\s+", "", answer)
        if key in seen:
            continue
        seen.add(key)
        answers.append(answer)
    return answers


def stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def build_choices_for(item: dict, all_items: list[dict]) -> list[str]:
    answer = item["answer"]
    same_kind_era = [
        other
        for other in all_items
        if other is not item and other.get("kind") == item.get("kind") and other.get("era") == item.get("era")
    ]
    same_kind = [
        other
        for other in all_items
        if other is not item and other.get("kind") == item.get("kind")
    ]
    pool = unique_answers(same_kind_era) + unique_answers(same_kind)
    distractors: list[str] = []
    seen = {re.sub(r"\s+", "", answer)}
    for value in sorted(pool, key=lambda v: stable_hash(f"{item['answer']}|{item['prompt']}|{v}")):
        key = re.sub(r"\s+", "", value)
        if key in seen:
            continue
        seen.add(key)
        distractors.append(value)
        if len(distractors) == 3:
            break
    if len(distractors) < 3:
        return []
    choices = [answer, *distractors]
    return sorted(choices, key=lambda v: stable_hash(f"{item['prompt']}|{v}"))


def add_choices(items: list[dict]) -> None:
    choice_kinds = {"왕 업적", "인물 업적", "개념 객관식", "시기 맞히기"}
    for item in items:
        if item.get("kind") not in choice_kinds:
            continue
        choices = build_choices_for(item, items)
        if len(choices) == 4:
            item["choices"] = choices
            item["prompt"] = item["prompt"].replace("쓰세요.", "고르세요.")


def main() -> None:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    person_items, date_items = build_targeted_candidates(data["questions"])
    concept_items = build_concept_candidates()
    questions = balanced_sample(person_items + date_items, concept_items)
    add_choices(questions)

    # Stable display ids after sampling.
    for idx, item in enumerate(questions, 1):
        item["id"] = f"hq-{idx:04d}"

    out = {
        "meta": {
            "title": "한능검 심화 단답형 기출 퀴즈",
            "generated_at": date.today().isoformat(),
            "source": "한국사능력검정 심화 59~75회 문항별 딥 분석",
            "supplement": "hankuksa 01~07 개념카드",
            "source_question_count": len(data["questions"]),
            "quiz_count": len(questions),
            "kinds": {
                kind: sum(1 for q in questions if q["kind"] == kind)
                for kind in sorted({q["kind"] for q in questions})
            },
        },
        "questions": questions,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_FILE.relative_to(ROOT)}: {len(questions)} questions")
    print(f"Candidates: person={len(person_items)}, date={len(date_items)}, concept={len(concept_items)}")


if __name__ == "__main__":
    main()
