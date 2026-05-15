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

function compact(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[()\[\]{}'"`“”‘’.,/·:;!?~\-_\s]/g, '');
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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
  return { lessons: JSON.parse(match[1]), originalJson: match[1] };
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

function mnemonicFor(title, keywords, background, why, trap) {
  const core = keywords.slice(0, 5).join('·');
  return [
    `【왜】 ${background}`,
    `【전개】 ${title}은(는) ${core} 키워드를 한 장면으로 묶어 잡아.`,
    `【결과】 ${why || `${title}은 시험에서 서로 비슷한 인물·기관을 구분하는 축이 된다.`}`,
    `【문제풀이】 선지에 ${core}가 보이면 먼저 시기·주체·기능을 확인해.`,
    `【오답방지】 ${trap}`
  ].join('\n');
}

function concept({ title, keywords, background, explanation, why = '', trap = '', table = [], connections = [], sources = [] }) {
  return {
    title,
    keywords: unique(keywords),
    background,
    explanation,
    why,
    connections,
    trap,
    table,
    sources,
    mnemonic: mnemonicFor(title, keywords, background, why, trap)
  };
}

function ensureItem(lesson, item, afterTitle = '') {
  const existing = (lesson.items || []).find(value => value.title === item.title);
  if (existing) return existing;
  lesson.items ||= [];
  if (afterTitle) {
    const idx = lesson.items.findIndex(value => value.title === afterTitle);
    if (idx >= 0) {
      lesson.items.splice(idx + 1, 0, item);
      return item;
    }
  }
  lesson.items.push(item);
  return item;
}

function update05Lessons() {
  const source = read(PAGE_05);
  const { lessons } = extractLessons(source);

  const socialLesson = findLesson(lessons, '애국계몽운동');
  const socialChange = findItem(socialLesson, '근대 사회·문화의 변화');
  addKeywords(socialChange, [
    '아펜젤러',
    '배재학당 설립',
    '스크랜턴',
    '이화학당 설립',
    '양기탁',
    '베델',
    '대한매일신보',
    '국채보상운동 지원',
    '일장기 말소 사건'
  ]);
  appendTextOnce(
    socialChange,
    'explanation',
    '교육·언론 인물도 함께 묶어야 한다. 배재학당은 아펜젤러, 이화학당은 스크랜턴과 연결된다. 대한매일신보는 양기탁과 영국인 베델이 중심이 되어 창간했고, 국채보상운동을 지원했으며 일장기 말소 사건 보도로 항일 언론의 성격을 드러냈다.'
  );
  appendTextOnce(
    socialChange,
    'trap',
    '배재학당=아펜젤러, 이화학당=스크랜턴, 광혜원=알렌, 대한매일신보=양기탁·베델로 나눠. 이름은 익숙한데 역할을 바꾸는 선지가 자주 나온다.'
  );
  addTableRows(socialChange, [
    { '장면': '교육 기관', '스토리': '배재학당 / 아펜젤러 / 근대 선교사 학교', '시험포인트': '배재학당' },
    { '장면': '교육 기관', '스토리': '이화학당 / 스크랜턴 / 여성 교육 선교사 학교', '시험포인트': '이화학당' },
    { '장면': '언론 기관', '스토리': '대한매일신보 / 양기탁·베델 / 국채보상운동 지원·일장기 말소 사건 보도', '시험포인트': '대한매일신보' }
  ]);

  ensureItem(
    socialLesson,
    concept({
      title: '대한매일신보와 근대 교육·언론 기관',
      keywords: ['대한매일신보', '양기탁', '베델', '배재학당', '아펜젤러', '이화학당', '스크랜턴', '국채보상운동', '일장기 말소 사건'],
      background: '개항 이후 근대 학교와 언론은 단순한 문물 수용이 아니라 민중 계몽과 항일 여론 형성의 장이 되었어.',
      explanation: '대한매일신보는 양기탁과 영국인 베델이 창간한 항일 신문으로 국채보상운동을 적극 지원했고, 일장기 말소 사건 보도로도 유명하다. 근대 교육 기관은 배재학당의 아펜젤러, 이화학당의 스크랜턴, 광혜원의 알렌처럼 설립 인물과 기관 이름을 함께 구분해야 한다. 배재학당은 남학교, 이화학당은 여성 교육, 육영공원은 관립 학교라는 점도 같이 묶어 잡는다.',
      why: '근대 언론·교육 문항은 기관 이름만 외우기보다 설립 인물과 기능을 짝으로 기억해야 선지가 흔들리지 않는다.',
      trap: '대한매일신보를 황성신문과, 아펜젤러를 알렌·스크랜턴과 섞으면 바로 틀린다.',
      table: [
        { '장면': '언론', '스토리': '대한매일신보 / 양기탁·베델 / 국채보상운동 지원', '시험포인트': '대한매일신보' },
        { '장면': '교육', '스토리': '배재학당 / 아펜젤러 / 근대 선교사 학교', '시험포인트': '아펜젤러' },
        { '장면': '교육', '스토리': '이화학당 / 스크랜턴 / 여성 교육 선교사 학교', '시험포인트': '스크랜턴' },
        { '장면': '비교', '스토리': '육영공원 / 관립, 광혜원 / 알렌, 원산학사 / 사립', '시험포인트': '기관 비교' }
      ]
    }),
    '근대 사회·문화의 변화'
  );

  updateLessonMeta(lessons);
  write(PAGE_05, replaceLessons(source, lessons));
}

function update06Lessons() {
  const source = read(PAGE_06);
  const { lessons } = extractLessons(source);

  const domesticLesson = findLesson(lessons, '1920년대 실력양성운동');
  const material = findItem(domesticLesson, '물산장려운동(1923)과 민립대학설립운동');
  addKeywords(material, ['천도교', '손병희', '개벽', '방정환', '천도교소년회', '어린이날']);
  appendTextOnce(
    material,
    'explanation',
    '천도교 계열 문화 운동도 같이 잡는다. 천도교는 동학을 계승해 손병희 때 이름을 바꾸었고, 3·1운동 민족대표의 큰 축이었다. 1920년대에는 잡지 「개벽」, 방정환의 천도교소년회·어린이날 운동처럼 민중 계몽과 문화 운동으로도 이어졌다.'
  );
  addTableRows(material, [
    { '장면': '문화 운동', '스토리': '천도교 / 손병희 / 「개벽」·소년 운동과 연결', '시험포인트': '천도교' }
  ]);

  ensureItem(
    domesticLesson,
    concept({
      title: '천도교와 민중 계몽 운동',
      keywords: ['천도교', '손병희', '동학 계승', '3·1운동', '개벽', '방정환', '천도교소년회', '어린이날', '만세보'],
      background: '근대 이후 민족 종교는 신앙 영역에만 머물지 않고 계몽과 독립운동의 기반 역할도 맡았어.',
      explanation: '동학은 1905년 손병희가 천도교로 이름을 바꾸며 근대 민족 종교로 재편되었다. 천도교는 3·1운동 민족대표 33인의 핵심 축을 이루었고, 이후 잡지 「개벽」 발간과 방정환의 천도교소년회·어린이날 운동 같은 문화 계몽 활동으로도 이어졌다. 만세보 발간도 천도교 계열 언론 활동으로 자주 비교된다.',
      why: '천도교는 동학 농민 운동의 연장선, 3·1운동의 종교 기반, 1920년대 문화 운동으로 이어지는 흐름으로 기억하면 강하다.',
      trap: '천도교를 대종교·원불교와, 「개벽」을 대한매일신보·독립신문과 섞지 말아야 한다.',
      table: [
        { '장면': '개칭', '스토리': '동학 → 천도교 / 손병희', '시험포인트': '천도교 개칭' },
        { '장면': '독립운동', '스토리': '3·1운동 민족대표 33인에서 천도교 세력 비중 큼', '시험포인트': '3·1운동' },
        { '장면': '문화 운동', '스토리': '「개벽」·천도교소년회·방정환·어린이날', '시험포인트': '계몽 운동' }
      ]
    }),
    '물산장려운동(1923)과 민립대학설립운동'
  );

  const secretLesson = findLesson(lessons, '비밀 결사와 통합 운동');
  ensureItem(
    secretLesson,
    concept({
      title: '민족 종교와 독립운동 기반',
      keywords: ['대종교', '나철', '중광단', '북간도', '명동학교', '원불교', '박중빈', '새생활 운동'],
      background: '일제 강점기에는 종교가 단순 신앙을 넘어 민족 정체성과 독립운동 기반을 제공하기도 했어.',
      explanation: '대종교는 나철이 단군 신앙을 바탕으로 세운 민족 종교로, 북간도 무장 독립운동 기반인 중광단과도 연결된다. 북간도에서는 명동학교와 중광단을 함께 묶어 자주 출제한다. 원불교는 박중빈이 창시했고 새생활 운동을 전개했다. 민족 종교 문제는 창시자와 연결 단체를 함께 기억해야 한다.',
      why: '대종교·원불교는 이름보다 창시자와 독립운동 연결 고리를 같이 잡아야 시험에서 흔들리지 않는다.',
      trap: '대종교=나철·중광단, 원불교=박중빈·새생활 운동이다. 천도교는 손병희로 따로 구분한다.',
      table: [
        { '장면': '민족 종교', '스토리': '대종교 / 나철 / 단군 신앙 / 중광단 연결', '시험포인트': '대종교' },
        { '장면': '독립운동 기지', '스토리': '북간도 / 명동학교·중광단', '시험포인트': '중광단' },
        { '장면': '민족 종교', '스토리': '원불교 / 박중빈 / 새생활 운동', '시험포인트': '원불교' }
      ]
    }),
    '1910년대 국내 결사와 국외 독립운동 기지'
  );

  const thoughtLesson = findLesson(lessons, '사상과 1940년대 독립운동');
  const historiography = findItem(thoughtLesson, '민족사학과 역사 인식 (신채호·박은식)');
  addKeywords(historiography, ['정인보', '안재홍', '조선학운동', '얼', '한국독립운동지혈사', '한국통사', '독사신론']);
  appendTextOnce(
    historiography,
    'explanation',
    '정인보와 안재홍은 조선학 운동을 전개하며 우리말·우리 역사·우리 문화 연구를 강조했다. 정인보는 조선의 정신을 "얼"로 설명했고, 조선학 운동 속에서 여유당전서 간행도 중요한 단서로 잡는다.'
  );
  appendTextOnce(
    historiography,
    'trap',
    '신채호=독사신론·조선상고사, 박은식=한국통사·한국독립운동지혈사, 정인보=얼·조선학운동·여유당전서로 끊어 외워야 한다.'
  );
  addTableRows(historiography, [
    { '장면': '장면 3', '스토리': '정인보 / 얼 / 조선학 운동·여유당전서 간행', '시험포인트': '정인보' }
  ]);

  ensureItem(
    thoughtLesson,
    concept({
      title: '조선학 운동과 정인보',
      keywords: ['정인보', '얼', '조선학운동', '안재홍', '여유당전서', '국학 연구'],
      background: '식민사관이 조선을 무기력한 사회로 규정하자, 우리 문화와 사상을 주체적으로 재해석하려는 조선학 운동이 나타났어.',
      explanation: '정인보와 안재홍은 조선학 운동을 전개해 우리말·우리 역사·우리 문화 연구를 강화했다. 정인보는 조선의 정신을 "얼"이라고 설명했고, 실학 전통 재평가 흐름 속에서 여유당전서 간행도 중요하게 다루었다. 조선학 운동은 민족주의 사학과 연결되지만, 저술과 키워드는 신채호·박은식과 구분해야 한다.',
      why: '정인보는 시험에서 단독으로도 자주 나오므로 "얼-조선학운동-여유당전서" 묶음을 따로 세워 두는 편이 낫다.',
      trap: '정인보를 신채호·박은식 저술과 섞지 말아야 한다. 조선학 운동과 민족주의 사학은 연결되지만 같은 저술을 쓰지 않았다.',
      table: [
        { '장면': '인물', '스토리': '정인보 / 얼 / 조선 정신 강조', '시험포인트': '정인보' },
        { '장면': '운동', '스토리': '조선학 운동 / 안재홍·정인보 / 국학 연구 강화', '시험포인트': '조선학 운동' },
        { '장면': '자료', '스토리': '여유당전서 간행 / 실학 전통 재평가', '시험포인트': '여유당전서' }
      ]
    }),
    '민족사학과 역사 인식 (신채호·박은식)'
  );

  updateLessonMeta(lessons);
  write(PAGE_06, replaceLessons(source, lessons));
}

function q(id, kind, prompt, answer, clues, era, explanation, choices, aliases = []) {
  return {
    id: `hqg-${String(id).padStart(4, '0')}`,
    kind,
    prompt,
    answer,
    aliases,
    clues,
    era,
    type: '사용자 요청 근대 전면 보강',
    round: null,
    number: null,
    source: '사용자 요청 보강: 근대/일제강점기 세부 키워드 강화',
    explanation,
    ...(choices ? { choices } : {})
  };
}

const REMOVE_IDS = [
  'hqa-0283', 'hqa-0284', 'hqa-0286', 'hqa-0287', 'hqa-0289', 'hqa-0290',
  'hqa-0295', 'hqa-0296', 'hqa-0297', 'hqa-0298', 'hqa-0299', 'hqa-0301',
  'hqa-0302', 'hqa-0304', 'hqa-0305', 'hqa-0307', 'hqa-0308', 'hqa-0309',
  'hqa-0310', 'hqa-0311', 'hqb-0113', 'hqb-0115', 'hqb-0116', 'hqb-0152'
];

const EXTRA_QUESTIONS = [
  q(1, '주체 연결', '대한매일신보를 창간해 항일 언론 활동을 전개한 인물 조합을 고르세요.', '양기탁·베델', ['대한매일신보', '양기탁', '베델'], '근대', '대한매일신보는 양기탁과 영국인 베델이 중심이 되어 창간한 항일 신문이다.', ['양기탁·베델', '장지연·베델', '서재필·양기탁', '아펜젤러·베델']),
  q(2, '오답 함정', '대한매일신보와 직접 연결되는 활동으로 맞는 것을 고르세요.', '국채보상운동 지원과 일장기 말소 사건 보도', ['대한매일신보', '국채보상운동', '일장기 말소 사건'], '근대', '대한매일신보는 국채보상운동을 지원했고, 일장기 말소 사건 보도로도 유명하다.', ['국채보상운동 지원과 일장기 말소 사건 보도', '시일야방성대곡 게재와 독립문 건립', '독립협회 조직과 헌의 6조 결의', '조선혁명선언 발표와 의열단 조직']),
  q(3, '주체 연결', '배재학당을 세운 선교사를 고르세요.', '아펜젤러', ['배재학당', '선교사 학교', '근대 교육'], '근대', '배재학당은 아펜젤러가 세운 선교사 학교다.', ['아펜젤러', '알렌', '스크랜턴', '베델']),
  q(4, '주체 연결', '이화학당 설립과 연결되는 인물을 고르세요.', '스크랜턴', ['이화학당', '여성 교육', '선교사'], '근대', '이화학당은 스크랜턴과 연결되는 여성 교육 선교사 학교다.', ['알렌', '스크랜턴', '아펜젤러', '언더우드']),
  q(5, '오답 함정', '근대 교육 기관과 설립 인물 연결로 맞는 것을 고르세요.', '배재학당=아펜젤러, 이화학당=스크랜턴, 광혜원=알렌', ['배재학당', '이화학당', '광혜원'], '근대', '배재학당은 아펜젤러, 이화학당은 스크랜턴, 광혜원은 알렌으로 구분한다.', ['배재학당=아펜젤러, 이화학당=스크랜턴, 광혜원=알렌', '배재학당=베델, 이화학당=알렌, 광혜원=스크랜턴', '배재학당=서재필, 이화학당=아펜젤러, 광혜원=베델', '배재학당=알렌, 이화학당=베델, 광혜원=아펜젤러']),
  q(6, '개념 객관식', '동학을 계승해 손병희가 이름을 바꾼 종교를 고르세요.', '천도교', ['동학', '손병희', '개칭'], '일제 강점기', '동학은 손병희 때 천도교로 개칭되었다.', ['대종교', '천도교', '원불교', '보천교']),
  q(7, '오답 함정', '3·1운동 민족대표 33인과 가장 깊게 연결되는 종교 세력을 고르세요.', '천도교', ['3·1운동', '민족대표 33인', '종교'], '일제 강점기', '민족대표 33인에서 천도교 세력의 비중이 매우 컸다.', ['천도교', '대종교', '원불교', '유교구국회']),
  q(8, '개념 객관식', '잡지 「개벽」과 방정환의 소년 운동을 함께 묶을 수 있는 종교 계열을 고르세요.', '천도교', ['개벽', '방정환', '천도교소년회'], '일제 강점기', '천도교 계열은 「개벽」 발간과 방정환의 소년 운동으로 연결된다.', ['대종교', '천도교', '원불교', '불교청년회']),
  q(9, '주체 연결', '단군 신앙을 바탕으로 대종교를 세운 인물을 고르세요.', '나철', ['대종교', '단군', '나철'], '일제 강점기', '나철은 대종교와 오적암살단, 단군 신앙으로 연결된다.', ['신채호', '나철', '손병희', '박중빈']),
  q(10, '오답 함정', '북간도 독립운동 기지 연결로 맞는 것을 고르세요.', '명동학교·중광단', ['북간도', '중광단', '명동학교'], '일제 강점기', '북간도는 명동학교와 중광단으로 연결한다.', ['명동학교·중광단', '경학사·신흥무관학교', '권업회·권업신문', '한흥동·서전서숙']),
  q(11, '주체 연결', '원불교를 창시한 인물을 고르세요.', '박중빈', ['원불교', '박중빈', '새생활 운동'], '일제 강점기', '원불교는 박중빈이 창시했다.', ['박중빈', '손병희', '나철', '용성']),
  q(12, '개념 객관식', '새생활 운동과 함께 연결되는 종교를 고르세요.', '원불교', ['새생활 운동', '박중빈', '민족 종교'], '일제 강점기', '원불교는 박중빈과 새생활 운동으로 정리한다.', ['천도교', '대종교', '원불교', '대동교']),
  q(13, '오답 함정', '민족 종교와 인물 연결로 맞는 것을 고르세요.', '천도교=손병희, 대종교=나철, 원불교=박중빈', ['천도교', '대종교', '원불교'], '일제 강점기', '천도교는 손병희, 대종교는 나철, 원불교는 박중빈으로 구분한다.', ['천도교=손병희, 대종교=나철, 원불교=박중빈', '천도교=나철, 대종교=박중빈, 원불교=손병희', '천도교=박은식, 대종교=손병희, 원불교=나철', '천도교=서재필, 대종교=안창호, 원불교=박상진']),
  q(14, '오답 함정', '신채호의 저술과 역사 인식 연결로 맞는 것을 고르세요.', '독사신론·조선상고사·아와 비아의 투쟁', ['신채호', '독사신론', '조선상고사'], '일제 강점기', '신채호는 독사신론과 조선상고사, 아와 비아의 투쟁으로 역사를 설명했다.', ['독사신론·조선상고사·아와 비아의 투쟁', '한국통사·한국독립운동지혈사·국혼', '얼·여유당전서·조선학 운동', '동국통감·제왕운기·대동여지도']),
  q(15, '오답 함정', '박은식의 저술과 역사 인식 연결로 맞는 것을 고르세요.', '한국통사·한국독립운동지혈사·국혼', ['박은식', '한국통사', '국혼'], '일제 강점기', '박은식은 한국통사와 한국독립운동지혈사를 저술했고 국혼을 강조했다.', ['한국통사·한국독립운동지혈사·국혼', '독사신론·조선상고사·아와 비아의 투쟁', '얼·조선학 운동·여유당전서', '조선혁명선언·의열단·한인애국단']),
  q(16, '주체 연결', '조선의 정신을 "얼"로 설명하며 조선학 운동을 전개한 인물을 고르세요.', '정인보', ['정인보', '얼', '조선학 운동'], '일제 강점기', '정인보는 조선의 정신을 "얼"이라고 설명하며 조선학 운동을 전개했다.', ['신채호', '박은식', '정인보', '최남선']),
  q(17, '개념 객관식', '여유당전서 간행과 함께 연결되는 흐름을 고르세요.', '조선학 운동', ['여유당전서', '정인보', '국학 연구'], '일제 강점기', '여유당전서 간행은 정인보 등의 조선학 운동, 실학 재평가 흐름과 연결된다.', ['민립대학설립운동', '조선학 운동', '북학 운동', '대한광복회']),
  q(18, '오답 함정', '민족주의 사학과 조선학 운동 비교로 맞는 것을 고르세요.', '신채호·박은식은 민족주의 사학, 정인보·안재홍은 조선학 운동', ['민족주의 사학', '조선학 운동', '정인보'], '일제 강점기', '신채호·박은식은 민족주의 사학, 정인보·안재홍은 조선학 운동으로 구분한다.', ['신채호·박은식은 민족주의 사학, 정인보·안재홍은 조선학 운동', '신채호·안재홍은 민족주의 사학, 박은식·정인보는 조선의용대', '정인보·박은식은 조선학 운동, 신채호·안재홍은 국채보상운동', '신채호·정인보는 대종교, 박은식·안재홍은 천도교']),
  q(19, '주체 연결', '을사의병 때 홍주성 점령·홍주성 전투와 연결되는 인물을 고르세요.', '민종식', ['홍주성 점령', '홍주성 전투', '을사의병'], '근대', '민종식은 을사의병 시기 홍주성 전투, 홍주성 점령과 연결되는 대표 인물이다.', ['신돌석', '최익현', '민종식', '이인영']),
  q(20, '오답 함정', '을사의병 핵심 인물 연결로 맞는 것을 고르세요.', '신돌석=최초 평민 의병장, 최익현=태인 봉기·쓰시마 순국, 민종식=홍주성 점령', ['을사의병', '신돌석', '최익현', '민종식'], '근대', '을사의병은 신돌석, 최익현, 민종식을 구분하는 문제가 반복된다. 민종식은 홍주성 점령·전투로 잡는다.', ['신돌석=최초 평민 의병장, 최익현=태인 봉기·쓰시마 순국, 민종식=홍주성 점령', '신돌석=홍주성 점령, 최익현=의열단 조직, 민종식=헤이그 특사', '신돌석=공화정 주장, 최익현=중광단 결성, 민종식=샌프란시스코 의거', '신돌석=독립신문 창간, 최익현=차관 통치, 민종식=대한매일신보']),
  q(21, '오답 함정', '근대 언론 구분으로 맞는 것을 고르세요.', '황성신문=시일야방성대곡, 대한매일신보=양기탁·베델', ['황성신문', '대한매일신보', '장지연'], '근대', '황성신문은 장지연의 시일야방성대곡, 대한매일신보는 양기탁·베델로 구분한다.', ['황성신문=시일야방성대곡, 대한매일신보=양기탁·베델', '황성신문=양기탁·베델, 대한매일신보=시일야방성대곡', '황성신문=독립문 건립, 대한매일신보=헌의 6조 결의', '황성신문=의열단 기관지, 대한매일신보=임시정부 기관지']),
  q(22, '오답 함정', '근대 교육 기관 비교로 맞는 것을 고르세요.', '육영공원=관립, 원산학사=사립, 배재학당=아펜젤러', ['육영공원', '원산학사', '배재학당'], '근대', '육영공원은 관립, 원산학사는 사립, 배재학당은 아펜젤러의 선교사 학교다.', ['육영공원=관립, 원산학사=사립, 배재학당=아펜젤러', '육영공원=사립, 원산학사=관립, 배재학당=알렌', '육영공원=원불교, 원산학사=천도교, 배재학당=대종교', '육영공원=박문국, 원산학사=전환국, 배재학당=기기창']),
  q(23, '오답 함정', '조선학 운동 관련 설명으로 맞는 것을 고르세요.', '정인보·안재홍이 주도했고 여유당전서 간행이 연결된다', ['조선학 운동', '정인보', '여유당전서'], '일제 강점기', '조선학 운동은 정인보·안재홍이 주도했고, 여유당전서 간행 같은 실학 재평가와 연결된다.', ['정인보·안재홍이 주도했고 여유당전서 간행이 연결된다', '신채호·박은식이 주도했고 중광단 결성이 연결된다', '양기탁·베델이 주도했고 대한매일신보 창간이 연결된다', '손병희·박중빈이 주도했고 군대 해산이 연결된다']),
  q(24, '오답 함정', '민족사학 인물과 대표 단서 연결로 맞는 것을 고르세요.', '신채호=독사신론, 박은식=한국통사, 정인보=얼', ['신채호', '박은식', '정인보'], '일제 강점기', '민족주의 사학·조선학 운동은 대표 단서를 짝으로 외우는 편이 효율적이다.', ['신채호=독사신론, 박은식=한국통사, 정인보=얼', '신채호=얼, 박은식=독사신론, 정인보=한국통사', '신채호=대한매일신보, 박은식=배재학당, 정인보=국채보상운동', '신채호=대종교, 박은식=원불교, 정인보=천도교'])
];

function updateQuiz() {
  const quiz = JSON.parse(read(QUIZ_PATH));
  quiz.questions = (quiz.questions || []).filter(item => !String(item.id || '').startsWith('hqg-'));
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
  quiz.meta.user_requested_modern_overhaul = {
    generated_at: '2026-05-15',
    removed: REMOVE_IDS.length,
    added: EXTRA_QUESTIONS.length,
    focus: '근대·일제강점기 언론·교육·민족 종교·민족사학·조선학 운동 세부 키워드 보강'
  };

  write(QUIZ_PATH, `${JSON.stringify(quiz, null, 2)}\n`);
}

update05Lessons();
update06Lessons();
updateQuiz();
console.log(`Updated modern coverage pages and replaced ${REMOVE_IDS.length} quiz questions with ${EXTRA_QUESTIONS.length} strengthened items.`);
