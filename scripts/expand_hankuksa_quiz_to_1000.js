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
const CURATED_RESISTANCE_COUNT = 35;
const CURATED_COLONIAL_YEAR_COUNT = 51;

const GENERIC_KEYWORDS = new Set([
  '왕', '왕권', '정치', '문화', '제도', '개혁', '정책', '사건', '흐름',
  '조선', '고려', '근대', '통일신라', '삼국', '남북국', '일제강점기',
  '업적', '핵심', '시험', '빈출', '비교', '순서'
]);
const ROYAL_NAME_KEYWORDS = new Set([
  '태조', '정종', '태종', '세종', '문종', '단종', '세조', '예종', '성종',
  '연산군', '중종', '인종', '명종', '선조', '광해군', '인조', '효종',
  '현종', '숙종', '경종', '영조', '정조', '순조', '헌종', '철종', '고종', '순종',
  '태조왕', '고국천왕', '동천왕', '미천왕', '소수림왕', '광개토대왕', '장수왕',
  '고이왕', '근초고왕', '침류왕', '비유왕', '문주왕', '동성왕', '무령왕', '성왕',
  '무왕', '의자왕', '내물마립간', '지증왕', '법흥왕', '진흥왕', '무열왕', '문무왕',
  '신문왕', '대조영', '선왕', '원성왕', '진성여왕', '태조왕건', '광종', '경종',
  '문종', '공민왕'
].map(compact));
const MEMORY_ONLY_KEYWORDS = new Set([
  '순헌철',
  '경속통회',
  '대오태자 신흥민 등번호 105',
  '홍칠이는 재한 이삼',
  '건양친진단소태종우',
  '개의팔년은과재도 금탁이노',
  '부동탄 하모 한산해 진짜 평행 정말로',
  '농약집 3456790'
].map(compact));
const AWKWARD_ERA_CHOICES = new Set([
  '고려 · 고려 관제',
  '고려 · 고려 문화',
  '조선 · 조선 관제',
  '조선 · 조선 법전',
  '조선 · 동학 농민군'
]);
const ERA_DISTRACTOR_POOLS = {
  '고려': [
    '고려 · 태조 왕건',
    '고려 · 광종',
    '고려 · 성종',
    '고려 · 현종',
    '고려 · 공민왕',
    '고려 · 일연',
    '고려 · 김윤후'
  ],
  '조선': [
    '조선 · 태종',
    '조선 · 세종',
    '조선 · 세조',
    '조선 · 성종',
    '조선 · 선조',
    '조선 · 광해군',
    '조선 · 영조',
    '조선 · 정조',
    '조선 · 순조',
    '조선 · 철종',
    '조선 · 고종'
  ],
  '근대': [
    '조선 · 박규수',
    '조선 · 고종',
    '대한제국 · 최익현',
    '대한제국 · 안중근',
    '조선 · 정제두',
    '조선 · 홍대용'
  ],
  '대한제국': [
    '대한제국 · 최익현',
    '대한제국 · 안중근',
    '조선 · 고종',
    '조선 · 박규수'
  ]
};
const QUIZ_TERM_OVERRIDES = {
  'joseon-law-codes-1865': ['경국대전', '속대전', '대전통편'],
  'joseon-ganghwa-treaty-1876': ['조일수호조규', '최초 근대적 조약', '영사재판권'],
  'joseon-gabo-reform-1st-1894': ['군국기무처', '의정부·8아문', '탁지아문'],
  'joseon-gabo-reform-2nd-1894': ['홍범 14조', '7부·23부', '재판소'],
  'joseon-eulmi-reform-1895': ['건양 연호', '친위대·진위대', '단발령']
};

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
    if (ROYAL_NAME_KEYWORDS.has(key)) return false;
    if (MEMORY_ONLY_KEYWORDS.has(key)) return false;
    if (blockers.some(blocker => blocker === key || (key.length > 3 && blocker.includes(key)))) {
      return false;
    }
    return true;
  });
}

function titleTerms(item) {
  return clean(item.title)
    .split(/[·,/]|와|과|및/g)
    .map(value => value.trim())
    .filter(Boolean);
}

function isUsefulTerm(value, item) {
  const key = compact(value);
  if (key.length < 2) return false;
  if (GENERIC_KEYWORDS.has(key)) return false;
  if (ROYAL_NAME_KEYWORDS.has(key)) return false;
  if (MEMORY_ONLY_KEYWORDS.has(key)) return false;
  if (/^\d+(?:년|년대|세기)?$/.test(key)) return false;
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
  return !blockers.includes(key);
}

function quizTerms(item, count = 3) {
  if (QUIZ_TERM_OVERRIDES[item.id]) {
    return QUIZ_TERM_OVERRIDES[item.id].slice(0, count);
  }
  const raw = unique([
    ...keywordSeeds(item),
    ...(item.keywords || []),
    ...titleTerms(item)
  ]).filter(term => isUsefulTerm(term, item));
  const fallback = unique([
    ...keywordSeeds(item),
    ...(item.keywords || []),
    ...titleTerms(item)
  ]).filter(term => compact(term).length >= 2);
  return unique([...raw, ...fallback]).slice(0, count);
}

