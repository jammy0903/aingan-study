#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PAGE_05 = path.join(ROOT, 'hankuksa', '05', 'index.html');
const PAGE_06 = path.join(ROOT, 'hankuksa', '06', 'index.html');
const QUIZ_PATH = path.join(ROOT, 'hankuksa', 'quiz', 'questions.json');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, text) {
  fs.writeFileSync(filePath, text);
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compact(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[()\[\]{}'"`“”‘’.,/·:;!?~\-_\s]/g, '');
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

function addKeywords(item, keywords) {
  item.keywords = unique([...(item.keywords || []), ...keywords]);
}

function appendTextOnce(item, field, text) {
  if (!text) return;
  const marker = clean(text).slice(0, 48);
  const current = item[field] || '';
  if (current.includes(marker)) return;
  item[field] = current ? `${current}\n\n${text}` : text;
}

function addTableRows(item, rows) {
  item.table ||= [];
  const seen = new Set(item.table.map(row => compact(Object.values(row).join('|'))));
  for (const row of rows) {
    const key = compact(Object.values(row).join('|'));
    if (seen.has(key)) continue;
    seen.add(key);
    item.table.push(row);
  }
}

function extractLessons(source) {
  const match = source.match(/const LESSONS = (\[[\s\S]*?\]);\nlet curTab/);
  if (!match) throw new Error('LESSONS block not found');
  return { lessons: JSON.parse(match[1]) };
}

function replaceLessons(source, lessons) {
  return source.replace(
    /const LESSONS = \[[\s\S]*?\];\nlet curTab/,
    `const LESSONS = ${JSON.stringify(lessons, null, 2)};\nlet curTab`
  );
}

function previewFor(lesson) {
  const titles = (lesson.items || []).map(item => item.title);
  const shown = titles.slice(0, 3).join(' · ');
  return `스토리형: ${shown}${titles.length > 3 ? ' …' : ''}`;
}

function updateLessonMeta(lessons) {
  for (const lesson of lessons) {
    lesson.concept_titles = (lesson.items || []).map(item => item.title);
    lesson.preview = previewFor(lesson);
    lesson.count = (lesson.items || []).length;
  }
}

function findLesson(lessons, title) {
  const lesson = lessons.find(item => item.title === title);
  if (!lesson) throw new Error(`lesson not found: ${title}`);
  return lesson;
}

function findItem(lesson, title) {
  const item = (lesson.items || []).find(value => value.title === title);
  if (!item) throw new Error(`item not found: ${title}`);
  return item;
}

function update05() {
  const source = read(PAGE_05);
  const { lessons } = extractLessons(source);

  const internal = findLesson(lessons, '흥선대원군의 내부 개혁');
  const reform = findItem(internal, '호포제·서원 철폐·삼정 개혁');
  addKeywords(reform, ['5군영', '2영', '무위영', '장어영', '군제 개편']);
  appendTextOnce(
    reform,
    'explanation',
    '군제 개편도 함께 본다. 흥선대원군은 비대해진 5군영을 무위영·장어영의 2영으로 줄여 군사 지휘를 정비했다.'
  );
  addTableRows(reform, [
    { '장면': '군제 개편', '스토리': '5군영 → 2영(무위영·장어영) / 군사 지휘 정비', '시험포인트': '5군영→2영' }
  ]);

  const treaty = findLesson(lessons, '개항 조약과 불평등성');
  const treaties = findItem(treaty, '강화도조약(1876)과 조미수호통상조약(1882)');
  addKeywords(treaties, ['조일통상장정', '1개월 전 통고', '방곡령 통고', '조청상민수륙무역장정 이유']);
  appendTextOnce(
    treaties,
    'explanation',
    '1883년 조일통상장정은 일본과의 통상 규정을 구체화한 장정으로, 조선의 관세 부과와 방곡령 선포 시 1개월 전 통고 같은 내용이 함께 문제로 나온다. 조청상민수륙무역장정은 임오군란 뒤 청의 내정 간섭 강화 속에서 체결되어 조선을 청의 속방처럼 다루려는 성격이 강했다.'
  );
  addTableRows(treaties, [
    { '장면': '추가 장정', '스토리': '조일통상장정(1883) / 관세 규정·방곡령 때 1개월 전 일본 통고', '시험포인트': '조일통상장정' },
    { '장면': '추가 장정', '스토리': '조청상민수륙무역장정(1882) / 임오군란 뒤 청 내정 간섭 강화·속방화 성격', '시험포인트': '조청상민수륙무역장정 이유' }
  ]);

  const envoys = findItem(treaty, '개화 사절단 — 수신사·조사시찰단·영선사·보빙사');
  addKeywords(envoys, ['묄렌도르프', '마건상']);
  appendTextOnce(
    envoys,
    'explanation',
    '임오군란 이후 청은 조선에 고문을 파견했다. 묄렌도르프는 외교 고문, 마건상은 군사 고문으로 자주 함께 묶어 출제된다.'
  );

  const factionLesson = findLesson(lessons, '개화파의 분화와 갈등');
  const factions = findItem(factionLesson, '동도서기론과 급진개화론');
  addKeywords(factions, ['기정진', '지부복궐 상소', '이만손', '영남만인소']);
  appendTextOnce(
    factions,
    'explanation',
    '위정척사 흐름은 이항로·기정진 같은 척사론자, 최익현의 왜양일체론, 개화 반대 상소 운동으로 이어진다. 1880년대에는 이만손 등이 영남만인소를 올렸고, 지부복궐 상소 같은 복합 상소 형식도 함께 정리해 두면 좋다.'
  );
  addTableRows(factions, [
    { '장면': '위정척사', '스토리': '이항로·기정진 / 통상 반대·성리학 질서 수호', '시험포인트': '위정척사 인물' },
    { '장면': '상소 운동', '스토리': '이만손 / 영남만인소 / 조선책략·개화 정책 반대', '시험포인트': '이만손' }
  ]);

  const imo = findItem(factionLesson, '임오군란(1882)');
  appendTextOnce(
    imo,
    'explanation',
    '임오군란 뒤 결과는 두 갈래다. 일본과는 제물포조약을 맺어 배상금 지급과 일본 공사관 경비병 주둔을 허용했고, 청은 조청상민수륙무역장정 체결과 고문 파견으로 내정 간섭을 강화했다.'
  );

  const gabsin = findItem(factionLesson, '갑신정변(1884)');
  addKeywords(gabsin, ['우정총국 개국 축하연', '14개조 개혁안', '문벌 폐지', '지조법', '내시부 폐지', '호조로 재정 일원화']);
  appendTextOnce(
    gabsin,
    'explanation',
    '갑신정변은 우정총국 개국 축하연을 계기로 일어났다. 14개조 개혁안에는 문벌 폐지, 지조법 개혁, 내시부 폐지, 호조 중심 재정 일원화 같은 조항이 포함되었다. 청의 개입으로 실패한 뒤 일본과 한성조약, 청·일 사이에는 톈진조약이 체결되었다.'
  );
  addTableRows(gabsin, [
    { '장면': '계기', '스토리': '우정총국 개국 축하연 / 급진개화파 거사 개시', '시험포인트': '우정총국' },
    { '장면': '개혁안', '스토리': '14개조 개혁안 / 문벌 폐지·지조법·내시부 폐지·호조 재정 일원화', '시험포인트': '14개조 개혁안' }
  ]);

  const geomundo = findItem(factionLesson, '조러밀약과 거문도 사건(1885)');
  addKeywords(geomundo, ['부들러', '한반도 중립화론', '유길준']);
  appendTextOnce(
    geomundo,
    'explanation',
    '러시아 남하를 경계한 영국은 거문도를 점령했다. 이 시기 조선의 자주 외교 방안으로 부들러와 유길준 등이 한반도 중립화론을 제기한 점도 함께 묻는다.'
  );

  const donghakLesson = findLesson(lessons, '동학과 농민 봉기');
  const first = findItem(donghakLesson, '동학농민운동 1차 봉기와 전주화약');
  addKeywords(first, ['호남 창의소', '황룡촌 전투', '폐정 개혁안 12조']);
  appendTextOnce(
    first,
    'explanation',
    '1차 봉기 과정은 고부 민란(조병갑·만석보) → 백산 봉기(호남 창의소) → 황토현·황룡촌 전투 → 전주성 점령 → 전주화약 순서로 잡는다. 전주화약 뒤 집강소를 설치했고, 폐정 개혁안 12조가 제시되었다.'
  );
  addTableRows(first, [
    { '장면': '봉기 확대', '스토리': '백산 봉기 / 호남 창의소 설치 / 농민군 조직화', '시험포인트': '호남 창의소' },
    { '장면': '전투', '스토리': '황토현·황룡촌 전투 / 1차 봉기 승세 확대', '시험포인트': '황룡촌 전투' },
    { '장면': '개혁안', '스토리': '전주화약 뒤 폐정 개혁안 12조 제시', '시험포인트': '폐정 개혁안 12조' }
  ]);

  const economyLesson = findLesson(lessons, '경제 침탈과 대응');
  const economy = findItem(economyLesson, '개항 이후의 경제 침탈과 회사 설립');
  addKeywords(economy, ['상회사', '대동상회', '장통상회']);
  appendTextOnce(
    economy,
    'explanation',
    '상권 수호 대응에서는 시전 상인의 황국 중앙 총상회와 함께, 개항장 상인 조직인 대동상회·장통상회 같은 상회사도 자주 묶인다.'
  );

  const societyLesson = findLesson(lessons, '애국계몽운동');
  const culture = findItem(societyLesson, '근대 사회·문화의 변화');
  addKeywords(culture, ['한성주보', '원각사', '은세계', '설중매', '신체시', '해에게서 소년에게', '지석영', '주시경']);
  appendTextOnce(
    culture,
    'explanation',
    '언론·문화 쪽 세부도 잡는다. 한성주보는 최초 국한문 혼용체 신문, 만세보는 천도교 계열 신문이다. 원각사는 근대 극장으로, 이인직의 「은세계」 상연과 함께 나온다. 「설중매」는 개화기 소설 계열 선지로 자주 비교되고, 최남선의 「해에게서 소년에게」는 신체시 단서다. 지석영은 종두법과 국문연구소, 주시경은 국어 문법 연구와 「말의 소리」로 정리한다.'
  );
  addTableRows(culture, [
    { '장면': '언론', '스토리': '한성주보 / 최초 국한문 혼용체 신문', '시험포인트': '한성주보' },
    { '장면': '공연', '스토리': '원각사 / 「은세계」 상연 / 근대 극장', '시험포인트': '원각사' },
    { '장면': '문학', '스토리': '신체시 / 최남선 / 「해에게서 소년에게」', '시험포인트': '신체시' },
    { '장면': '국어·의학', '스토리': '지석영=종두법·국문연구소, 주시경=국어 문법·「말의 소리」', '시험포인트': '지석영·주시경' }
  ]);

  updateLessonMeta(lessons);
  write(PAGE_05, replaceLessons(source, lessons));
}

function update06() {
  const source = read(PAGE_06);
  const { lessons } = extractLessons(source);

  const secretLesson = findLesson(lessons, '비밀 결사와 통합 운동');
  const secret = findItem(secretLesson, '대한광복회와 1910년대 국내 비밀 결사');
  addKeywords(secret, ['이회영', '전 재산 기부', '신흥무관학교']);
  appendTextOnce(
    secret,
    'explanation',
    '서간도 독립운동 기지와 관련해서는 이회영 일가의 전 재산 기부와 신흥무관학교 설립도 중요하다.'
  );

  const thoughtLesson = findLesson(lessons, '사상과 1940년대 독립운동');
  const hist = findItem(thoughtLesson, '민족사학과 역사 인식 (신채호·박은식)');
  addKeywords(hist, ['유교구신론', '박은식']);
  appendTextOnce(
    hist,
    'explanation',
    '박은식은 역사 저술뿐 아니라 「유교구신론」으로 유교 개혁 문제도 다루었다.'
  );

  const joseonhak = findItem(thoughtLesson, '조선학 운동과 정인보');
  addKeywords(joseonhak, ['조선불교유신론', '한용운']);
  appendTextOnce(
    joseonhak,
    'explanation',
    '근대 사상 비교 선지에서는 한용운의 「조선불교유신론」도 함께 나온다. 불교 개혁과 민족 자각을 연결한 저술로 잡는다.'
  );

  updateLessonMeta(lessons);
  write(PAGE_06, replaceLessons(source, lessons));
}

function q(id, kind, prompt, answer, clues, era, explanation, choices) {
  return {
    id: `hqh-${String(id).padStart(4, '0')}`,
    kind,
    prompt,
    answer,
    clues,
    era,
    type: '사용자 요청 근대 누락 보강',
    round: null,
    number: null,
    source: '사용자 요청 보강: 근대/일제강점기 세부 누락 추가',
    explanation,
    ...(choices ? { choices } : {})
  };
}

const REMOVE_IDS = [
  'hq-0141', 'hq-0144', 'hq-0150', 'hq-0153', 'hq-0156', 'hq-0159',
  'hq-0162', 'hq-0165', 'hq-0168', 'hq-0171', 'hq-0174', 'hq-0177'
];

const EXTRA_QUESTIONS = [
  q(1, '오답 함정', '흥선대원군의 군제 개편으로 맞는 것을 고르세요.', '5군영을 2영(무위영·장어영)으로 축소', ['흥선대원군', '5군영', '2영'], '근대', '흥선대원군은 비대해진 5군영을 무위영·장어영의 2영으로 줄였다.', ['5군영을 2영(무위영·장어영)으로 축소', '2군영을 5영으로 확대', '속오군을 신식군으로 개편', '훈련도감을 폐지하고 별기군만 설치']),
  q(2, '개념 객관식', '1883년 조일통상장정과 함께 묶을 내용으로 맞는 것을 고르세요.', '방곡령 선포 때 1개월 전 일본에 통고', ['조일통상장정', '1883', '방곡령'], '근대', '조일통상장정은 통상 규정을 구체화했고 방곡령 선포 때 1개월 전 일본 통고 같은 조항으로 묶인다.', ['방곡령 선포 때 1개월 전 일본에 통고', '거중조정과 최혜국 대우 규정', '군대 해산과 차관 정치 규정', '외교권 박탈과 통감부 설치']),
  q(3, '오답 함정', '임오군란 뒤 결과 연결로 맞는 것을 고르세요.', '일본과 제물포조약, 청과 조청상민수륙무역장정', ['임오군란', '제물포조약', '조청상민수륙무역장정'], '근대', '임오군란 뒤 일본과는 제물포조약, 청과는 조청상민수륙무역장정을 체결했다.', ['일본과 제물포조약, 청과 조청상민수륙무역장정', '일본과 톈진조약, 청과 한성조약', '일본과 한일의정서, 청과 을사늑약', '일본과 강화도조약, 청과 조미수호통상조약']),
  q(4, '주체 연결', '임오군란 뒤 조선에 파견된 외교 고문과 군사 고문 조합으로 맞는 것을 고르세요.', '묄렌도르프·마건상', ['묄렌도르프', '마건상', '고문 파견'], '근대', '임오군란 뒤 청의 영향력 확대 속에서 묄렌도르프와 마건상이 고문으로 파견되었다.', ['묄렌도르프·마건상', '베델·아펜젤러', '양기탁·서재필', '헐버트·주시경']),
  q(5, '주체 연결', '영남만인소와 연결되는 인물을 고르세요.', '이만손', ['영남만인소', '조선책략', '개화 반대'], '근대', '이만손은 영남만인소와 연결되는 대표 인물이다.', ['이만손', '전봉준', '안창호', '민영환']),
  q(6, '오답 함정', '위정척사파의 주장 연결로 맞는 것을 고르세요.', '최익현=왜양일체론, 이항로·기정진=통상 반대', ['최익현', '이항로', '기정진'], '근대', '위정척사 흐름은 최익현의 왜양일체론, 이항로·기정진의 통상 반대로 정리한다.', ['최익현=왜양일체론, 이항로·기정진=통상 반대', '최익현=공화정, 이항로·기정진=문명개화론', '최익현=양기탁, 이항로·기정진=독립협회', '최익현=한반도 중립화론, 이항로·기정진=신민회']),
  q(7, '개념 객관식', '거문도 사건 전후 조선의 자주 외교 방안으로 제기된 것을 고르세요.', '한반도 중립화론', ['거문도 사건', '부들러', '유길준'], '근대', '거문도 사건 전후 부들러·유길준 등이 한반도 중립화론을 제기했다.', ['한반도 중립화론', '북진 정책', '조소앙 삼균주의', '남면북양정책']),
  q(8, '오답 함정', '갑신정변의 전개와 결과로 맞는 것을 고르세요.', '우정총국 개국 축하연을 계기로 거사, 실패 뒤 한성조약·톈진조약 체결', ['갑신정변', '우정총국', '한성조약'], '근대', '갑신정변은 우정총국 개국 축하연을 계기로 시작되었고, 실패 뒤 한성조약과 톈진조약이 이어졌다.', ['우정총국 개국 축하연을 계기로 거사, 실패 뒤 한성조약·톈진조약 체결', '제너럴셔먼호 사건을 계기로 거사, 성공 뒤 중추원 개편', '황토현 전투 뒤 거사, 성공 뒤 집강소 설치', '을사늑약 뒤 거사, 실패 뒤 통감부 설치']),
  q(9, '오답 함정', '동학농민운동 1차 봉기 흐름으로 맞는 것을 고르세요.', '고부 민란 → 백산 봉기(호남 창의소) → 황토현·황룡촌 → 전주화약·집강소', ['동학농민운동', '호남 창의소', '황룡촌'], '근대', '1차 봉기는 고부 민란에서 시작해 백산 봉기, 황토현·황룡촌, 전주화약과 집강소로 이어진다.', ['고부 민란 → 백산 봉기(호남 창의소) → 황토현·황룡촌 → 전주화약·집강소', '우정총국 → 한성조약 → 백산 봉기 → 우금치', '강화도조약 → 교정청 → 톈진조약 → 집강소', '을미사변 → 아관파천 → 폐정개혁안 12조 → 전주화약']),
  q(10, '오답 함정', '개항 이후 상권 수호 단체 연결로 맞는 것을 고르세요.', '시전 상인=황국 중앙 총상회, 개항장 상인 조직=대동상회·장통상회', ['황국 중앙 총상회', '대동상회', '장통상회'], '근대', '시전 상인은 황국 중앙 총상회, 개항장 상인 조직은 대동상회·장통상회로 구분한다.', ['시전 상인=황국 중앙 총상회, 개항장 상인 조직=대동상회·장통상회', '시전 상인=대동상회, 개항장 상인 조직=보안회·신민회', '시전 상인=조선어학회, 개항장 상인 조직=형평사', '시전 상인=대한광복회, 개항장 상인 조직=국채보상기성회']),
  q(11, '오답 함정', '근대 언론·문화 연결로 맞는 것을 고르세요.', '한성주보=국한문 혼용, 원각사=「은세계」 상연, 신체시=「해에게서 소년에게」', ['한성주보', '원각사', '신체시'], '근대', '한성주보는 국한문 혼용, 원각사는 「은세계」 상연, 신체시는 최남선의 「해에게서 소년에게」로 잡는다.', ['한성주보=국한문 혼용, 원각사=「은세계」 상연, 신체시=「해에게서 소년에게」', '한성주보=순한문, 원각사=독립문 건립, 신체시=「혈의 누」', '한성주보=천도교 기관지, 원각사=국채보상운동, 신체시=「독사신론」', '한성주보=입헌군주제, 원각사=대종교, 신체시=「한국통사」']),
  q(12, '오답 함정', '근대 사상·국어 연구 연결로 맞는 것을 고르세요.', '지석영=종두법·국문연구소, 주시경=국어 문법·「말의 소리」, 한용운=「조선불교유신론」', ['지석영', '주시경', '한용운'], '근대', '지석영은 종두법·국문연구소, 주시경은 국어 문법·「말의 소리」, 한용운은 「조선불교유신론」으로 연결한다.', ['지석영=종두법·국문연구소, 주시경=국어 문법·「말의 소리」, 한용운=「조선불교유신론」', '지석영=대한매일신보, 주시경=우정총국, 한용운=을사의병', '지석영=광무개혁, 주시경=군국기무처, 한용운=제물포조약', '지석영=대종교, 주시경=천도교, 한용운=원불교'])
];

function updateQuiz() {
  const quiz = JSON.parse(read(QUIZ_PATH));
  quiz.questions = (quiz.questions || []).filter(item => !String(item.id || '').startsWith('hqh-'));
  quiz.questions = quiz.questions.filter(item => !REMOVE_IDS.includes(item.id));
  quiz.questions.push(...EXTRA_QUESTIONS);

  if (quiz.questions.length !== 1000) {
    throw new Error(`expected 1000 questions, got ${quiz.questions.length}`);
  }

  quiz.meta ||= {};
  quiz.meta.quiz_count = quiz.questions.length;
  quiz.meta.kinds = quiz.questions.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1;
    return acc;
  }, {});
  quiz.meta.user_requested_modern_missing_points = {
    generated_at: '2026-05-15',
    removed: REMOVE_IDS.length,
    added: EXTRA_QUESTIONS.length,
    focus: '근대 세부 누락 포인트 추가: 조일통상장정, 위정척사, 갑신정변, 동학, 상회사, 언론·문화, 국어·사상'
  };

  write(QUIZ_PATH, `${JSON.stringify(quiz, null, 2)}\n`);
}

update05();
update06();
updateQuiz();
console.log(`Supplemented missing modern points and replaced ${REMOVE_IDS.length} quiz questions with ${EXTRA_QUESTIONS.length} targeted items.`);
