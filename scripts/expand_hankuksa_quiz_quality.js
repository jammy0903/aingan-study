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
const PREFIX = 'hqa-';
const TARGET_ADDED = 333;

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

function includesEither(a, b) {
  const ca = compact(a);
  const cb = compact(b);
  return Boolean(ca && cb && (ca.includes(cb) || cb.includes(ca)));
}

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values.map(clean).filter(Boolean)) {
    const key = compact(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function blank(text, terms) {
  let out = clean(text);
  for (const term of terms.filter(Boolean).sort((a, b) => b.length - a.length)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    out = out.replace(new RegExp(escaped, 'g'), '____');
  }
  return out;
}

function cluesFor(item, answer, extra = []) {
  const raw = [
    item.dynasty,
    item.period,
    item.king,
    item.year,
    item.category,
    ...(item.keywords || []),
    ...extra
  ];
  return unique(raw)
    .filter(value => !includesEither(value, answer))
    .slice(0, 6);
}

function choicesFor(answer, pool, salt) {
  const answerKey = compact(answer);
  const distractors = unique(pool)
    .filter(value => compact(value) !== answerKey)
    .slice(0, 3);
  if (distractors.length < 3) {
    throw new Error(`Not enough distractors for ${answer}`);
  }
  return [answer, ...distractors]
    .sort((a, b) => stableHash(`${salt}|choice|${a}`).localeCompare(stableHash(`${salt}|choice|${b}`)));
}

function samePeriodTitles(item, achievements) {
  const same = achievements
    .filter(other => other.id !== item.id && other.period === item.period)
    .map(other => other.title)
    .sort((a, b) => stableHash(`${item.id}|title|${a}`).localeCompare(stableHash(`${item.id}|title|${b}`)));
  const rest = achievements
    .filter(other => other.id !== item.id && other.period !== item.period)
    .map(other => other.title)
    .sort((a, b) => stableHash(`${item.id}|title|${a}`).localeCompare(stableHash(`${item.id}|title|${b}`)));
  return same.concat(rest);
}

function samePeriodActors(item, achievements) {
  const same = achievements
    .filter(other => other.id !== item.id && other.period === item.period)
    .map(other => other.king)
    .sort((a, b) => stableHash(`${item.id}|actor|${a}`).localeCompare(stableHash(`${item.id}|actor|${b}`)));
  const rest = achievements
    .filter(other => other.id !== item.id && other.period !== item.period)
    .map(other => other.king)
    .sort((a, b) => stableHash(`${item.id}|actor|${a}`).localeCompare(stableHash(`${item.id}|actor|${b}`)));
  return same.concat(rest);
}

function samePeriodPairs(item, achievements) {
  const same = achievements
    .filter(other => other.id !== item.id && other.period === item.period)
    .map(other => `${other.dynasty} · ${other.king}`)
    .sort((a, b) => stableHash(`${item.id}|pair|${a}`).localeCompare(stableHash(`${item.id}|pair|${b}`)));
  const rest = achievements
    .filter(other => other.id !== item.id && other.period !== item.period)
    .map(other => `${other.dynasty} · ${other.king}`)
    .sort((a, b) => stableHash(`${item.id}|pair|${a}`).localeCompare(stableHash(`${item.id}|pair|${b}`)));
  return same.concat(rest);
}

function compactDescription(text, terms) {
  const blanked = blank(text, terms);
  const sentences = blanked.split(/(?<=\.)\s+/).filter(Boolean);
  let out = sentences.slice(0, 2).join(' ');
  if (out.length < 80 && sentences[2]) out = `${out} ${sentences[2]}`;
  if (out.length > 260) out = `${out.slice(0, 257).trim()}...`;
  return out;
}

function baseItem(id, kind, prompt, answer, aliases, clues, era, explanation, choices) {
  return {
    id,
    kind,
    prompt: clean(prompt),
    answer: clean(answer),
    aliases: aliases || [],
    clues: clues || [],
    era,
    type: '고품질 보강',
    round: null,
    number: null,
    source: '왕업적·오답함정 보강',
    explanation: clean(explanation),
    choices
  };
}

function buildAchievementQuestions(achievements) {
  const questions = [];
  let seq = 1;

  for (const item of achievements) {
    const id = () => `${PREFIX}${String(seq++).padStart(4, '0')}`;
    questions.push(baseItem(
      id(),
      '개념 객관식',
      `${item.king}과 직접 연결되는 사건·업적을 고르세요.`,
      item.title,
      [],
      cluesFor(item, item.title),
      item.period,
      item.achievement,
      choicesFor(item.title, samePeriodTitles(item, achievements), `${item.id}|title`)
    ));

    const actorPrompt = `다음 설명과 연결되는 왕·인물·항목을 고르세요. ${compactDescription(item.achievement, [item.king])}`;
    questions.push(baseItem(
      id(),
      '주체 연결',
      actorPrompt,
      item.king,
      [],
      cluesFor(item, item.king, [item.title]),
      item.period,
      item.achievement,
      choicesFor(item.king, samePeriodActors(item, achievements), `${item.id}|actor`)
    ));

    const pairAnswer = `${item.dynasty} · ${item.king}`;
    questions.push(baseItem(
      id(),
      '시대 연결',
      `다음 항목의 시대·주체 연결로 맞는 것을 고르세요: ${item.title}`,
      pairAnswer,
      [],
      cluesFor(item, pairAnswer, [item.year, item.category]),
      item.period,
      item.achievement,
      choicesFor(pairAnswer, samePeriodPairs(item, achievements), `${item.id}|pair`)
    ));
  }

  return questions;
}

function manualQuestions(startSeq) {
  let seq = startSeq;
  const id = () => `${PREFIX}${String(seq++).padStart(4, '0')}`;
  const q = (kind, prompt, answer, clues, era, explanation, choices, aliases = []) =>
    baseItem(id(), kind, prompt, answer, aliases, clues, era, explanation, choices);

  return [
    q('순서 배열', '발해 왕의 전개 순서로 맞는 것을 고르세요.', '대조영-무왕-문왕-선왕',
      ['발해', '고왕', '인안', '대흥', '해동성국'],
      '삼국·남북국', '발해는 대조영 건국 뒤 무왕의 공격적 대외 정책, 문왕의 제도 정비, 선왕의 해동성국으로 이어진다.',
      ['대조영-무왕-문왕-선왕', '무왕-대조영-문왕-선왕', '대조영-문왕-무왕-선왕', '문왕-무왕-선왕-대조영']),
    q('순서 배열', '통일 신라 중대 왕의 흐름으로 맞는 것을 고르세요.', '무열왕-문무왕-신문왕-성덕왕-경덕왕-혜공왕',
      ['통일 신라', '중대', '삼국 통일', '녹읍 폐지', '전제 왕권'],
      '삼국·남북국', '통일 신라 중대는 무열왕에서 시작해 문무왕의 통일, 신문왕의 제도 정비, 성덕왕·경덕왕을 거쳐 혜공왕 이후 하대로 넘어간다.',
      ['무열왕-문무왕-신문왕-성덕왕-경덕왕-혜공왕', '문무왕-무열왕-신문왕-경덕왕-성덕왕-혜공왕', '신문왕-무열왕-문무왕-성덕왕-경덕왕-혜공왕', '무열왕-신문왕-문무왕-혜공왕-경덕왕-성덕왕']),
    q('순서 배열', '거란의 고려 침입 대응 순서로 맞는 것을 고르세요.', '서희 외교 담판-양규 항전-강감찬 귀주대첩',
      ['거란', '993', '1010', '1019', '귀주대첩'],
      '고려', '1차 침입은 서희 외교 담판, 2차 침입은 양규 항전, 3차 침입은 강감찬의 귀주대첩으로 정리한다.',
      ['서희 외교 담판-양규 항전-강감찬 귀주대첩', '양규 항전-서희 외교 담판-강감찬 귀주대첩', '강감찬 귀주대첩-서희 외교 담판-양규 항전', '서희 외교 담판-강감찬 귀주대첩-양규 항전']),
    q('순서 배열', '몽골 침입기 항쟁 흐름으로 맞는 것을 고르세요.', '처인성 전투-강화도 천도-팔만대장경 조판-삼별초 항쟁',
      ['몽골 침입', '김윤후', '강화도', '팔만대장경', '삼별초'],
      '고려', '몽골 침입기에는 처인성 전투, 강화도 천도, 팔만대장경 조판, 개경 환도 뒤 삼별초 항쟁 흐름을 잡는다.',
      ['처인성 전투-강화도 천도-팔만대장경 조판-삼별초 항쟁', '강화도 천도-처인성 전투-삼별초 항쟁-팔만대장경 조판', '팔만대장경 조판-처인성 전투-강화도 천도-삼별초 항쟁', '삼별초 항쟁-강화도 천도-처인성 전투-팔만대장경 조판']),
    q('순서 배열', '조선 법전 편찬 순서로 맞는 것을 고르세요.', '경국대전-속대전-대전통편-대전회통',
      ['법전', '성종', '영조', '정조', '흥선대원군'],
      '조선', '경국대전은 성종 때 완성, 속대전은 영조, 대전통편은 정조, 대전회통은 흥선대원군 집권기에 정리한다.',
      ['경국대전-속대전-대전통편-대전회통', '속대전-경국대전-대전회통-대전통편', '경국대전-대전통편-속대전-대전회통', '대전통편-경국대전-속대전-대전회통']),
    q('오답 함정', '강화도 조약과 부속 조약의 함정으로 맞는 것을 고르세요.', '조약 본문은 영사 재판권, 부속 규칙은 무관세·일본 화폐 사용',
      ['강화도 조약', '조일수호조규', '영사 재판권', '무관세', '일본 화폐'],
      '근대', '강화도 조약 본문은 해안 측량권과 영사 재판권, 부속 조약·무역 규칙은 일본 화폐 사용과 무관세 무역으로 나누어 잡는다.',
      ['조약 본문은 영사 재판권, 부속 규칙은 무관세·일본 화폐 사용', '조약 본문은 거중 조정, 부속 규칙은 최혜국 대우', '조약 본문은 단발령, 부속 규칙은 태양력 사용', '조약 본문은 재판소 설치, 부속 규칙은 23부 개편']),
    q('순서 배열', '개항 이후 근대 개혁 흐름으로 맞는 것을 고르세요.', '강화도 조약-임오군란-갑신정변-동학 농민 운동-갑오개혁-을미개혁',
      ['개항기', '임오군란', '갑신정변', '동학 농민 운동', '갑오개혁'],
      '근대', '개항 이후 큰 흐름은 1876 강화도 조약, 1882 임오군란, 1884 갑신정변, 1894 동학 농민 운동과 갑오개혁, 1895 을미개혁이다.',
      ['강화도 조약-임오군란-갑신정변-동학 농민 운동-갑오개혁-을미개혁', '임오군란-강화도 조약-동학 농민 운동-갑신정변-을미개혁-갑오개혁', '강화도 조약-갑신정변-임오군란-갑오개혁-동학 농민 운동-을미개혁', '갑신정변-강화도 조약-임오군란-을미개혁-동학 농민 운동-갑오개혁']),
    q('오답 함정', '임오군란 이후의 결과 연결로 맞는 것을 고르세요.', '제물포 조약 체결, 조청상민수륙무역장정 체결, 청의 내정 간섭 강화',
      ['임오군란', '제물포 조약', '조청상민수륙무역장정', '청 내정 간섭'],
      '근대', '임오군란 뒤 일본과 제물포 조약을 맺고, 청과 조청상민수륙무역장정을 맺으면서 청의 내정 간섭이 강화된다.',
      ['제물포 조약 체결, 조청상민수륙무역장정 체결, 청의 내정 간섭 강화', '한성 조약 체결, 톈진 조약 체결, 갑오개혁 실시', '거중 조정 조항 삽입, 최혜국 대우 인정, 미국 공사 파견', '을사늑약 체결, 통감부 설치, 헤이그 특사 파견']),
    q('오답 함정', '독립협회 활동으로 맞는 것을 고르세요.', '만민공동회 개최, 관민공동회 헌의 6조 채택, 중추원 개편 시도',
      ['독립협회', '만민공동회', '관민공동회', '헌의 6조', '중추원'],
      '근대', '독립협회는 만민공동회와 관민공동회를 열고 헌의 6조를 결의했으며, 중추원을 의회식 기구로 고치려 했다.',
      ['만민공동회 개최, 관민공동회 헌의 6조 채택, 중추원 개편 시도', '군국기무처 설치, 8아문 개편, 과거제 폐지', '대한매일신보 창간, 국채보상운동 전개, 신민회 조직', '집강소 설치, 폐정 개혁안 실천, 우금치 전투']),
    q('순서 배열', '항일 의병의 전개 순서로 맞는 것을 고르세요.', '을미의병-을사의병-정미의병',
      ['의병', '단발령', '을사늑약', '군대 해산', '13도 창의군'],
      '근대', '을미의병은 을미사변·단발령, 을사의병은 을사늑약, 정미의병은 고종 강제 퇴위와 군대 해산을 배경으로 한다.',
      ['을미의병-을사의병-정미의병', '을사의병-을미의병-정미의병', '정미의병-을미의병-을사의병', '을미의병-정미의병-을사의병']),
    q('순서 배열', '1920년대 무장 독립 전쟁 흐름으로 맞는 것을 고르세요.', '봉오동 전투-청산리 전투-간도 참변-자유시 참변',
      ['봉오동', '청산리', '간도 참변', '자유시 참변', '1920'],
      '일제 강점기', '1920년 봉오동·청산리 승리 뒤 일제의 간도 참변이 있었고, 독립군 일부는 이동 과정에서 자유시 참변을 겪었다.',
      ['봉오동 전투-청산리 전투-간도 참변-자유시 참변', '청산리 전투-봉오동 전투-자유시 참변-간도 참변', '간도 참변-봉오동 전투-청산리 전투-자유시 참변', '자유시 참변-간도 참변-봉오동 전투-청산리 전투']),
    q('오답 함정', '한인애국단 의거의 결과 연결로 맞는 것을 고르세요.', '이봉창 의거와 윤봉길 의거 뒤 중국 국민당의 임시정부 지원이 강화됨',
      ['한인애국단', '이봉창', '윤봉길', '김구', '중국 국민당'],
      '일제 강점기', '김구가 조직한 한인애국단의 이봉창·윤봉길 의거는 중국 국민당의 대한민국 임시정부 지원 강화로 이어졌다.',
      ['이봉창 의거와 윤봉길 의거 뒤 중국 국민당의 임시정부 지원이 강화됨', '김원봉이 한인애국단을 조직하고 조선의용대를 해체함', '안창호가 도쿄에서 일왕 마차에 폭탄을 던짐', '윤봉길 의거 뒤 신민회가 105인 사건으로 해체됨']),
    q('순서 배열', '현대 정치사의 큰 흐름으로 맞는 것을 고르세요.', '4·19 혁명-5·16 군사 정변-유신 체제-10·26 사건-12·12 사태-5·18 민주화운동-6월 민주 항쟁',
      ['현대', '4·19', '5·16', '유신', '5·18', '6월 항쟁'],
      '현대', '현대 정치사는 4·19 혁명, 5·16 군사 정변, 유신 체제, 10·26 사건, 12·12 사태, 5·18 민주화운동, 6월 민주 항쟁으로 흐름을 잡는다.',
      ['4·19 혁명-5·16 군사 정변-유신 체제-10·26 사건-12·12 사태-5·18 민주화운동-6월 민주 항쟁', '5·16 군사 정변-4·19 혁명-유신 체제-5·18 민주화운동-10·26 사건-6월 민주 항쟁', '4·19 혁명-유신 체제-5·16 군사 정변-12·12 사태-10·26 사건-5·18 민주화운동', '유신 체제-4·19 혁명-5·16 군사 정변-10·26 사건-6월 민주 항쟁-5·18 민주화운동']),
    q('오답 함정', '고려 기록·문화유산 비교로 맞는 것을 고르세요.', '직지는 금속 활자, 팔만대장경은 몽골 침입기 대장경판',
      ['직지', '금속 활자', '팔만대장경', '몽골 침입', '해인사'],
      '고려', '직지는 현존하는 오래된 금속 활자본으로 청주 흥덕사와 연결되고, 팔만대장경은 몽골 침입기 조판된 대장경판이다.',
      ['직지는 금속 활자, 팔만대장경은 몽골 침입기 대장경판', '직지는 목판 인쇄, 팔만대장경은 조선 세조 때 불경 간행', '직지는 발해 문왕, 팔만대장경은 신라 신문왕과 연결', '직지는 정조 규장각, 팔만대장경은 갑오개혁과 연결']),
    q('오답 함정', '조선 후기 실학의 학파 비교로 맞는 것을 고르세요.', '중농학파는 토지 제도 개혁, 중상학파는 상공업 진흥과 청 문물 수용',
      ['실학', '중농학파', '중상학파', '토지 제도', '북학'],
      '조선', '중농학파는 유형원·이익·정약용을 중심으로 토지 제도 개혁을, 중상학파는 유수원·홍대용·박지원·박제가를 중심으로 상공업 진흥과 북학을 강조했다.',
      ['중농학파는 토지 제도 개혁, 중상학파는 상공업 진흥과 청 문물 수용', '중농학파는 양명학, 중상학파는 성리학 절대화를 주장', '중농학파는 의병 운동, 중상학파는 위정척사를 주장', '중농학파는 신분제 폐지, 중상학파는 단발령 시행을 주도']),
    q('오답 함정', '영조와 정조의 개혁 비교로 맞는 것을 고르세요.', '영조는 균역법·속대전, 정조는 규장각·장용영·신해통공',
      ['영조', '정조', '균역법', '속대전', '규장각', '장용영'],
      '조선', '영조는 완론탕평, 균역법, 속대전, 청계천 준설이고 정조는 준론탕평, 규장각, 장용영, 수원 화성, 신해통공이다.',
      ['영조는 균역법·속대전, 정조는 규장각·장용영·신해통공', '영조는 규장각·장용영, 정조는 균역법·속대전', '영조는 대전회통, 정조는 경국대전 완성', '영조는 초계문신제, 정조는 사창제']),
    q('오답 함정', '세도 정치 시기 왕의 흐름으로 맞는 것을 고르세요.', '순조-헌종-철종',
      ['세도 정치', '순헌철', '삼정문란', '홍경래의 난', '임술 농민 봉기'],
      '조선', '세도 정치는 정조 사후 순조·헌종·철종 시기에 본격화된다. 홍경래의 난은 순조, 임술 농민 봉기는 철종 때다.',
      ['순조-헌종-철종', '헌종-순조-철종', '철종-순조-헌종', '순조-철종-헌종']),
    q('순서 배열', '삼별초 항쟁의 이동 순서로 맞는 것을 고르세요.', '강화도-진도-제주도',
      ['삼별초', '개경 환도 반대', '배중손', '김통정', '제주도'],
      '고려', '삼별초는 개경 환도에 반대해 강화도에서 봉기한 뒤 진도, 제주도로 이동하며 항쟁했다.',
      ['강화도-진도-제주도', '진도-강화도-제주도', '제주도-강화도-진도', '강화도-제주도-진도'])
  ];
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
  const generated = buildAchievementQuestions(achievements);
  const extra = manualQuestions(generated.length + 1);
  const additions = [...generated, ...extra];

  if (additions.length !== TARGET_ADDED) {
    throw new Error(`Expected ${TARGET_ADDED} additions, got ${additions.length}`);
  }

  const ids = new Set(base.map(item => item.id));
  for (const item of additions) {
    if (ids.has(item.id)) throw new Error(`Duplicate id: ${item.id}`);
    ids.add(item.id);
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
  quiz.meta.quality_expansion = {
    added: additions.length,
    total_after_expansion: quiz.questions.length,
    source: 'royal-achievements.json 105개 항목 기반 315문항 + 수동 순서·비교 18문항',
    note: '자동 문장 추출 대신 검수된 업적 데이터에서 제목·주체·시대 연결 문제를 생성'
  };

  fs.writeFileSync(QUIZ_PATH, JSON.stringify(quiz, null, 2) + '\n');
  console.log(`Base ${base.length} + added ${additions.length} = ${quiz.questions.length}`);
}

main();
