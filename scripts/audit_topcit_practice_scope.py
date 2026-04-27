#!/usr/bin/env python3
import csv
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "topcit_json_v2"
REPORTS = ROOT / "reports"

STOPWORDS = {
    "다음", "설명", "해당", "용어", "적으시오", "보기", "빈칸", "알맞은", "무엇", "무엇인가",
    "개념", "특징", "종류", "유형", "방법", "경우", "중", "가장", "것을", "것은", "이를",
    "통해", "위해", "대한", "에서", "으로", "하는", "한다", "있다", "된다", "또는", "그리고",
    "the", "and", "or", "to", "of", "in", "for", "is", "are", "a", "an",
}


def iter_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from iter_strings(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key in {"priority", "priority_evidence", "sources"}:
                continue
            yield from iter_strings(item)


def tokenize(text):
    raw = re.findall(r"[A-Za-z][A-Za-z0-9+#.-]*|[가-힣A-Za-z0-9]{2,}", text.lower())
    tokens = []
    for token in raw:
        token = token.strip("-_.")
        if len(token) < 2 or token in STOPWORDS:
            continue
        tokens.append(token)
    return tokens


def load_scope_docs():
    docs_by_subject = {}
    all_docs = []
    for path in sorted(DATA.glob("topcit_0[1-6].json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        subject_id = data["id"]
        subject_title = data["title"]
        docs = []
        for chapter in data["chapters"]:
            for section in chapter["sections"]:
                for concept in section.get("concepts", []):
                    text = " ".join(iter_strings(concept))
                    title = concept.get("title", "")
                    keywords = concept.get("keywords", [])
                    doc = {
                        "subject_id": subject_id,
                        "subject_title": subject_title,
                        "chapter": chapter["title"],
                        "section": section["title"],
                        "title": title,
                        "keywords": keywords,
                        "text": f"{subject_title} {chapter['title']} {section['title']} {text}",
                    }
                    docs.append(doc)
                    all_docs.append(doc)
        docs_by_subject[subject_id] = docs
    return docs_by_subject, all_docs


def build_idf(docs):
    df = Counter()
    for doc in docs:
        df.update(set(tokenize(doc["text"])))
    total = len(docs)
    return {token: math.log((total + 1) / (count + 1)) + 1 for token, count in df.items()}


def vector(tokens, idf):
    counts = Counter(tokens)
    return {token: count * idf.get(token, 1.0) for token, count in counts.items()}


def cosine(a, b):
    common = set(a) & set(b)
    numerator = sum(a[token] * b[token] for token in common)
    if numerator == 0:
        return 0.0
    norm_a = math.sqrt(sum(value * value for value in a.values()))
    norm_b = math.sqrt(sum(value * value for value in b.values()))
    return numerator / (norm_a * norm_b)


def phrase_bonus(question_text, doc):
    haystack = doc["text"].lower()
    q = question_text.lower()
    bonus = 0.0
    if doc["title"] and doc["title"].lower() in q:
        bonus += 0.08
    for keyword in doc["keywords"]:
        kw = str(keyword).lower()
        if len(kw) >= 2 and kw in q:
            bonus += 0.035
    answer_match = 0.0
    return min(bonus + answer_match, 0.25)


def classify(best_score, same_subject_score, cross_subject_id):
    if best_score >= 0.155:
        return "IN_SCOPE"
    if best_score >= 0.105:
        return "REVIEW"
    if same_subject_score >= 0.095 and cross_subject_id:
        return "REVIEW"
    return "LIKELY_OVER_SCOPE"


def main():
    REPORTS.mkdir(exist_ok=True)
    practice = json.loads((DATA / "topcit_practice.json").read_text(encoding="utf-8"))
    docs_by_subject, all_docs = load_scope_docs()
    idf = build_idf(all_docs)

    doc_vectors = {}
    for doc in all_docs:
        key = (doc["subject_id"], doc["chapter"], doc["section"], doc["title"])
        doc_vectors[key] = vector(tokenize(doc["text"]), idf)

    rows = []
    summary = Counter()
    subject_summary = defaultdict(Counter)

    for q in practice["questions"]:
        subject_id = q["id"].split("-")[1]
        question_text = " ".join([
            q.get("topic", ""),
            q.get("question", ""),
            " ".join(q.get("choices", [])),
            q.get("answer", ""),
            q.get("explanation", ""),
        ])
        q_vec = vector(tokenize(question_text), idf)

        ranked = []
        for doc in all_docs:
            key = (doc["subject_id"], doc["chapter"], doc["section"], doc["title"])
            score = cosine(q_vec, doc_vectors[key]) + phrase_bonus(question_text, doc)
            if doc["subject_id"] == subject_id:
                score += 0.015
            ranked.append((score, doc))
        ranked.sort(key=lambda item: item[0], reverse=True)

        best_score, best_doc = ranked[0]
        same_subject = [item for item in ranked if item[1]["subject_id"] == subject_id]
        same_score, same_doc = same_subject[0]
        cross_subject_id = best_doc["subject_id"] if best_doc["subject_id"] != subject_id else ""
        status = classify(best_score, same_score, cross_subject_id)

        q_tokens = set(tokenize(question_text))
        scope_tokens = set(tokenize(same_doc["text"]))
        missing_terms = sorted(
            token for token in q_tokens - scope_tokens
            if len(token) >= 4 and not token.isdigit()
        )[:18]

        row = {
            "id": q["id"],
            "status": status,
            "score": f"{best_score:.3f}",
            "same_subject_score": f"{same_score:.3f}",
            "topic": q.get("topic", ""),
            "answer": q.get("answer", "").replace("\n", " / "),
            "matched_subject": best_doc["subject_title"],
            "matched_chapter": best_doc["chapter"],
            "matched_section": best_doc["section"],
            "matched_concept": best_doc["title"],
            "same_subject_concept": same_doc["title"],
            "cross_subject_match": cross_subject_id,
            "missing_terms": ", ".join(missing_terms),
            "question": q.get("question", "").replace("\n", " "),
        }
        rows.append(row)
        summary[status] += 1
        subject_summary[subject_id][status] += 1

    csv_path = REPORTS / "topcit_practice_scope_audit.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    md_path = REPORTS / "topcit_practice_scope_audit.md"
    with md_path.open("w", encoding="utf-8") as fh:
        fh.write("# TOPCIT 예상문제 범위 대조 리포트\n\n")
        fh.write("기준: `topcit_json_v2/topcit_01.json` ~ `topcit_06.json`에 DB화된 범위 내용.\n\n")
        fh.write("## 판정 요약\n\n")
        for status in ["IN_SCOPE", "REVIEW", "LIKELY_OVER_SCOPE"]:
            fh.write(f"- {status}: {summary[status]}\n")
        fh.write("\n## 과목별 요약\n\n")
        fh.write("| 과목 | IN_SCOPE | REVIEW | LIKELY_OVER_SCOPE |\n")
        fh.write("|---|---:|---:|---:|\n")
        for subject_id in sorted(subject_summary):
            counts = subject_summary[subject_id]
            title = docs_by_subject[subject_id][0]["subject_title"]
            fh.write(f"| {subject_id} {title} | {counts['IN_SCOPE']} | {counts['REVIEW']} | {counts['LIKELY_OVER_SCOPE']} |\n")
        fh.write("\n## 검토 필요/범위 초과 후보\n\n")
        fh.write("| ID | 판정 | 점수 | 토픽 | 답 | 가장 가까운 범위 개념 | 누락 키워드 후보 |\n")
        fh.write("|---|---|---:|---|---|---|---|\n")
        for row in rows:
            if row["status"] == "IN_SCOPE":
                continue
            concept = f"{row['matched_subject']} > {row['matched_chapter']} > {row['matched_section']} > {row['matched_concept']}"
            fh.write(
                f"| {row['id']} | {row['status']} | {row['score']} | {row['topic']} | "
                f"{row['answer'][:80]} | {concept} | {row['missing_terms'][:160]} |\n"
            )

    print(f"Wrote {csv_path}")
    print(f"Wrote {md_path}")
    print(dict(summary))


if __name__ == "__main__":
    main()
