#!/usr/bin/env python3
"""Generate short-answer Hankuksa quiz data from local question analysis.

The source analysis intentionally does not republish full exam questions. This
script turns the extracted clues, era labels, and study notes into short-answer
recall prompts for the static quiz page.
"""

from __future__ import annotations

import json
import re
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
    if answer in ERA_ALIASES:
        aliases.extend(ERA_ALIASES[answer])
    if "/" in answer:
        aliases.extend(part.strip() for part in answer.split("/") if part.strip())
    paren = re.sub(r"\([^)]*\)", "", answer).strip()
    if paren and paren != answer:
        aliases.append(paren)
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
                if title and len(keywords) >= 2:
                    answer = short_answer_label(title)
                    clues = direct_clues(keywords, answer=answer)
                    if len(clues) < 2:
                        continue
                    prompt = "단서를 보고 핵심 인물·사건·제도를 쓰세요."
                    key = (prompt + "|".join(clues), answer)
                    if key not in seen:
                        seen.add(key)
                        items.append(
                            make_concept_item(
                                qid=f"k-{unit}-{len(items)}",
                                kind="개념 단답",
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

                for row_idx, row in enumerate(concept.get("table") or []):
                    answer = normalize_term(row.get("시험포인트") or "")
                    story = clean_text(row.get("스토리") or "")
                    if not useful_term(answer) or len(story) < 12:
                        continue
                    clues = direct_clues(
                        split_clues(story, answer),
                        [title],
                        keywords,
                        answer=answer,
                    )
                    if len(clues) < 2:
                        continue
                    prompt = "단서를 보고 시험 포인트를 쓰세요."
                    key = (prompt + "|".join(clues), answer)
                    if key in seen:
                        continue
                    seen.add(key)
                    items.append(
                        make_concept_item(
                            qid=f"t-{unit}-{len(items)}-{row_idx}",
                            kind="시험포인트",
                            prompt=prompt,
                            answer=answer,
                            clues=clues,
                            era=era,
                            source=f"{unit}권 개념카드 · {chapter}",
                            explanation=story,
                        )
                    )

    return items


def build_candidates(questions: list[dict]) -> tuple[list[dict], list[dict]]:
    cloze_items: list[dict] = []
    era_items: list[dict] = []
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
                other_clues = direct_clues([clean_hint], keywords, answer=term)
                if len(other_clues) < 2:
                    continue
                prompt = "단서를 보고 핵심어를 쓰세요."
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

        era = question.get("era")
        if era and era != "미분류" and len(keywords) >= 2:
            prompt = "다음 기출 단서들이 가리키는 시대/주제를 단답으로 쓰세요."
            key = (f"{question['round']}-{question['number']}", era)
            if key not in seen:
                seen.add(key)
                era_items.append(
                    make_item(
                        qid=f"e-{question['round']}-{question['number']}",
                        kind="시대/주제",
                        prompt=prompt,
                        answer=era,
                        clues=keywords,
                        question=question,
                        explanation=question.get("study_link")
                        or "핵심 단서로 시대와 주제를 먼저 고정한 뒤 선지를 제거한다.",
                    )
                )

    return cloze_items, era_items


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


def balanced_sample(
    cloze_items: list[dict], era_items: list[dict], concept_items: list[dict]
) -> list[dict]:
    target_cloze = min(220, len(cloze_items))
    target_era = min(250, len(era_items))
    picked = cloze_items[:target_cloze]
    picked.extend(era_items[:target_era])
    if len(picked) < TARGET_COUNT:
        extra = interleave_by(concept_items, "era") + era_items[target_era:]
        picked.extend(extra[: TARGET_COUNT - len(picked)])
    return picked[:TARGET_COUNT]


def main() -> None:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    cloze_items, era_items = build_candidates(data["questions"])
    concept_items = build_concept_candidates()
    questions = balanced_sample(cloze_items, era_items, concept_items)

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
                "빈칸 단답": sum(1 for q in questions if q["kind"] == "빈칸 단답"),
                "시대/주제": sum(1 for q in questions if q["kind"] == "시대/주제"),
                "개념 보강": sum(1 for q in questions if q["kind"].startswith("개념") or q["kind"] == "시험포인트"),
            },
        },
        "questions": questions,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_FILE.relative_to(ROOT)}: {len(questions)} questions")
    print(f"Candidates: cloze={len(cloze_items)}, era={len(era_items)}, concept={len(concept_items)}")


if __name__ == "__main__":
    main()