function keywordBundle(item) {
  return quizTerms(item, 3).join(' · ');
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
  const subject = subjectText(item);
  return `${subject}: ${quizTerms(item, 3).join(' · ')}`;
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

function subjectText(item) {
  const special = {
    '고려 관제': '고려 중앙 관제',
    '고려 문화': '고려 문화재',
    '조선 관제': '조선 중앙 관제',
    '조선 법전': '조선 법전 순서',
    '동학 농민군': '동학농민운동'
  };
  const subject = special[clean(item.king)] || clean(item.king);
  const dynasty = clean(item.dynasty);
  if (!dynasty || compact(subject).startsWith(compact(dynasty))) return subject;
  if (Object.values(special).some(value => compact(value) === compact(subject))) return subject;
  return `${dynasty} ${subject}`;
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
      compactExplanation(item, `${withParticle(item.title, '은', '는')} ${withParticle(answer, '과', '와')} 연결된다.`),
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
      `${withParticle(item.title, '과', '와')} 직접 연결되는 보기로 맞는 것을 고르세요.`,
      answer,
      unique([item.title, item.year, item.category, ...quizTerms(item, 3)]),
      item.period,
      compactExplanation(item, `${withParticle(item.title, '은', '는')} ${withParticle(answer, '과', '와')} 연결된다.`),
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

function buildResistanceQuestions(nextId) {
  const q = (kind, prompt, answer, clues, explanation, choices) => baseItem(
    nextId(),
    kind,
    prompt,
    answer,
    clues,
    '근대',
    explanation,
    choices
  );

  return [
    q('순서 배열', '일본이 조약과 국제 합의로 대한제국 국권을 빼앗는 흐름으로 맞는 것을 고르세요.', '용암포 사건-러일전쟁-한일의정서-제1차 한일협약-가쓰라·태프트 밀약/2차 영일동맹/포츠머스 조약-을사늑약-한일신협약-기유각서-한일병합조약', ['국권 피탈', '조약 순서', '용암포', '을사늑약', '한일병합'], '국권 피탈 흐름은 용암포 사건에서 러일전쟁, 한일의정서, 제1차 한일협약, 국제 승인 흐름, 을사늑약, 정미7조약, 기유각서, 한일병합조약으로 이어진다.', ['용암포 사건-러일전쟁-한일의정서-제1차 한일협약-가쓰라·태프트 밀약/2차 영일동맹/포츠머스 조약-을사늑약-한일신협약-기유각서-한일병합조약', '러일전쟁-을사늑약-한일의정서-제1차 한일협약-기유각서-한일병합조약', '용암포 사건-제1차 한일협약-한일의정서-을사늑약-포츠머스 조약-한일신협약', '을사늑약-가쓰라·태프트 밀약-러일전쟁-한일의정서-한일병합조약']),
    q('오답 함정', '한일의정서의 핵심을 고르세요.', '대한제국 영토를 일본군 군사 기지로 사용', ['한일의정서', '러일전쟁', '군사기지'], '한일의정서는 러일전쟁 중 일본이 대한제국의 군사 요지를 마음대로 사용할 수 있게 만든 조약이다.', ['대한제국 영토를 일본군 군사 기지로 사용', '외교권 박탈과 통감부 설치', '각 부처 일본인 차관 임명', '사법권과 감옥 사무 박탈']),
    q('오답 함정', '제1차 한일협약의 핵심으로 맞는 것을 고르세요.', '외교 고문 스티븐스와 재정 고문 메가타를 둔 고문 통치', ['제1차 한일협약', '고문통치', '스티븐스', '메가타'], '제1차 한일협약은 고문 통치의 시작이다. 외교 고문 스티븐스, 재정 고문 메가타를 구분한다.', ['외교 고문 스티븐스와 재정 고문 메가타를 둔 고문 통치', '통감부 설치와 외교권 박탈', '차관 통치와 군대 해산', '중추원 관제 반포와 헌의 6조 채택']),
    q('오답 함정', '메가타가 실시한 화폐정리사업과 직접 연결되는 키워드를 고르세요.', '금 본위제', ['메가타', '화폐정리사업', '백동화', '제일은행권'], '재정 고문 메가타는 화폐정리사업을 실시해 백동화를 정리하고 금 본위제 중심의 화폐 질서를 강요했다.', ['금 본위제', '지계 발급', '은 본위제', '도량형 통일']),
    q('인물 업적', '미국 샌프란시스코에서 친일 외교 고문 스티븐스를 처단한 인물 조합을 고르세요.', '장인환·전명운', ['스티븐스', '스티븐슨', '샌프란시스코', '의거'], '장인환과 전명운은 미국 샌프란시스코에서 친일 외교 고문 스티븐스를 처단했다.', ['장인환·전명운', '나철·오기호', '이준·이위종', '신돌석·민종식']),
    q('오답 함정', '을사늑약 직전 일본의 한국 지배를 국제적으로 인정한 흐름으로 맞는 것을 고르세요.', '가쓰라·태프트 밀약-제2차 영일동맹-포츠머스 조약', ['을사늑약 배경', '국제 승인', '1905'], '일본은 가쓰라·태프트 밀약, 제2차 영일동맹, 포츠머스 조약을 거치며 한국 지배를 국제적으로 인정받은 뒤 을사늑약을 강요했다.', ['가쓰라·태프트 밀약-제2차 영일동맹-포츠머스 조약', '제물포 조약-조미수호통상조약-톈진 조약', '한성 조약-청일전쟁-삼국 간섭', '기유각서-경술국치-포츠머스 조약']),
    q('오답 함정', '을사늑약, 즉 제2차 한일협약의 핵심 특징으로 맞는 것을 고르세요.', '외교권 박탈과 통감부 설치', ['을사늑약', '제2차 한일협약', '통감부'], '을사늑약은 외교권 박탈과 통감부 설치가 핵심이다. 군대 해산은 정미7조약 뒤다.', ['외교권 박탈과 통감부 설치', '차관 통치와 군대 해산', '사법권과 감옥 사무 박탈', '황무지 개간권 요구 철회']),
    q('인물 업적', '을사늑약 무효를 알리기 위해 헤이그에 파견된 특사 3인을 고르세요.', '이준·이상설·이위종', ['헤이그 특사', '만국평화회의', '고종'], '고종은 을사늑약의 부당함을 알리기 위해 이준·이상설·이위종을 헤이그 특사로 파견했고, 일제는 이를 빌미로 고종을 강제 퇴위시켰다.', ['이준·이상설·이위종', '장인환·전명운·안중근', '신돌석·최익현·민종식', '안창호·양기탁·이승훈']),
    q('오답 함정', '정미7조약을 “차군”으로 외울 때 차군이 가리키는 내용을 고르세요.', '차관 통치와 군대 해산', ['정미7조약', '한일신협약', '차군'], '정미7조약은 “차군”으로 잡는다. 차관 통치와 군대 해산이 핵심이다.', ['차관 통치와 군대 해산', '외교권 박탈과 통감부 설치', '영토 군사 기지 사용권', '관민공동회와 헌의 6조']),
    q('오답 함정', '기유각서를 경찰권 위탁과 구분할 때 먼저 잡아야 할 핵심을 고르세요.', '사법권과 감옥 사무 박탈', ['기유각서', '사법권', '경찰권 위탁'], '기유각서는 사법권과 감옥 사무 박탈이 정확한 핵심이다. 경찰권 박탈은 1910년 경찰권 위탁으로 이어지는 흐름과 구분한다.', ['사법권과 감옥 사무 박탈', '외교권 박탈과 통감부 설치', '차관 통치와 군대 해산', '의병 해산 권고와 단발령 철회']),
    q('인물 업적', '1910년 한일병합조약 체결 인물 조합으로 맞는 것을 고르세요.', '이완용·데라우치', ['한일병합조약', '1910', '경술국치'], '1910년 한일병합조약은 이완용과 통감 데라우치가 체결했다.', ['이완용·데라우치', '박제순·이토 히로부미', '이준·이상설', '장인환·전명운']),
    q('오답 함정', '국권 피탈기 저항운동의 큰 분류로 맞는 것을 고르세요.', '무장 저항은 의병·의거, 비무장 계몽은 실력양성운동', ['저항운동 분류', '의병', '의거', '실력양성'], '국권 피탈기 저항은 힘으로 맞서는 흐름(의병·의거)과 실력을 기르는 애국계몽운동으로 나눈다.', ['무장 저항은 의병·의거, 비무장 계몽은 실력양성운동', '의병은 학교 설립, 의거는 회사 설립, 신민회는 무장 부대', '실력양성운동은 을미·을사·정미 세 단계로만 전개', '의거는 13도 창의군 같은 대규모 부대 활동']),
    q('오답 함정', '을미의병·을사의병·정미의병의 원인 연결로 맞는 것을 고르세요.', '을미의병=을미사변·단발령, 을사의병=을사늑약, 정미의병=정미7조약·군대 해산', ['의병 원인', '을미', '을사', '정미'], '의병 이름 안에 원인이 들어 있다. 을미의병은 을미사변·단발령, 을사의병은 을사늑약, 정미의병은 정미7조약과 군대 해산이다.', ['을미의병=을미사변·단발령, 을사의병=을사늑약, 정미의병=정미7조약·군대 해산', '을미의병=을사늑약, 을사의병=군대 해산, 정미의병=단발령', '을미의병=고종 퇴위, 을사의병=기유각서, 정미의병=강화도 조약', '을미의병=한일병합, 을사의병=임오군란, 정미의병=갑신정변']),
    q('오답 함정', '을미의병의 직접 원인과 특징으로 맞는 것을 고르세요.', '을미사변과 단발령을 계기로 유생층이 주도했고 고종의 해산 권고 뒤 상당수 해산', ['을미의병', '단발령', '유생', '고종 해산 권고'], '을미의병은 을미사변과 단발령을 계기로 유생층이 주도했고, 고종의 해산 권고 뒤 상당수가 해산했다.', ['을미사변과 단발령을 계기로 유생층이 주도했고 고종의 해산 권고 뒤 상당수 해산', '을사늑약을 계기로 해산 군인이 합류해 서울 진공 작전 전개', '기유각서를 계기로 신민회가 대성학교를 설립', '한일병합조약 뒤 국채보상운동으로 전환']),
    q('오답 함정', '을사의병에서 시험에 자주 나오는 인물 연결로 맞는 것을 고르세요.', '신돌석=최초 평민 의병장, 최익현=태인 봉기·쓰시마 순국, 민종식=홍주성 전투', ['을사의병', '신돌석', '최익현', '민종식'], '을사의병은 빈출이다. 신돌석은 최초 평민 의병장, 최익현은 태인 봉기와 쓰시마 순국, 민종식은 홍주성 전투로 잡는다.', ['신돌석=최초 평민 의병장, 최익현=태인 봉기·쓰시마 순국, 민종식=홍주성 전투', '신돌석=헤이그 특사, 최익현=오적암살단, 민종식=대성학교', '신돌석=홍주성 전투, 최익현=군대 해산, 민종식=샌프란시스코 의거', '신돌석=입헌군주제, 최익현=농광회사, 민종식=신흥강습소']),
    q('인물 업적', '최초의 평민 출신 의병장으로 을사의병에서 자주 출제되는 인물을 고르세요.', '신돌석', ['을사의병', '평민 의병장', '빈출'], '신돌석은 최초의 평민 출신 의병장으로 을사의병 단골 선지다.', ['신돌석', '최익현', '민종식', '이인영']),
    q('인물 업적', '태인에서 의병을 일으키고 대마도, 즉 쓰시마에서 순국한 인물을 고르세요.', '최익현', ['태인 봉기', '대마도', '쓰시마', '을사의병'], '최익현은 태인에서 의병을 일으켰고 체포 뒤 쓰시마에 유배되어 순국했다.', ['최익현', '신돌석', '민종식', '안중근']),
    q('인물 업적', '을사의병 때 홍주성 전투와 연결되는 인물을 고르세요.', '민종식', ['홍주성 전투', '을사의병'], '민종식은 을사의병 시기 홍주성 전투와 연결해 출제된다.', ['민종식', '이인영', '양기탁', '오기호']),
    q('오답 함정', '정미의병의 전투력이 강해진 이유로 맞는 것을 고르세요.', '정미7조약 뒤 해산 군인이 의병에 가담했기 때문', ['정미의병', '군대 해산', '해산 군인'], '정미7조약 뒤 대한제국 군대가 해산되자 해산 군인들이 의병에 합류해 정미의병의 전투력이 커졌다.', ['정미7조약 뒤 해산 군인이 의병에 가담했기 때문', '독립협회가 중추원 개편을 추진했기 때문', '메가타가 금 본위제를 실시했기 때문', '보안회가 황무지 개간권을 철회시켰기 때문']),
    q('오답 함정', '13도 창의군의 서울 진공 작전 단서로 맞는 것을 고르세요.', '총대장 이인영, 동대문 밖 30리까지 진격', ['13도 창의군', '서울 진공 작전', '이인영', '동대문 밖 30리'], '정미의병은 13도 창의군을 결성해 서울 진공 작전을 추진했고, 총대장 이인영과 동대문 밖 30리 단서가 중요하다.', ['총대장 이인영, 동대문 밖 30리까지 진격', '총대장 안창호, 삼원보 신흥강습소 설치', '총대장 나철, 오적암살단 조직', '총대장 장인환, 샌프란시스코 의거']),
    q('오답 함정', '서울 진공 작전이 약화된 단서로 맞는 것을 고르세요.', '총대장 이인영이 부친상으로 이탈', ['이인영', '부친상', '아버지상', '서울 진공 작전'], '13도 창의군 총대장 이인영은 부친상으로 전열에서 이탈했고, 서울 진공 작전은 제대로 전개되지 못했다.', ['총대장 이인영이 부친상으로 이탈', '신돌석이 헤이그 특사로 파견', '안창호가 스티븐스를 처단', '장지연이 군대 해산을 지휘']),
    q('오답 함정', '정미의병이 강해진 뒤 일제가 반격한 탄압 작전을 고르세요.', '남한대토벌작전', ['정미의병', '남한대토벌', '1909'], '해산 군인 합류로 정미의병이 강해지자 일제는 남한대토벌작전으로 의병 세력을 크게 약화시켰다.', ['남한대토벌작전', '105인 사건', '황국협회 보부상 습격', '갑오개혁 2차']),
    q('인물 업적', '오적암살단을 조직했고 훗날 단군을 모시는 대종교와 연결되는 인물 조합을 고르세요.', '나철·오기호', ['오적암살단', '대종교', '단군'], '나철·오기호는 오적암살단을 조직했다. 나철은 단군을 모시는 대종교와도 연결된다.', ['나철·오기호', '장인환·전명운', '이준·이상설', '신돌석·민종식']),
    q('인물 업적', '명동 성당 앞에서 이완용을 칼로 찌른 인물을 고르세요.', '이재명', ['이재명', '이완용', '의거'], '이재명은 명동 성당 앞에서 이완용을 칼로 찔렀으나 사망시키지는 못했다.', ['이재명', '안중근', '장인환', '나철']),
    q('인물 업적', '안중근 의거의 핵심 3단서로 맞는 것을 고르세요.', '하얼빈에서 이토 히로부미 사살, 뤼순 감옥 순국, 동양평화론', ['안중근', '하얼빈', '이토 히로부미', '동양평화론'], '안중근은 하얼빈에서 이토 히로부미를 사살했고, 뤼순 감옥에서 순국했으며, 동양평화론을 남겼다.', ['하얼빈에서 이토 히로부미 사살, 뤼순 감옥 순국, 동양평화론', '샌프란시스코에서 스티븐스 처단, 대종교 중광, 105인 사건', '명동 성당에서 이완용 처단 성공, 헤이그 특사 파견, 공화정 주장', '홍주성 전투, 태인 봉기, 동대문 밖 30리 진격']),
    q('오답 함정', '보안회의 활동으로 맞는 것을 고르세요.', '1904년 일본의 황무지 개간권 요구 반대와 농광회사 설립', ['보안회', '황무지 개간권', '농광회사'], '보안회는 1904년 일본의 황무지 개간권 요구에 반대했고, 농광회사 설립 흐름과 함께 출제된다.', ['1904년 일본의 황무지 개간권 요구 반대와 농광회사 설립', '1907년 비밀 결사로 공화정 수립 주장', '을사늑약 무효를 알리려 헤이그 특사 파견', '정미7조약 뒤 해산 군인을 모아 서울 진공 작전']),
    q('오답 함정', '헌정연구회의 정치 목표로 맞는 것을 고르세요.', '입헌군주제', ['헌정연구회', '입헌군주제'], '헌정연구회는 입헌군주제를 주장했다. 신민회의 공화정 목표와 구분한다.', ['입헌군주제', '공화정', '전제군주제', '군정 통치']),
    q('오답 함정', '대한자강회의 해산과 연결되는 활동으로 맞는 것을 고르세요.', '고종 강제 퇴위 반대 운동', ['대한자강회', '고종 강제 퇴위'], '대한자강회는 교육·산업 진흥을 주장하다가 고종 강제 퇴위 반대 운동을 전개해 해산되었다.', ['고종 강제 퇴위 반대 운동', '황무지 개간권 요구 반대', '오적암살단 조직', '헤이그 특사 파견']),
    q('오답 함정', '신민회의 기본 성격으로 맞는 것을 고르세요.', '1907~1911년 안창호·양기탁 등이 만든 비밀 조직', ['신민회', '안창호', '양기탁', '비밀 조직'], '신민회는 1907~1911년 안창호·양기탁 등이 만든 비밀 조직이다. 공개 단체인 독립협회와 구분한다.', ['1907~1911년 안창호·양기탁 등이 만든 비밀 조직', '1896년 서재필이 만든 공개 토론 단체', '1904년 황무지 개간권 요구에 반대한 단체', '1907년 군대 해산 뒤 생긴 의병 연합 부대']),
    q('오답 함정', '독립협회와 신민회의 정치 목표 비교로 맞는 것을 고르세요.', '독립협회는 입헌군주제 추진, 신민회는 우리 역사상 최초 공화정 주장', ['독립협회', '신민회', '입헌군주제', '공화정'], '독립협회는 공화정 주장으로 모함당했지만 실제로는 입헌군주제적 의회 설립을 추진했다. 신민회는 우리 역사상 최초로 공화정을 주장했다.', ['독립협회는 입헌군주제 추진, 신민회는 우리 역사상 최초 공화정 주장', '독립협회는 공화정 주장, 신민회는 전제군주제 강화', '독립협회는 군대 해산 반대, 신민회는 을미의병 해산 권고', '독립협회는 농광회사, 신민회는 황국협회']),
    q('오답 함정', '신민회 활동 암기 묶음 “대오태자 신흥민 등번호 105”에 들어가는 내용으로 맞는 것을 고르세요.', '대성학교·오산학교·태극서관·자기회사·신흥강습소·105인 사건', ['신민회', '대오태자', '신흥민', '105인 사건'], '신민회는 대성학교, 오산학교, 태극서관, 자기회사, 신흥강습소를 활동으로 묶고 105인 사건으로 탄압받았다.', ['대성학교·오산학교·태극서관·자기회사·신흥강습소·105인 사건', '독립신문·독립문·독립관·만민공동회·헌의6조', '황무지 개간권 반대·농광회사·입헌군주제·고종 퇴위 반대', '태인 봉기·홍주성 전투·동대문 밖 30리·남한대토벌']),
    q('오답 함정', '신민회가 만주 삼원보에 세운 독립군 양성 기관으로 맞는 것을 고르세요.', '신흥강습소(신흥무관학교)', ['신민회', '삼원보', '신흥강습소', '신흥무관학교'], '신민회는 만주 삼원보에 신흥강습소를 세웠고, 이는 신흥무관학교로 이어진다.', ['신흥강습소(신흥무관학교)', '육영공원', '원산학사', '한성사범학교']),
    q('오답 함정', '105인 사건의 성격으로 맞는 것을 고르세요.', '데라우치 총독 암살 음모 조작을 통한 신민회 탄압', ['105인 사건', '데라우치', '신민회 탄압'], '105인 사건은 일제가 데라우치 총독 암살 음모를 조작해 신민회 계열을 탄압한 사건이다.', ['데라우치 총독 암살 음모 조작을 통한 신민회 탄압', '고종이 황국협회를 동원해 독립협회를 해산한 사건', '일본이 대한제국 군대를 해산한 조약', '러시아가 용암포 조차를 요구한 사건']),
    q('오답 함정', '헌정연구회와 신민회 목표를 구분한 것으로 맞는 것을 고르세요.', '헌정연구회=입헌군주제, 신민회=공화정', ['헌정연구회', '신민회', '입헌군주제', '공화정'], '헌정연구회는 입헌군주제, 신민회는 공화정으로 구분한다.', ['헌정연구회=입헌군주제, 신민회=공화정', '헌정연구회=공화정, 신민회=입헌군주제', '헌정연구회=전제군주제, 신민회=황무지 개간권', '헌정연구회=군대 해산, 신민회=기유각서']),
    q('오답 함정', '다음 중 의병·의거·실력양성운동의 예시 연결로 맞는 것을 고르세요.', '의병=13도 창의군, 의거=안중근, 실력양성운동=신민회', ['저항운동 비교', '의병', '의거', '신민회'], '의병은 부대 단위 무장 투쟁, 의거는 개인·소수 직접 행동, 실력양성운동은 교육·산업·출판으로 힘을 기르는 흐름이다.', ['의병=13도 창의군, 의거=안중근, 실력양성운동=신민회', '의병=태극서관, 의거=대성학교, 실력양성운동=홍주성 전투', '의병=신민회, 의거=보안회, 실력양성운동=안중근', '의병=헌정연구회, 의거=대한자강회, 실력양성운동=동대문 밖 30리'])
  ];
}

function buildColonialYearQuestions(nextId) {
  const q = (prompt, answer, clues, explanation, choices) => baseItem(
    nextId(),
    '식민지 연도',
    prompt,
    answer,
    clues,
    '일제 강점기',
    explanation,
    choices
  );

  return [
    q('한일병합조약 체결과 경술국치가 일어난 연도를 고르세요.', '1910', ['한일병합조약', '경술국치', '이완용', '데라우치'], '1910년에 한일병합조약이 강제로 체결되어 대한제국의 국권이 완전히 빼앗겼다.', ['1910', '1905', '1907', '1919']),
    q('헌병 경찰 중심의 무단 통치가 시작된 시기를 고르세요.', '1910년대', ['무단 통치', '헌병 경찰', '태형령'], '1910년대 일제는 헌병 경찰과 조선 태형령을 앞세운 무단 통치를 실시했다.', ['1910년대', '1920년대', '1930년대', '1940년대']),
    q('회사령이 공포되어 회사 설립을 총독의 허가제로 묶은 연도를 고르세요.', '1910', ['회사령', '허가제', '경제 침탈'], '1910년 회사령은 회사 설립을 총독의 허가제로 제한해 민족 자본 성장을 억눌렀다.', ['1910', '1912', '1920', '1938']),
    q('제1차 조선 교육령이 시행된 연도를 고르세요.', '1911', ['제1차 조선 교육령', '식민지 교육'], '1911년 제1차 조선 교육령은 식민지 교육 체제 정비와 연결된다.', ['1911', '1919', '1922', '1938']),
    q('105인 사건으로 신민회가 큰 탄압을 받은 연도를 고르세요.', '1911', ['105인 사건', '신민회', '데라우치'], '1911년 105인 사건은 데라우치 총독 암살 음모를 조작해 신민회 계열을 탄압한 사건이다.', ['1911', '1907', '1919', '1927']),
    q('토지조사령이 공포된 연도를 고르세요.', '1912', ['토지조사령', '토지조사사업'], '1912년 토지조사령 공포 뒤 일제는 토지조사사업을 본격화했다.', ['1912', '1910', '1918', '1920']),
    q('조선 태형령이 시행된 연도를 고르세요.', '1912', ['조선 태형령', '무단 통치'], '1912년 조선 태형령은 1910년대 무단 통치의 폭압성을 보여 주는 단서다.', ['1912', '1915', '1925', '1938']),
    q('독립의군부가 조직된 연도를 고르세요.', '1912', ['독립의군부', '임병찬', '고종 밀지'], '1912년 임병찬은 고종의 밀지를 받아 독립의군부를 조직했다.', ['1912', '1915', '1919', '1925']),
    q('대한광복군정부가 연해주에서 수립된 연도를 고르세요.', '1914', ['대한광복군정부', '연해주', '이상설', '이동휘'], '1914년 연해주에서 대한광복군정부가 수립되었다.', ['1914', '1910', '1919', '1920']),
    q('대한광복회가 조직된 연도를 고르세요.', '1915', ['대한광복회', '박상진', '공화정', '군대식 조직'], '1915년 대한광복회는 박상진 등이 조직한 비밀 결사로, 공화정 지향과 군대식 조직이 단서다.', ['1915', '1911', '1919', '1927']),
    q('토지조사사업이 완료된 연도를 고르세요.', '1918', ['토지조사사업', '기한부 신고제'], '토지조사사업은 1910년대 대표 경제 수탈 정책이며 1918년에 완료되었다.', ['1918', '1912', '1920', '1934']),
    q('3·1 운동이 일어난 연도를 고르세요.', '1919', ['3·1 운동', '민족 대표 33인', '독립 선언서'], '1919년 3·1 운동은 일제강점기 최대 규모의 민족 운동이다.', ['1919', '1911', '1926', '1929']),
    q('대한민국 임시정부가 수립된 연도를 고르세요.', '1919', ['대한민국 임시정부', '상하이', '삼권 분립'], '1919년 대한민국 임시정부가 수립되어 독립운동의 통합 기구 역할을 했다.', ['1919', '1923', '1940', '1941']),
    q('의열단이 만주 지린에서 조직된 연도를 고르세요.', '1919', ['의열단', '김원봉', '만주 지린'], '1919년 김원봉 등은 만주 지린에서 의열단을 조직했다.', ['1919', '1923', '1932', '1938']),
    q('문화 통치가 시작되고 회사령이 폐지된 연도를 고르세요.', '1920', ['문화 통치', '회사령 폐지', '산미증식계획'], '1920년대 일제는 문화 통치를 내세웠고, 1920년 회사령을 폐지해 신고제로 바꾸었다.', ['1920', '1910', '1919', '1931']),
    q('봉오동 전투와 청산리 전투가 일어난 연도를 고르세요.', '1920', ['봉오동 전투', '청산리 전투', '홍범도', '김좌진'], '1920년 홍범도의 봉오동 전투와 김좌진의 청산리 전투가 이어졌다.', ['1920', '1919', '1921', '1932']),
    q('간도 참변이 일어난 연도를 고르세요.', '1920', ['간도 참변', '독립군 탄압'], '1920년 봉오동·청산리 전투 뒤 일제는 간도 참변을 일으켜 한인 사회를 탄압했다.', ['1920', '1921', '1925', '1937']),
    q('자유시 참변이 일어난 연도를 고르세요.', '1921', ['자유시 참변', '독립군 이동'], '1921년 자유시 참변은 독립군 부대가 러시아 지역으로 이동한 뒤 겪은 비극이다.', ['1921', '1920', '1923', '1931']),
    q('제2차 조선 교육령이 시행된 연도를 고르세요.', '1922', ['제2차 조선 교육령', '문화 통치'], '1922년 제2차 조선 교육령은 문화 통치기 교육 정책 변화와 연결된다.', ['1922', '1911', '1938', '1943']),
    q('민립 대학 설립 운동이 본격화된 연도를 고르세요.', '1923', ['민립 대학 설립 운동', '조선민립대학기성회'], '1923년 조선민립대학기성회가 조직되어 민립 대학 설립 운동이 본격화되었다.', ['1923', '1919', '1927', '1931']),
    q('국민대표회의가 열린 연도를 고르세요.', '1923', ['국민대표회의', '창조파', '개조파'], '1923년 국민대표회의는 임시정부 진로를 둘러싼 창조파·개조파 갈등과 연결된다.', ['1923', '1919', '1925', '1941']),
    q('치안유지법이 제정된 연도를 고르세요.', '1925', ['치안유지법', '사회주의 탄압'], '1925년 치안유지법은 사회주의와 민족운동 탄압의 법적 근거로 활용되었다.', ['1925', '1912', '1927', '1938']),
    q('조선 공산당이 창당된 연도를 고르세요.', '1925', ['조선 공산당', '사회주의 운동'], '1925년 조선 공산당이 창당되었다.', ['1925', '1920', '1927', '1931']),
    q('6·10 만세 운동이 일어난 연도를 고르세요.', '1926', ['6·10 만세 운동', '순종 인산일'], '1926년 순종 인산일을 계기로 6·10 만세 운동이 전개되었다.', ['1926', '1919', '1929', '1932']),
    q('나석주가 동양척식주식회사와 식산은행에 폭탄을 던진 의거의 연도를 고르세요.', '1926', ['나석주', '동양척식주식회사', '식산은행'], '1926년 나석주는 동양척식주식회사와 식산은행을 공격했다.', ['1926', '1909', '1932', '1940']),
    q('신간회와 근우회가 조직된 연도를 고르세요.', '1927', ['신간회', '근우회', '민족 유일당 운동'], '1927년 신간회와 근우회가 조직되어 민족 협동 전선이 확대되었다.', ['1927', '1923', '1929', '1931']),
    q('원산 총파업이 일어난 연도를 고르세요.', '1929', ['원산 총파업', '노동 운동'], '1929년 원산 총파업은 일제강점기 대표 노동 운동이다.', ['1929', '1926', '1931', '1938']),
    q('광주 학생 항일 운동이 일어난 연도를 고르세요.', '1929', ['광주 학생 항일 운동', '학생 운동'], '1929년 광주 학생 항일 운동은 학생 항일 운동의 대표 사례다.', ['1929', '1919', '1926', '1932']),
    q('만주 사변이 일어난 연도를 고르세요.', '1931', ['만주 사변', '한중 연합 작전'], '1931년 만주 사변 이후 만주 지역 독립군은 중국군과 연합 작전을 전개했다.', ['1931', '1920', '1932', '1937']),
    q('이봉창 의거와 윤봉길 의거가 일어난 연도를 고르세요.', '1932', ['한인애국단', '이봉창', '윤봉길', '김구'], '1932년 한인애국단의 이봉창 의거와 윤봉길 의거가 전개되었다.', ['1932', '1909', '1926', '1940']),
    q('한국 독립군이 대전자령 전투에서 승리한 연도를 고르세요.', '1933', ['한국 독립군', '지청천', '대전자령'], '1933년 지청천의 한국 독립군은 대전자령 전투에서 승리했다.', ['1933', '1920', '1932', '1938']),
    q('한글 맞춤법 통일안이 제정된 연도를 고르세요.', '1933', ['한글 맞춤법 통일안', '조선어학회'], '1933년 조선어학회는 한글 맞춤법 통일안을 제정했다.', ['1933', '1929', '1942', '1945']),
    q('진단학회가 조직된 연도를 고르세요.', '1934', ['진단학회', '실증사학'], '1934년 진단학회가 조직되어 실증사학 연구를 전개했다.', ['1934', '1925', '1937', '1942']),
    q('민족혁명당이 조직된 연도를 고르세요.', '1935', ['민족혁명당', '김원봉'], '1935년 김원봉 등은 민족혁명당을 조직했다.', ['1935', '1919', '1927', '1940']),
    q('손기정이 베를린 올림픽 마라톤에서 우승한 연도를 고르세요.', '1936', ['손기정', '베를린 올림픽', '동아일보 일장기 말소'], '1936년 손기정은 베를린 올림픽 마라톤에서 우승했고, 일장기 말소 사건과 연결된다.', ['1936', '1929', '1938', '1942']),
    q('중일전쟁이 발발한 연도를 고르세요.', '1937', ['중일전쟁', '민족 말살 통치'], '1937년 중일전쟁 이후 일제는 전시 동원과 민족 말살 정책을 강화했다.', ['1937', '1931', '1938', '1941']),
    q('황국 신민 서사 암송이 강요된 시기로 맞는 것을 고르세요.', '1937년 이후', ['황국 신민 서사', '민족 말살 통치'], '황국 신민 서사 암송은 1937년 중일전쟁 이후 민족 말살 통치의 대표 단서다.', ['1937년 이후', '1910년 직후', '1920년 문화 통치기', '1945년 광복 이후']),
    q('국가총동원법이 제정되고 조선의용대가 창설된 연도를 고르세요.', '1938', ['국가총동원법', '조선의용대', '김원봉'], '1938년 국가총동원법이 제정되었고 김원봉은 조선의용대를 창설했다.', ['1938', '1932', '1940', '1942']),
    q('창씨개명 정책이 시행된 연도를 고르세요.', '1940', ['창씨개명', '민족 말살 통치'], '1940년 일제는 창씨개명을 시행해 한국인의 성과 이름까지 일본식으로 바꾸려 했다.', ['1940', '1910', '1937', '1942']),
    q('조선일보와 동아일보가 강제 폐간된 연도를 고르세요.', '1940', ['조선일보 폐간', '동아일보 폐간', '민족 말살 통치'], '1940년 일제는 조선일보와 동아일보를 강제 폐간해 민족 언론을 탄압했다.', ['1940', '1920', '1936', '1942']),
    q('대한민국 임시정부가 충칭에 정착하고 한국광복군이 창설된 연도를 고르세요.', '1940', ['대한민국 임시정부', '충칭', '한국광복군'], '1940년 임시정부는 충칭에 정착했고 한국광복군을 창설했다.', ['1940', '1919', '1932', '1945']),
    q('대한민국 임시정부가 건국 강령을 발표한 연도를 고르세요.', '1941', ['건국 강령', '대한민국 임시정부'], '1941년 대한민국 임시정부는 조소앙의 삼균주의를 바탕으로 건국 강령을 발표했다.', ['1941', '1919', '1923', '1944']),
    q('대한민국 임시정부가 대일 선전 포고를 한 연도를 고르세요.', '1941', ['대일 선전 포고', '태평양 전쟁'], '1941년 태평양 전쟁 발발 뒤 대한민국 임시정부는 대일 선전 포고를 했다.', ['1941', '1937', '1940', '1945']),
    q('조선어학회 사건이 일어난 연도를 고르세요.', '1942', ['조선어학회 사건', '우리말 큰사전'], '1942년 조선어학회 사건으로 한글 연구자들이 탄압받았다.', ['1942', '1933', '1938', '1945']),
    q('조선독립동맹과 조선의용군이 결성된 연도를 고르세요.', '1942', ['조선독립동맹', '조선의용군', '화북'], '1942년 화북에서 조선독립동맹과 조선의용군이 결성되었다.', ['1942', '1938', '1940', '1944']),
    q('카이로 회담에서 한국의 독립이 약속된 연도를 고르세요.', '1943', ['카이로 회담', '한국 독립 약속'], '1943년 카이로 회담에서 연합국은 한국의 독립을 약속했다.', ['1943', '1941', '1945', '1948']),
    q('조선 건국 동맹이 조직된 연도를 고르세요.', '1944', ['조선 건국 동맹', '여운형'], '1944년 여운형은 조선 건국 동맹을 조직해 광복 이후를 준비했다.', ['1944', '1927', '1942', '1945']),
    q('한국광복군이 국내 진공 작전을 준비하던 시기를 고르세요.', '1945', ['한국광복군', '국내 진공 작전', 'OSS'], '1945년 한국광복군은 OSS와 국내 진공 작전을 준비했지만 광복으로 실행하지 못했다.', ['1945', '1932', '1940', '1948']),
    q('광복이 이루어진 연도를 고르세요.', '1945', ['광복', '8·15'], '1945년 8월 15일 광복이 이루어졌다.', ['1945', '1919', '1943', '1948']),
    q('일제강점기 연도 흐름으로 맞는 것을 고르세요.', '1910 병합-1919 3·1 운동-1920 봉오동·청산리-1927 신간회-1929 광주 학생 항일 운동-1940 한국광복군-1945 광복', ['식민지 연도 흐름', '1910', '1919', '1945'], '식민지 연도 문제는 1910 병합, 1919 3·1 운동, 1920 봉오동·청산리, 1927 신간회, 1929 광주 학생 항일 운동, 1940 한국광복군, 1945 광복을 기준축으로 잡는다.', ['1910 병합-1919 3·1 운동-1920 봉오동·청산리-1927 신간회-1929 광주 학생 항일 운동-1940 한국광복군-1945 광복', '1919 3·1 운동-1910 병합-1927 신간회-1920 봉오동·청산리-1945 광복', '1910 병합-1927 신간회-1919 3·1 운동-1940 한국광복군-1929 광주 학생 항일 운동', '1920 봉오동·청산리-1910 병합-1932 한인애국단-1919 임시정부-1945 광복']),
    q('1910년대 식민 통치와 가장 가까운 조합을 고르세요.', '무단 통치·헌병 경찰·조선 태형령·토지조사사업', ['1910년대', '무단 통치', '토지조사사업'], '1910년대는 무단 통치, 헌병 경찰, 조선 태형령, 토지조사사업을 묶는다.', ['무단 통치·헌병 경찰·조선 태형령·토지조사사업', '문화 통치·신간회·민립 대학 설립 운동·산미증식계획', '민족 말살 통치·창씨개명·국가총동원법·황국 신민 서사', '좌우 합작 운동·반민특위·농지개혁·발췌개헌'])
  ];
}

const BASE_QUESTION_REWRITES = {
  'hqa-0135': {
    kind: '오답 함정',
    prompt: '고려 중앙 관제의 연결로 맞는 것을 고르세요.',
    answer: '중서문하성·중추원·어사대·삼사, 단 고려 삼사는 회계 기구',
    clues: ['고려 관제', '중서문하성', '중추원', '어사대', '고려 삼사'],
    explanation: '고려 중앙 관제는 중서문하성·중추원·어사대·삼사를 묶는다. 고려 삼사는 회계 기구이고, 조선 삼사는 사헌부·사간원·홍문관이므로 기능이 다르다.',
    choices: [
      '중서문하성·중추원·어사대·삼사, 단 고려 삼사는 회계 기구',
      '의정부·6조·사헌부·사간원·홍문관, 단 삼사는 언론·감찰·경연 기구',
      '집현전·홍문관·규장각, 단 모두 고려의 왕명 출납 기구',
      '통리기무아문·12사·별기군, 단 모두 고려 후기 관제'
    ]
  },
  'hqa-0162': {
    kind: '오답 함정',
    prompt: '부석사 무량수전과 직접 연결되는 설명을 고르세요.',
    answer: '고려 시대 주심포 양식 목조 건축',
    clues: ['고려 문화', '부석사 무량수전', '주심포', '목조 건축'],
    explanation: '부석사 무량수전은 고려 시대 주심포 양식 목조 건축으로 자주 출제된다. 다보탑·석가탑은 통일신라 불국사 석탑과 구분한다.',
    choices: [
      '고려 시대 주심포 양식 목조 건축',
      '백제 무왕 때 조성된 현존 최고 석탑',
      '원 영향이 반영된 고려 후기 대리석 탑',
      '조선 세조 때 세워진 원각사지 10층 석탑'
    ]
  },
  'hqa-0174': {
    kind: '오답 함정',
    prompt: '경천사지 10층 석탑과 직접 연결되는 설명을 고르세요.',
    answer: '원 영향이 반영된 고려 후기 대리석 석탑',
    clues: ['고려 문화', '경천사지 10층 석탑', '원 영향', '대리석'],
    explanation: '경천사지 10층 석탑은 고려 후기 원의 영향을 받은 대리석 석탑이다. 조선 세조 때의 원각사지 10층 석탑과 이름을 바꿔 내기 쉽다.',
    choices: [
      '원 영향이 반영된 고려 후기 대리석 석탑',
      '조선 세조 때 만들어진 원각사지 10층 석탑',
      '백제 무왕 때 조성된 미륵사지 석탑',
      '통일신라 신문왕 때 세운 감은사지 3층 석탑'
    ]
  },
  'hqa-0219': {
    kind: '오답 함정',
    prompt: '조선 중앙 관제의 기능 연결로 맞는 것을 고르세요.',
    answer: '의정부=최고 정책 심의, 6조=행정 실무, 삼사=사헌부·사간원·홍문관',
    clues: ['조선 관제', '의정부', '6조', '삼사', '사헌부', '사간원', '홍문관'],
    explanation: '조선 중앙 관제는 의정부·6조·삼사를 기능으로 나눠 잡는다. 의정부는 최고 정책 심의, 6조는 행정 실무, 삼사는 사헌부·사간원·홍문관의 언론·감찰·경연 기능이다.',
    choices: [
      '의정부=최고 정책 심의, 6조=행정 실무, 삼사=사헌부·사간원·홍문관',
      '의정부=화폐 출납, 6조=사림 탄압, 삼사=지방 행정 구역',
      '의정부=군사 기밀 출납, 6조=왕명 출납, 삼사=고려 회계 기구',
      '의정부=독립협회 의회 개편 대상, 6조=일제 자문 기구, 삼사=통감부'
    ]
  },
  'hqa-0282': {
    kind: '순서 배열',
    prompt: '조선 법전 정리 순서로 맞는 것을 고르세요.',
    answer: '경국대전-속대전-대전통편-대전회통',
    clues: ['조선 법전', '경국대전', '속대전', '대전통편', '대전회통'],
    explanation: '조선 법전은 경국대전(성종 완성·시행), 속대전(영조), 대전통편(정조), 대전회통(고종·흥선대원군 시기) 순서로 정리한다.',
    choices: [
      '경국대전-속대전-대전통편-대전회통',
      '경국대전-대전통편-속대전-대전회통',
      '속대전-경국대전-대전회통-대전통편',
      '대전회통-대전통편-속대전-경국대전'
    ]
  },
  'hqa-0297': {
    kind: '오답 함정',
    prompt: '우금치 전투와 동학농민운동의 연결로 맞는 것을 고르세요.',
    answer: '2차 봉기 때 농민군이 공주 우금치에서 일본군·관군에게 패배',
    clues: ['동학농민운동', '우금치', '2차 봉기', '보국안민', '제폭구민'],
    explanation: '우금치 전투는 동학농민운동 2차 봉기 때 농민군이 공주 우금치에서 일본군·관군에게 패배한 전투다. 보국안민·제폭구민 구호와 함께 묶어 둔다.',
    choices: [
      '2차 봉기 때 농민군이 공주 우금치에서 일본군·관군에게 패배',
      '1차 봉기 때 전주화약으로 집강소가 폐지된 전투',
      '임진왜란 때 조선 수군이 일본군을 격파한 해전',
      '정미의병이 서울 진공 작전으로 동대문 밖 30리까지 진격한 전투'
    ]
  }
};

function rewriteBaseQuestionOutliers(base) {
  return base.map(item => {
    const rewrite = BASE_QUESTION_REWRITES[item.id];
    return sanitizeEraChoices(rewrite ? { ...item, ...rewrite } : item);
  });
}

function sanitizeEraChoices(item) {
  if (item.kind !== '시대 연결' || !Array.isArray(item.choices)) return item;
  const reserved = new Set(item.choices.filter(choice => (
    !AWKWARD_ERA_CHOICES.has(choice) || compact(choice) === compact(item.answer)
  )));
  const used = new Set();
  const choices = item.choices.map(choice => {
    const isAwkward = AWKWARD_ERA_CHOICES.has(choice) && compact(choice) !== compact(item.answer);
    const blocked = new Set([...reserved, ...used]);
    const value = isAwkward ? replacementEraChoice(item, blocked) : choice;
    used.add(value);
    return value;
  });
  return { ...item, choices };
}

function replacementEraChoice(item, used) {
  const pool = ERA_DISTRACTOR_POOLS[item.era] || ERA_DISTRACTOR_POOLS[item.period] || ERA_DISTRACTOR_POOLS[item.dynasty] || [];
  const sorted = [...pool].sort((a, b) => stableHash(`${item.id}|${a}`).localeCompare(stableHash(`${item.id}|${b}`)));
  for (const candidate of sorted) {
    if (compact(candidate) !== compact(item.answer) && !used.has(candidate)) return candidate;
  }
  return '조선 · 세종';
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
  const base = rewriteBaseQuestionOutliers(quiz.questions.filter(item => !String(item.id || '').startsWith(PREFIX)));
  let seq = 1;
  const nextId = () => `${PREFIX}${String(seq++).padStart(4, '0')}`;

  const additions = [
    ...buildKeywordQuestions(achievements, nextId),
    ...buildConnectionQuestions(achievements, nextId)
  ];
  const resistanceQuestions = buildResistanceQuestions(nextId);
  const colonialYearQuestions = buildColonialYearQuestions(nextId);
  if (resistanceQuestions.length !== CURATED_RESISTANCE_COUNT) {
    throw new Error(`Expected ${CURATED_RESISTANCE_COUNT} resistance questions, got ${resistanceQuestions.length}`);
  }
  if (colonialYearQuestions.length !== CURATED_COLONIAL_YEAR_COUNT) {
    throw new Error(`Expected ${CURATED_COLONIAL_YEAR_COUNT} colonial year questions, got ${colonialYearQuestions.length}`);
  }
  additions.push(...buildChronologyQuestions(
    achievements,
    nextId,
    TARGET_ADDED - additions.length - CURATED_RESISTANCE_COUNT - CURATED_COLONIAL_YEAR_COUNT
  ));
  additions.push(...resistanceQuestions);
  additions.push(...colonialYearQuestions);

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
    source: `royal-achievements.json ${achievements.length}개 항목 기반 키워드·연결형 + 큐레이션 보강`,
    note: '기존 문제를 덮지 않고 hqb-* 310문항을 추가해 총 1000문항으로 맞춤',
    curated_resistance_questions: resistanceQuestions.length,
    colonial_year_questions_from_1910: colonialYearQuestions.length
  };

  fs.writeFileSync(QUIZ_PATH, JSON.stringify(quiz, null, 2) + '\n');
  console.log(`Base ${base.length} + added ${additions.length} = ${quiz.questions.length}`);
}

main();
