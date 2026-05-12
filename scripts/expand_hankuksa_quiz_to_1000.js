#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const QUIZ_PATH = path.join(ROOT, 'hankuksa', 'quiz', 'questions.json');
const ACHIEVEMENTS_PATH = path.join(ROOT, 'hankuksa', 'data', 'royal-achievements.json');
const PREFIX = 'hqb-';
const TARGET_ADDED = 310;
const TARGET_TOTAL = 1000;

const GENERIC_KEYWORDS = new Set([
  '왕', '왕권', '정치', '문화', '제도', '개혁', '정책', '사건', '흐름',
  '조선', '고려', '근대', '통일신라', '삼국', '남북국', '일제강점기',
  '업적', '핵심', '시험', '빈출', '비교', '순서'
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function compact(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[()\[\]{}'"`“”‘’.,/·:;!?~\-_\s]/g, '');
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function withParticle(value, batchimParticle, noBatchimParticle) {
  const text = clean(value);
  const chars = [...text].reverse();
  for (const char of chars) {
    const code = char.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) continue;
    return `${text}${(code - 0xac00) % 28 === 0 ? noBatchimParticle : batchimParticle}`;
  }
  return `${text}${noBatchimParticle}`;
}

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values.map(clean).filter(Boolean)) {
    const key = compact(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function includesEither(a, b) {
  const ca = compact(a);
  const cb = compact(b);
  return Boolean(ca && cb && (ca.includes(cb) || cb.includes(ca)));
}

function choicesFor(answer, pool, salt) {
  const answerKey = compact(answer);
  const distractors = unique(pool).filter(value => compact(value) !== answerKey).slice(0, 3);
  if (distractors.length < 3) {
    throw new Error(`Not enough distractors for ${answer}`);
  }
  return [answer, ...distractors]
    .sort((a, b) => stableHash(`${salt}|${a}`).localeCompare(stableHash(`${salt}|${b}`)));
}

function baseItem(id, kind, prompt, answer, clues, era, explanation, choices) {
  return {
    id,
    kind,
    prompt: clean(prompt),
    answer: clean(answer),
    aliases: [],
    clues: clues || [],
    era,
    type: '1000문항 고품질 보강',
    round: null,
    number: null,
    source: '왕업적·오답함정 1000문항 보강',
    explanation: clean(explanation),
    choices
  };
}

function itemSort(item) {
  const value = Number(item.sort);
  return Number.isFinite(value) ? value : 999999;
}

function keywordSeeds(item) {
  const blockers = [
    item.id,
    item.year,
    item.sort,
    item.dynasty,
    item.period,
    item.king,
    item.category,
    item.title
  ].map(compact).filter(Boolean);

  const titleParts = clean(item.title).split(/[·,와과및\-\s]+/g);
  const raw = [...(item.keywords || []), ...titleParts];
  return unique(raw).filter(keyword => {
    const key = compact(keyword);
    if (key.length < 2) return false;
    if (GENERIC_KEYWORDS.has(key)) return false;
    if (blockers.some(blocker => blocker === key || (key.length > 3 && blocker.includes(key)))) {
      return false;
    }
    return true;
  });
}

function keywordBundle(item) {
  const seeds = keywordSeeds(item);
  const fallback = unique([
    ...(item.keywords || []),
    ...clean(item.title).split(/[·,와과및\-\s]+/g)
  ]).filter(value => compact(value).length >= 2);
  return unique([...seeds, ...fallback]).slice(0, 3).join(' · ');
}

function bundlePool(item, achievements) {
  const samePeriod = achievements
    .filter(other => other.id !== item.id && other.period === item.period)
    .sort((a, b) => stableHash(`${item.id}|bundle|${a.id}`).localeCompare(stableHash(`${item.id}|bundle|${b.id}`)));
  const rest = achievements
    .filter(other => other.id !== item.id && other.period !== item.period)
    .sort((a, b) => stableHash(`${item.id}|bundle|${a.id}`).localeCompare(stableHash(`${item.id}|bundle|${b.id}`)));
  return samePeriod.concat(rest).map(keywordBundle).filter(Boolean);
}

function connection(item) {
  return `${item.period} · ${item.king} · ${keywordBundle(item)}`;
}

function connectionPool(item, achievements) {
  const samePeriod = achievements
    .filter(other => other.id !== item.id && other.period === item.period)
    .sort((a, b) => stableHash(`${item.id}|connection|${a.id}`).localeCompare(stableHash(`${item.id}|connection|${b.id}`)));
  const rest = achievements
    .filter(other => other.id !== item.id && other.period !== item.period)
    .sort((a, b) => stableHash(`${item.id}|connection|${a.id}`).localeCompare(stableHash(`${item.id}|connection|${b.id}`)));
  return samePeriod.concat(rest).map(connection);
}

function compactExplanation(item, prefix) {
  const text = clean(item.achievement);
  const short = text.length > 210 ? `${text.slice(0, 207).trim()}...` : text;
  return `${prefix} ${short}`;
}

function buildKeywordQuestions(achievements, nextId) {
  const questions = [];
  for (const item of achievements) {
    const answer = keywordBundle(item);
    questions.push(baseItem(
      nextId(),
      '키워드 묶음',
      `${withParticle(item.title, '과', '와')} 직접 연결되는 키워드 묶음으로 맞는 것을 고르세요.`,
      answer,
      unique([item.period, item.king, item.year, item.category, item.title]).filter(Boolean),
      item.period,
      compactExplanation(item, `${item.title}은 ${answer}와 연결된다.`),
      choicesFor(answer, bundlePool(item, achievements), `${item.id}|keyword`)
    ));
  }
  return questions;
}

function buildConnectionQuestions(achievements, nextId) {
  const questions = [];
  for (const item of achievements) {
    const answer = connection(item);
    questions.push(baseItem(
      nextId(),
      '연결 판별',
      '다음 중 시대·주체·핵심 키워드 연결이 모두 맞는 것을 고르세요.',
      answer,
      unique([item.title, item.year, item.category, ...keywordSeeds(item).slice(0, 3)]),
      item.period,
      compactExplanation(item, `${answer} 연결이 맞다.`),
      choicesFor(answer, connectionPool(item, achievements), `${item.id}|connection`)
    ));
  }
  return questions;
}

function chronologyCandidates(achievements) {
  const sorted = [...achievements]
    .filter(item => Number.isFinite(itemSort(item)))
    .sort((a, b) => itemSort(a) - itemSort(b) || a.title.localeCompare(b.title, 'ko'));
  const candidates = [];
  for (let i = 0; i <= sorted.length - 4; i += 1) {
    const window = sorted.slice(i, i + 4);
    const sorts = window.map(itemSort);
    if (sorts[0] >= Math.min(...sorts.slice(1))) continue;
    const titles = window.map(item => item.title);
    if (new Set(titles.map(compact)).size !== titles.length) continue;
    candidates.push(window);
  }
  return candidates;
}

function pickEvenly(items, count) {
  if (items.length < count) {
    throw new Error(`Need ${count} chronology windows, got ${items.length}`);
  }
  const picked = [];
  const used = new Set();
  for (let i = 0; i < count; i += 1) {
    let index = Math.round((i * (items.length - 1)) / (count - 1));
    while (used.has(index) && index < items.length - 1) index += 1;
    while (used.has(index) && index > 0) index -= 1;
    used.add(index);
    picked.push(items[index]);
  }
  return picked;
}

function buildChronologyQuestions(achievements, nextId, count) {
  return pickEvenly(chronologyCandidates(achievements), count).map(window => {
    const answer = window[0].title;
    const choiceTitles = window.map(item => item.title);
    const range = `${window[0].year}~${window[window.length - 1].year}`;
    return baseItem(
      nextId(),
      '연표 최우선',
      `다음 중 연표상 가장 이른 항목을 고르세요. (${range})`,
      answer,
      unique(window.map(item => item.period).concat(window.map(item => item.king))).slice(0, 6),
      window[0].period,
      `${answer}이 이 선택지 묶음에서 가장 먼저 나온다. 순서: ${choiceTitles.join(' → ')}`,
      choicesFor(answer, choiceTitles.filter(title => compact(title) !== compact(answer)), `chronology|${answer}|${range}`)
    );
  });
}

function recalcKinds(questions) {
  return Object.fromEntries(
    Object.entries(questions.reduce((acc, item) => {
      acc[item.kind] = (acc[item.kind] || 0) + 1;
      return acc;
    }, {})).sort(([a], [b]) => a.localeCompare(b, 'ko'))
  );
}

function main() {
  const quiz = readJson(QUIZ_PATH);
  const achievements = readJson(ACHIEVEMENTS_PATH);
  const base = quiz.questions.filter(item => !String(item.id || '').startsWith(PREFIX));
  let seq = 1;
  const nextId = () => `${PREFIX}${String(seq++).padStart(4, '0')}`;

  const additions = [
    ...buildKeywordQuestions(achievements, nextId),
    ...buildConnectionQuestions(achievements, nextId)
  ];
  additions.push(...buildChronologyQuestions(achievements, nextId, TARGET_ADDED - additions.length));

  if (additions.length !== TARGET_ADDED) {
    throw new Error(`Expected ${TARGET_ADDED} additions, got ${additions.length}`);
  }
  if (base.length + additions.length !== TARGET_TOTAL) {
    throw new Error(`Expected total ${TARGET_TOTAL}, got ${base.length + additions.length}`);
  }

  const ids = new Set(base.map(item => item.id));
  const prompts = new Set(base.map(item => compact(`${item.prompt}|${item.answer}`)));
  for (const item of additions) {
    if (ids.has(item.id)) throw new Error(`Duplicate id: ${item.id}`);
    ids.add(item.id);
    const promptKey = compact(`${item.prompt}|${item.answer}`);
    if (prompts.has(promptKey)) throw new Error(`Duplicate prompt-answer: ${item.id}`);
    prompts.add(promptKey);
    if (!Array.isArray(item.choices) || item.choices.length !== 4) {
      throw new Error(`Bad choices for ${item.id}`);
    }
    if (!item.choices.some(choice => compact(choice) === compact(item.answer))) {
      throw new Error(`Answer missing from choices for ${item.id}: ${item.answer}`);
    }
  }

  quiz.questions = [...base, ...additions];
  quiz.meta.generated_at = '2026-05-12';
  quiz.meta.quiz_count = quiz.questions.length;
  quiz.meta.kinds = recalcKinds(quiz.questions);
  quiz.meta.quality_1000_expansion = {
    added: additions.length,
    total_after_expansion: quiz.questions.length,
    source: 'royal-achievements.json 109개 항목 기반 키워드·연결·연표형 보강',
    note: '기존 문제를 덮지 않고 hqb-* 310문항을 추가해 총 1000문항으로 맞춤'
  };

  fs.writeFileSync(QUIZ_PATH, JSON.stringify(quiz, null, 2) + '\n');
  console.log(`Base ${base.length} + added ${additions.length} = ${quiz.questions.length}`);
}

main();
