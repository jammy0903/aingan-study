#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const ACHIEVEMENTS_PATH = path.join(ROOT, 'hankuksa', 'data', 'royal-achievements.json');
const FLOW_NOTES_PATH = path.join(ROOT, 'hankuksa', 'data', 'royal-flow-notes.json');
const PAGE_02_PATH = path.join(ROOT, 'hankuksa', '02', 'index.html');
const QUIZ_PATH = path.join(ROOT, 'hankuksa', 'quiz', 'questions.json');

const TARGET_TOTAL = 1000;
const GENERATED_PREFIX = 'hqe-';
const REFINED_PREFIX = 'hqf-';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function formatFlowNotes(notes) {
  const lines = ['['];
  notes.forEach((note, noteIndex) => {
    lines.push('  {');
    const entries = Object.entries(note);
    entries.forEach(([key, value], index) => {
      const comma = index === entries.length - 1 ? '' : ',';
      if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
        lines.push(`    ${JSON.stringify(key)}: [${value.map(item => JSON.stringify(item)).join(', ')}]${comma}`);
      } else {
        lines.push(`    ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
      }
    });
    lines.push(`  }${noteIndex === notes.length - 1 ? '' : ','}`);
  });
  lines.push(']');
  return `${lines.join('\n')}\n`;
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

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
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

function addTags(item, tags) {
  item.tags = unique([...(item.tags || []), ...tags]);
}

function appendTextOnce(item, field, text) {
  const current = item[field] || '';
  const marker = clean(text).slice(0, 48);
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

function updateAchievements() {
  const achievements = readJson(ACHIEVEMENTS_PATH);
  const byId = new Map(achievements.map(item => [item.id, item]));

  const patch = (id, fn) => {
    const item = byId.get(id);
    if (!item) throw new Error(`achievement not found: ${id}`);
    fn(item);
  };

  patch('baekje-geunchogo-346', item => {
    item.mnemonic = '**요고아마서부지도**';
    addKeywords(item, ['요고아마서부지도', '요서', '고국원왕 전사', '아직기', '마한', '서기', '부자상속', '칠지도']);
  });

  patch('baekje-muryeong-501', item => {
    item.mnemonic = '**담무지22**';
    addKeywords(item, ['담무지22', '담로', '무령왕릉', '지방 통제', '22담로']);
  });

  patch('baekje-seong-538', item => {
    item.mnemonic = '**성남노리사관**';
    addKeywords(item, ['성남노리사관', '성왕', '남부여', '노리사치계', '관산성']);
  });

  patch('silla-jinheung-545', item => {
    item.mnemonic = '**국대한화개황단**';
    addKeywords(item, ['국대한화개황단', '개국 연호', '개국 연호 사용']);
  });

  patch('silla-muyeol-654', item => {
    item.mnemonic = '**최초 진골 왕·사정부·무열왕계 세습**';
    addKeywords(item, ['왕권 강화', '태종 무열왕', '김춘추']);
  });

  patch('silla-munmu-676', item => {
    item.mnemonic = '**매기외대**';
    item.achievement = '당의 안동도호부·웅진도독부·계림도독부 설치에 맞서 고구려 부흥운동까지 지원하며 나당전쟁을 벌였고, 매소성·기벌포 전투 승리로 대동강 이남 중심의 삼국 통일을 완성했다. 문무왕은 외사정을 설치해 지방관을 감찰하게 했고, 동해 대왕암 전승과도 연결된다.';
    addKeywords(item, ['대왕암', '동해 대왕암']);
  });

  patch('silla-sinmun-681', item => {
    item.achievement = '김흠돌의 난을 진압하고 국학을 세웠으며 9주 5소경을 정비했다. 관료전을 지급하고 녹읍을 폐지해 귀족 세력을 억제하고 전제 왕권을 강화했다. 9서당 10정 정비, 감은사 완성, 만파식적 설화, 감은사지 3층 석탑도 신문왕 키워드다.';
    addKeywords(item, ['9서당 10정', '감은사지 3층 석탑', '감은사지 삼층석탑']);
  });

  patch('silla-gyeongdeok-757', item => {
    item.achievement = '녹읍이 부활하며 귀족의 경제 기반이 다시 강해졌다. 경덕왕 때 성덕대왕 신종, 곧 에밀레종 주조가 시작되었다.';
    addKeywords(item, ['성덕대왕 신종', '에밀레종', '신종 주조 시작']);
  });

  patch('balhae-daejoyeong-698', item => {
    item.mnemonic = '**천안대건흥: 대조영=천통**';
    addKeywords(item, ['천안대건흥']);
  });

  patch('balhae-mu-732', item => {
    item.mnemonic = '**천안대건흥: 무왕=인안**';
    item.achievement = '흑수말갈 문제와 당의 견제에 대응해 장문휴를 보내 산둥 등주를 선제 공격했다. 무왕의 연호는 인안이며, 당·신라와 대립한 팽창기 왕으로 잡는다.';
    addKeywords(item, ['천안대건흥', '당·신라와 대립', '선제 공격']);
  });

  patch('balhae-mun-756', item => {
    item.mnemonic = '**천안대건흥: 문왕=대흥**';
    item.achievement = '당 문물을 수용하고 3성 6부를 정비했으며 상경 용천부를 중심으로 국가 체제를 안정시켰다. 주자감을 설치하고 정당성의 대내상이 국정을 총괄했으며, 당·신라와 친선 관계를 맺었다. 문왕의 연호는 대흥이다.';
    addKeywords(item, ['천안대건흥', '주자감', '정당성', '대내상', '당·신라 친선', '상경 천도']);
  });

  patch('balhae-seon-818', item => {
    item.mnemonic = '**천안대건흥: 선왕=건흥**';
    addKeywords(item, ['천안대건흥', '62주 지방제도']);
  });

  patch('silla-late-local-powers-897', item => {
    item.mnemonic = '**6호선풍**';
    item.achievement = '6두품, 지방 호족, 선종 불교, 도선의 풍수지리설이 함께 성장해 반신라 세력과 후삼국 형성의 배경이 되었다. 지방 호족은 스스로 성주·장군이라 칭하며 성장했다.';
    addKeywords(item, ['6호선풍', '6두품', '호족', '선종 불교', '풍수지리']);
  });

  writeJson(ACHIEVEMENTS_PATH, achievements);
  return achievements;
}

function upsertFlowNote(notes, note) {
  const idx = notes.findIndex(item => item.id === note.id);
  if (idx >= 0) {
    notes[idx] = { ...notes[idx], ...note, tags: unique([...(notes[idx].tags || []), ...(note.tags || [])]) };
    return;
  }
  const before = notes.findIndex(item => item.insertBeforeId === note.insertBeforeId);
  if (before >= 0) notes.splice(before, 0, note);
  else notes.push(note);
}

function updateFlowNotes() {
  const notes = readJson(FLOW_NOTES_PATH);

  upsertFlowNote(notes, {
    id: 'baekje-silla-mnemonic-codes',
    insertBeforeId: 'baekje-geunchogo-346',
    label: '암기 코드',
    title: '백제·신라 핵심 왕 암기코드',
    body: '근초고왕은 **요고아마서부지도** = 요서·고국원왕·아직기·마한·서기·부자상속·칠지도. 무령왕은 **담무지22** = 22담로·무령왕릉·지방 통제. 성왕은 **성남노리사관** = 성왕·남부여·노리사치계·관산성. 진흥왕은 **국대한화개황단** = 국사 편찬·대가야 병합·한강 진출·화랑도 정비·개국 연호 사용·황룡사·단양 적성비.',
    dynasties: ['백제', '신라'],
    colorDynasty: '신라',
    tags: ['요고아마서부지도', '담무지22', '성남노리사관', '국대한화개황단', '개국 연호']
  });

  upsertFlowNote(notes, {
    id: 'unified-silla-middle-mnemonic',
    insertBeforeId: 'silla-muyeol-654',
    label: '신라 중대',
    title: '신라 중대는 삼국 통일 뒤 왕권 강화 흐름이다',
    body: '신라 중대는 무열왕계 왕위 세습에서 시작해 문무왕의 삼국 통일 완성, 신문왕의 김흠돌의 난 진압·국학·녹읍 폐지·9주 5소경·9서당 10정 정비로 왕권을 강화한 흐름이다. 성덕왕은 정전 지급, 경덕왕은 녹읍 부활과 성덕대왕 신종 주조 시작으로 잡는다.',
    dynasties: ['통일신라'],
    colorDynasty: '통일신라',
    tags: ['신라 중대', '무열왕', '문무왕', '신문왕', '성덕왕', '경덕왕', '신문국 녹돌 99 만감']
  });

  const balhae = notes.find(item => item.id === 'balhae-era-name-order-mnemonic');
  if (balhae) {
    balhae.body = '**천안대건흥** = 대조영 천통, 무왕 인안, 문왕 대흥, 선왕 건흥 순서다. 무왕은 장문휴의 등주 선제공격과 당·신라 대립, 문왕은 상경 천도·주자감·3성 6부와 정당성 대내상·당/신라 친선, 선왕은 5경 15부 62주와 해동성국으로 잡는다.';
    addTags(balhae, ['등주 선제공격', '주자감', '정당성 대내상', '5경 15부 62주']);
  }

  const late = notes.find(item => item.id === 'late-silla-rebellion-order-mnemonic');
  if (late) {
    late.body = '순서 중요: 김헌창의 난 → 장보고의 난 → 원종·애노의 난 → 적고적의 난. 연도는 822 → 846 → 889 → 896으로 잡는다. 반신라 세력은 **6호선풍** = 6두품·호족·선종 불교·풍수지리설로 묶는다.';
    addTags(late, ['6호선풍', '6두품', '호족', '선종 불교', '풍수지리설']);
  }

  fs.writeFileSync(FLOW_NOTES_PATH, formatFlowNotes(notes));
}

function extractLessons(source) {
  const match = source.match(/const LESSONS = (\[[\s\S]*?\]);\nlet curTab/);
  if (!match) throw new Error('LESSONS block not found in 02 page');
  return { lessons: JSON.parse(match[1]), originalJson: match[1] };
}

function replaceLessons(source, lessons) {
  return source.replace(
    /const LESSONS = \[[\s\S]*?\];\nlet curTab/,
    `const LESSONS = ${JSON.stringify(lessons, null, 2)};\nlet curTab`
  );
}

function findConcept(lessons, title) {
  for (const lesson of lessons) {
    for (const item of lesson.items || []) {
      if (item.title === title) return item;
    }
  }
  throw new Error(`concept not found: ${title}`);
}

function updateConceptPage02() {
  const source = fs.readFileSync(PAGE_02_PATH, 'utf8');
  const { lessons } = extractLessons(source);

  const geunchogo = findConcept(lessons, '근초고왕의 전성기');
  addKeywords(geunchogo, ['요고아마서부지도']);
  appendTextOnce(geunchogo, 'explanation', '암기코드: **요고아마서부지도** = 요서 진출, 고구려 고국원왕 전사, 아직기, 마한 정복, 서기 편찬, 부자 상속, 칠지도.');
  appendTextOnce(geunchogo, 'mnemonic', '【암기코드】 요고아마서부지도 = 요서·고국원왕·아직기·마한·서기·부자상속·칠지도.');

  const muryeongSeong = findConcept(lessons, '무령왕과 성왕');
  addKeywords(muryeongSeong, ['담무지22', '성남노리사관']);
  appendTextOnce(muryeongSeong, 'explanation', '암기코드: **담무지22** = 22담로, 무령왕릉, 지방 통제. **성남노리사관** = 성왕, 남부여, 노리사치계, 관산성.');
  appendTextOnce(muryeongSeong, 'mnemonic', '【암기코드】 무령왕은 담무지22, 성왕은 성남노리사관으로 묶는다.');
  addTableRows(muryeongSeong, [
    { '장면': '암기코드', '스토리': '담무지22 / 22담로·무령왕릉·지방 통제', '시험포인트': '무령왕' },
    { '장면': '암기코드', '스토리': '성남노리사관 / 성왕·남부여·노리사치계·관산성', '시험포인트': '성왕' }
  ]);

  const jinheung = findConcept(lessons, '진흥왕의 영토 확장');
  addKeywords(jinheung, ['국대한화개황단', '개국 연호']);
  appendTextOnce(jinheung, 'explanation', '암기코드: **국대한화개황단** = 국사 편찬, 대가야 병합, 한강 진출, 화랑도 정비, 개국 연호 사용, 황룡사, 단양 적성비.');
  appendTextOnce(jinheung, 'mnemonic', '【암기코드】 국대한화개황단 = 국사·대가야·한강·화랑도·개국 연호·황룡사·단양 적성비.');
  addTableRows(jinheung, [
    { '장면': '암기코드', '스토리': '국대한화개황단 / 국사·대가야·한강·화랑도·개국·황룡사·단양 적성비', '시험포인트': '진흥왕' }
  ]);

  const sinmun = findConcept(lessons, '신문왕의 체제 정비');
  addKeywords(sinmun, ['신문국 녹돌 99 만감', '감은사지 3층 석탑']);
  appendTextOnce(sinmun, 'explanation', '암기코드: **신문국 녹돌 99 만감** = 신문왕, 국학 설치, 녹읍 폐지, 김흠돌의 난, 9주 5소경, 9서당 10정, 만파식적, 감은사지 3층 석탑.');
  appendTextOnce(sinmun, 'mnemonic', '【암기코드】 신문국 녹돌 99 만감 = 신문왕·국학·녹읍 폐지·김흠돌·9주5소경·9서당10정·만파식적·감은사지 3층 석탑.');
  addTableRows(sinmun, [
    { '장면': '암기코드', '스토리': '신문국 녹돌 99 만감 / 국학·녹읍 폐지·김흠돌·9주5소경·9서당10정·만파식적·감은사지 3층 석탑', '시험포인트': '신문왕' }
  ]);

  const lateSilla = findConcept(lessons, '신라 하대의 동요와 새 세력');
  addKeywords(lateSilla, ['6호선풍']);
  appendTextOnce(lateSilla, 'explanation', '반신라 세력 암기코드: **6호선풍** = 6두품, 호족, 선종 불교, 풍수지리설.');
  appendTextOnce(lateSilla, 'mnemonic', '【암기코드】 6호선풍 = 6두품·호족·선종 불교·풍수지리설.');
  addTableRows(lateSilla, [
    { '장면': '암기코드', '스토리': '6호선풍 / 6두품·호족·선종 불교·풍수지리설', '시험포인트': '반신라 세력' }
  ]);

  const balhae = findConcept(lessons, '발해 왕들과 멸망');
  addKeywords(balhae, ['천안대건흥', '인안', '대흥', '건흥', '정당성 대내상']);
  appendTextOnce(balhae, 'explanation', '연호 암기코드: **천안대건흥** = 대조영 천통, 무왕 인안, 문왕 대흥, 선왕 건흥. 무왕은 장문휴의 등주 선제공격, 문왕은 상경 천도·주자감·3성6부·정당성 대내상·당/신라 친선, 선왕은 5경 15부 62주와 해동성국으로 정리한다.');
  appendTextOnce(balhae, 'mnemonic', '【암기코드】 천안대건흥 = 대조영 천통 → 무왕 인안 → 문왕 대흥 → 선왕 건흥.');
  addTableRows(balhae, [
    { '장면': '연호', '스토리': '천안대건흥 / 대조영 천통·무왕 인안·문왕 대흥·선왕 건흥', '시험포인트': '발해 연호' },
    { '장면': '문왕', '스토리': '상경 천도·주자감·3성6부·정당성 대내상·당/신라 친선', '시험포인트': '문왕' }
  ]);

  fs.writeFileSync(PAGE_02_PATH, replaceLessons(source, lessons));
}

function subjectText(item) {
  const subject = clean(item.king);
  const dynasty = clean(item.dynasty);
  if (!dynasty || compact(subject).startsWith(compact(dynasty))) return subject;
  return `${dynasty} ${subject}`;
}

function titleChoicePool(item, achievements) {
  const sameDynasty = achievements
    .filter(other => other.id !== item.id && other.dynasty === item.dynasty)
    .sort((a, b) => Math.abs((a.sort || 0) - (item.sort || 0)) - Math.abs((b.sort || 0) - (item.sort || 0)));
  const samePeriod = achievements
    .filter(other => other.id !== item.id && other.period === item.period && other.dynasty !== item.dynasty)
    .sort((a, b) => stableHash(`${item.id}|${a.id}`).localeCompare(stableHash(`${item.id}|${b.id}`)));
  return unique([...sameDynasty, ...samePeriod].map(other => other.title));
}

function subjectChoicePool(item, achievements) {
  const answer = subjectText(item);
  const samePeriod = achievements
    .filter(other => other.id !== item.id && other.period === item.period)
    .sort((a, b) => Math.abs((a.sort || 0) - (item.sort || 0)) - Math.abs((b.sort || 0) - (item.sort || 0)));
  return unique(samePeriod.map(subjectText)).filter(value => compact(value) !== compact(answer));
}

function actorChoicePool(item, achievements) {
  const answer = clean(item.king);
  const sameDynasty = achievements
    .filter(other => other.id !== item.id && other.dynasty === item.dynasty)
    .sort((a, b) => Math.abs((a.sort || 0) - (item.sort || 0)) - Math.abs((b.sort || 0) - (item.sort || 0)));
  const samePeriod = achievements
    .filter(other => other.id !== item.id && other.period === item.period && other.dynasty !== item.dynasty)
    .sort((a, b) => Math.abs((a.sort || 0) - (item.sort || 0)) - Math.abs((b.sort || 0) - (item.sort || 0)));
  return unique([...sameDynasty, ...samePeriod].map(other => clean(other.king)))
    .filter(value => compact(value) !== compact(answer));
}

function eraSubjectChoicePool(item, achievements) {
  const answer = `${item.dynasty} · ${item.king}`;
  const samePeriod = achievements
    .filter(other => other.id !== item.id && other.period === item.period)
    .sort((a, b) => Math.abs((a.sort || 0) - (item.sort || 0)) - Math.abs((b.sort || 0) - (item.sort || 0)));
  return unique(samePeriod.map(other => `${other.dynasty} · ${other.king}`))
    .filter(value => compact(value) !== compact(answer));
}

function choicesFor(answer, pool, salt) {
  const answerKey = compact(answer);
  const distractors = unique(pool).filter(value => compact(value) !== answerKey).slice(0, 3);
  if (distractors.length < 3) throw new Error(`not enough distractors for ${answer}`);
  return [answer, ...distractors]
    .sort((a, b) => stableHash(`${salt}|${a}`).localeCompare(stableHash(`${salt}|${b}`)));
}

function safeTerms(item) {
  const answerKey = compact(item.title);
  const raw = unique([
    ...(item.mnemonic ? [item.mnemonic.replace(/\*\*/g, '')] : []),
    ...(item.keywords || []),
    item.category,
    item.dynasty
  ]);
  return raw
    .filter(term => {
      const key = compact(term);
      if (key.length < 2) return false;
      if (answerKey.includes(key) || key.includes(answerKey)) return false;
      return true;
    })
    .slice(0, 4);
}

function baseQuestion(id, kind, prompt, answer, clues, era, explanation, choices, aliases = []) {
  return {
    id,
    kind,
    prompt: clean(prompt),
    answer: clean(answer),
    aliases,
    clues: clues || [],
    era,
    type: '사용자 요청 고대 암기 보강',
    round: null,
    number: null,
    source: '사용자 요청: 남북국·삼국 왕 암기법 및 퀴즈 품질 정리',
    explanation: clean(explanation),
    choices
  };
}

function buildGeneratedAchievementQuestions(achievements, nextId) {
  return achievements.map(item => {
    const terms = safeTerms(item);
    const fallback = unique([item.king, item.year, item.dynasty]).filter(term => {
      const key = compact(term);
      return key && !compact(item.title).includes(key) && !key.includes(compact(item.title));
    });
    const clue = terms.length ? terms.join(' · ') : fallback.join(' · ');
    const answer = item.title;
    return baseQuestion(
      nextId(),
      '암기 단서 연결',
      `다음 암기 단서와 연결되는 사건·업적을 고르세요: ${clue}`,
      answer,
      unique([item.dynasty, item.period, item.king, item.category].filter(value => !compact(answer).includes(compact(value)))).slice(0, 5),
      item.period,
      `${answer}은 ${subjectText(item)}과 연결된다. ${item.achievement}`,
      choicesFor(answer, titleChoicePool(item, achievements), `${item.id}|title`)
    );
  });
}

function manualAncientQuestions(nextId, achievements) {
  const ancientSubjects = achievements.filter(item => item.period === '삼국·남북국');
  const subjectPool = item => subjectChoicePool(item, achievements);
  const byId = new Map(achievements.map(item => [item.id, item]));
  const q = (kind, prompt, answer, clues, explanation, choices, aliases = []) =>
    baseQuestion(nextId(), kind, prompt, answer, clues, '삼국·남북국', explanation, choices, aliases);

  return [
    q('암기 코드', '요서·고국원왕·아직기·마한·서기·부자상속·칠지도를 한 번에 묶는 암기코드를 고르세요.', '요고아마서부지도', ['근초고왕', '백제 전성기'], '요고아마서부지도는 근초고왕의 백제 전성기 단서를 압축한 코드다.', ['요고아마서부지도', '담무지22', '성남노리사관', '국대한화개황단']),
    q('암기 코드', '22담로·무령왕릉·지방 통제를 묶는 무령왕 암기코드를 고르세요.', '담무지22', ['무령왕', '22담로'], '담무지22는 무령왕의 22담로와 무령왕릉, 지방 통제 단서를 묶는다.', ['담무지22', '요고아마서부지도', '성남노리사관', '국대한화개황단']),
    q('암기 코드', '성왕·남부여·노리사치계·관산성을 묶는 암기코드를 고르세요.', '성남노리사관', ['성왕', '남부여', '노리사치계', '관산성'], '성남노리사관은 성왕의 사비 천도 이후 중흥과 관산성 전사를 함께 떠올리게 하는 코드다.', ['성남노리사관', '담무지22', '국대한화개황단', '신문국 녹돌 99 만감']),
    q('암기 코드', '국사 편찬·대가야 병합·한강 진출·화랑도 정비·개국 연호·황룡사·단양 적성비를 묶는 암기코드를 고르세요.', '국대한화개황단', ['진흥왕', '개국 연호'], '국대한화개황단은 진흥왕의 전성기 업적을 묶는다. 여기서 개는 개국 연호 사용이다.', ['국대한화개황단', '성남노리사관', '담무지22', '천안대건흥']),
    q('암기 코드', '신문왕의 국학·녹읍 폐지·김흠돌의 난·9주5소경·9서당10정·만파식적·감은사지 3층 석탑을 묶는 코드를 고르세요.', '신문국 녹돌 99 만감', ['신문왕', '왕권 강화'], '신문국 녹돌 99 만감은 신문왕의 왕권 강화 정책과 설화·문화 단서를 함께 묶는다.', ['신문국 녹돌 99 만감', '천안대건흥', '6호선풍', '국대한화개황단']),
    q('암기 코드', '발해 왕과 연호 순서 대조영 천통-무왕 인안-문왕 대흥-선왕 건흥을 묶는 코드를 고르세요.', '천안대건흥', ['발해', '연호'], '천안대건흥은 발해 왕의 연호 순서를 묶는 코드다.', ['천안대건흥', '국대한화개황단', '성남노리사관', '6호선풍']),
    q('암기 코드', '신라 하대 반신라 세력 6두품·호족·선종 불교·풍수지리설을 묶는 암기코드를 고르세요.', '6호선풍', ['신라 하대', '반신라 세력'], '6호선풍은 신라 하대 새 세력과 사상 흐름을 압축한다.', ['6호선풍', '천안대건흥', '신문국 녹돌 99 만감', '담무지22']),
    q('순서 배열', '신라 하대 반란 순서로 맞는 것을 고르세요.', '김헌창의 난-장보고의 난-원종·애노의 난-적고적의 난', ['신라 하대', '반란 순서'], '신라 하대 반란 순서는 김헌창(822) → 장보고(846) → 원종·애노(889) → 적고적(896)이다.', ['김헌창의 난-장보고의 난-원종·애노의 난-적고적의 난', '장보고의 난-김헌창의 난-원종·애노의 난-적고적의 난', '원종·애노의 난-김헌창의 난-장보고의 난-적고적의 난', '김헌창의 난-원종·애노의 난-장보고의 난-적고적의 난']),
    q('순서 배열', '신라 중대 왕권 강화 흐름으로 맞는 순서를 고르세요.', '무열왕-문무왕-신문왕-성덕왕-경덕왕', ['신라 중대', '왕권 강화'], '신라 중대는 무열왕계 왕위 세습, 문무왕 통일 완성, 신문왕 왕권 강화, 성덕왕 정전 지급, 경덕왕 녹읍 부활 순서로 잡는다.', ['무열왕-문무왕-신문왕-성덕왕-경덕왕', '문무왕-무열왕-신문왕-경덕왕-성덕왕', '신문왕-문무왕-무열왕-성덕왕-경덕왕', '무열왕-신문왕-문무왕-성덕왕-경덕왕']),
    q('오답 함정', '진흥왕 암기코드 국대한화개황단에서 “개”가 뜻하는 내용을 고르세요.', '개국 연호 사용', ['진흥왕', '국대한화개황단'], '국대한화개황단의 개는 진흥왕의 개국 연호 사용으로 잡는다.', ['개국 연호 사용', '건원 연호 사용', '광덕·준풍 연호 사용', '천통 연호 사용']),
    q('오답 함정', '문왕의 발해 제도 정비와 직접 연결되는 조합을 고르세요.', '주자감·3성 6부·정당성 대내상·대흥', ['발해 문왕', '대흥'], '발해 문왕은 대흥 연호, 상경 천도, 주자감, 3성 6부, 정당성 대내상, 당·신라 친선으로 잡는다.', ['주자감·3성 6부·정당성 대내상·대흥', '장문휴·등주 공격·인안·당 대립', '5경 15부 62주·건흥·해동성국', '청해진·완도·염장·문성왕']),
    q('오답 함정', '발해 무왕과 직접 연결되는 조합을 고르세요.', '장문휴의 등주 선제공격·인안', ['발해 무왕', '장문휴'], '무왕은 장문휴를 보내 당의 등주를 선제공격했고 연호는 인안이다.', ['장문휴의 등주 선제공격·인안', '주자감 설치·대흥', '5경 15부 62주·건흥', '동모산 건국·천통']),
    q('오답 함정', '발해 선왕과 직접 연결되는 조합을 고르세요.', '5경 15부 62주·해동성국·건흥', ['발해 선왕', '해동성국'], '선왕은 5경 15부 62주 정비와 해동성국, 건흥 연호로 잡는다.', ['5경 15부 62주·해동성국·건흥', '동모산 건국·천통', '장문휴 등주 공격·인안', '주자감·정당성 대내상·대흥']),
    q('오답 함정', '경덕왕과 연결되는 통일신라 경제·문화 단서로 맞는 것을 고르세요.', '녹읍 부활·성덕대왕 신종 주조 시작', ['경덕왕', '녹읍 부활'], '경덕왕은 녹읍 부활과 성덕대왕 신종 주조 시작으로 잡는다.', ['녹읍 부활·성덕대왕 신종 주조 시작', '정전 지급·신문왕 즉위', '녹읍 폐지·국학 설치', '독서삼품과 시행·청해진 설치']),
    q('오답 함정', '문무왕과 직접 연결되는 조합을 고르세요.', '매소성·기벌포·삼국 통일 완성·대왕암·외사정', ['문무왕', '삼국 통일'], '문무왕은 매소성·기벌포 승리로 삼국 통일을 완성했고 대왕암, 외사정과 연결된다.', ['매소성·기벌포·삼국 통일 완성·대왕암·외사정', '김흠돌의 난·국학·녹읍 폐지', '정전 지급·성덕대왕 신종 완성', '청해진·완도·장보고의 난']),
    q('주체 연결', '김춘추, 최초 진골 출신 왕, 사정부 설치, 왕위 세습 흐름과 연결되는 왕을 고르세요.', '무열왕', ['태종 무열왕', '김춘추'], '태종 무열왕 김춘추는 최초 진골 출신 왕이고 사정부 설치, 무열왕계 왕위 세습과 연결된다.', ['무열왕', '문무왕', '신문왕', '진흥왕'], ['태종 무열왕', '김춘추']),
    q('주체 연결', '왕족의 22담로 파견, 중국 남조식 벽돌무덤·묘지석, 지방 통제와 연결되는 왕을 고르세요.', '무령왕', ['담무지22', '22담로'], '무령왕은 22담로와 무령왕릉, 지방 통제 단서로 잡는다.', ['무령왕', '성왕', '근초고왕', '동성왕']),
    q('주체 연결', '사비 천도, 남부여, 노리사치계, 관산성 전사와 연결되는 왕을 고르세요.', '성왕', ['성남노리사관'], '성왕은 사비 천도, 남부여, 노리사치계, 관산성 전사로 잡는다.', ['성왕', '무령왕', '근초고왕', '의자왕']),
    q('주체 연결', '국사 편찬, 대가야 병합, 한강 진출, 화랑도, 개국 연호, 황룡사, 단양 적성비와 연결되는 왕을 고르세요.', '진흥왕', ['국대한화개황단'], '진흥왕은 신라 전성기의 왕으로 국대한화개황단 코드와 연결된다.', ['진흥왕', '법흥왕', '지증왕', '성왕']),
    q('주체 연결', '국학 설치, 녹읍 폐지, 김흠돌의 난, 9주5소경, 9서당10정, 만파식적과 연결되는 왕을 고르세요.', '신문왕', ['신문국 녹돌 99 만감'], '신문왕은 통일 직후 왕권 강화와 제도 정비의 핵심 왕이다.', ['신문왕', '문무왕', '성덕왕', '경덕왕']),
    q('주체 연결', '완도 청해진을 설치하고 해상 무역을 장악한 인물을 고르세요.', '장보고', ['완도', '청해진'], '장보고는 완도 청해진을 설치해 해상 무역을 장악했다.', ['장보고', '김헌창', '최치원', '궁예'])
  ];
}

function trueSubjectTitlePairs(achievements) {
  return new Set(achievements.map(item => compact(`${subjectText(item)} - ${item.title}`)));
}

function pairedDistractors(item, achievements, truePairs) {
  const near = [
    ...achievements
      .filter(other => other.id !== item.id && other.dynasty === item.dynasty)
      .sort((a, b) => Math.abs((a.sort || 0) - (item.sort || 0)) - Math.abs((b.sort || 0) - (item.sort || 0))),
    ...achievements
      .filter(other => other.id !== item.id && other.period === item.period && other.dynasty !== item.dynasty)
      .sort((a, b) => Math.abs((a.sort || 0) - (item.sort || 0)) - Math.abs((b.sort || 0) - (item.sort || 0)))
  ];
  const candidates = [];
  for (const other of near) {
    if (compact(subjectText(other)) !== compact(subjectText(item))) {
      candidates.push(`${subjectText(other)} - ${item.title}`);
      candidates.push(`${subjectText(item)} - ${other.title}`);
    }
  }
  for (let i = 0; i < near.length; i += 1) {
    for (let j = i + 1; j < near.length; j += 1) {
      if (compact(subjectText(near[i])) !== compact(subjectText(near[j]))) {
        candidates.push(`${subjectText(near[i])} - ${near[j].title}`);
        candidates.push(`${subjectText(near[j])} - ${near[i].title}`);
      }
    }
  }
  return unique(candidates).filter(value => !truePairs.has(compact(value))).slice(0, 12);
}

function buildPairingQuestion(item, achievements, nextRefinedId, truePairs) {
  const answer = `${subjectText(item)} - ${item.title}`;
  return baseQuestion(
    nextRefinedId(),
    '오답 함정',
    `${item.period} ${item.dynasty} 범위에서 주체와 사건·업적의 연결이 맞는 것을 고르세요.`,
    answer,
    unique([item.period, item.dynasty, item.category, ...(item.keywords || []).slice(0, 2)]),
    item.period,
    `${subjectText(item)}과 ${item.title}의 연결을 묻는 문항이다. 비슷한 시기·같은 왕조의 주체와 업적을 서로 바꾼 오답을 구분해야 한다.`,
    choicesFor(answer, pairedDistractors(item, achievements, truePairs), `${item.id}|pairing`)
  );
}

function chronologyDistractors(first, second, ordered) {
  const answer = `${first.title} → ${second.title}`;
  const candidates = [`${second.title} → ${first.title}`];
  const beforeFirst = [...ordered].reverse().find(item => item.period === first.period && item.sort < first.sort && item.id !== first.id);
  const afterSecond = ordered.find(item => item.period === second.period && item.sort > second.sort && item.id !== second.id);
  if (beforeFirst) candidates.push(`${first.title} → ${beforeFirst.title}`);
  if (afterSecond) candidates.push(`${afterSecond.title} → ${second.title}`);
  candidates.push(`${second.title} → ${beforeFirst?.title || first.title}`);
  candidates.push(`${afterSecond?.title || second.title} → ${first.title}`);
  return unique(candidates).filter(value => compact(value) !== compact(answer)).slice(0, 8);
}

function buildChronologyReplacementQuestions(achievements, nextRefinedId, limit) {
  const ordered = [...achievements].sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id.localeCompare(b.id));
  const questions = [];
  for (let i = 0; i < ordered.length - 1 && questions.length < limit; i += 1) {
    const first = ordered[i];
    const second = ordered.slice(i + 1).find(item => item.period === first.period && item.sort > first.sort);
    if (!second) continue;
    const answer = `${first.title} → ${second.title}`;
    const distractors = chronologyDistractors(first, second, ordered);
    if (distractors.length < 3) continue;
    questions.push(baseQuestion(
      nextRefinedId(),
      '순서 배열',
      `${first.period} 흐름에서 사건·업적의 시기 순서가 맞는 것을 고르세요.`,
      answer,
      unique([first.period, first.dynasty, second.dynasty, first.king, second.king]),
      first.period,
      `${first.title}이 먼저이고, 이후 흐름에서 ${second.title}이 이어진다.`,
      choicesFor(answer, distractors, `${first.id}|${second.id}|chronology`)
    ));
  }
  return questions;
}

function buildRefinedReplacementQuestions(achievements, count) {
  let seq = 1;
  const nextRefinedId = () => `${REFINED_PREFIX}${String(seq++).padStart(4, '0')}`;
  const truePairs = trueSubjectTitlePairs(achievements);
  const pairQuestions = achievements.map(item => buildPairingQuestion(item, achievements, nextRefinedId, truePairs));
  const chronologyQuestions = buildChronologyReplacementQuestions(
    achievements,
    nextRefinedId,
    Math.max(0, count - pairQuestions.length)
  );
  const questions = [...pairQuestions, ...chronologyQuestions];
  if (questions.length < count) {
    throw new Error(`Not enough refined replacement questions: expected ${count}, got ${questions.length}`);
  }
  return questions.slice(0, count);
}

function shouldRemoveOriginalChoiceQuestion(item) {
  return String(item.id || '').startsWith('hq-') && Array.isArray(item.choices);
}

function shouldRemoveDuplicateOrWeakQuestion(item) {
  const id = String(item.id || '');
  const prompt = clean(item.prompt);
  if (id.startsWith('hqa-') && item.kind === '시대 연결' && prompt.startsWith('다음 단서와 연결되는 시대·주체를 고르세요')) {
    return true;
  }
  if (id.startsWith('hqb-') && item.kind === '주체 단답' && prompt.startsWith('다음 단서와 연결되는 주체를 고르세요')) {
    return true;
  }
  return false;
}

function scoreAchievementMatch(item, achievement) {
  const haystack = compact(`${item.prompt} ${item.answer} ${item.explanation} ${(item.clues || []).join(' ')}`);
  let score = 0;
  for (const value of [achievement.title, achievement.achievement, achievement.king, achievement.dynasty, achievement.category]) {
    const key = compact(value);
    if (key && haystack.includes(key)) score += key.length > 12 ? 3 : 1;
  }
  for (const keyword of achievement.keywords || []) {
    const key = compact(keyword);
    if (key && haystack.includes(key)) score += 1;
  }
  return score;
}

function achievementForQuestion(item, achievements) {
  const answerKey = compact(item.answer);
  const exactTitle = achievements.find(achievement => compact(achievement.title) === answerKey);
  if (exactTitle) return exactTitle;
  const exactSubject = achievements
    .filter(achievement => compact(achievement.king) === answerKey || compact(subjectText(achievement)) === answerKey || compact(`${achievement.dynasty} · ${achievement.king}`) === answerKey)
    .map(achievement => ({ achievement, score: scoreAchievementMatch(item, achievement) }))
    .sort((a, b) => b.score - a.score || (a.achievement.sort || 0) - (b.achievement.sort || 0))[0];
  if (exactSubject?.score > 0) return exactSubject.achievement;

  return achievements
    .map(achievement => ({ achievement, score: scoreAchievementMatch(item, achievement) }))
    .filter(match => match.score >= 4)
    .sort((a, b) => b.score - a.score || (a.achievement.sort || 0) - (b.achievement.sort || 0))[0]?.achievement || null;
}

function tightenChoices(item, achievements) {
  if (!Array.isArray(item.choices)) return item;
  const achievement = achievementForQuestion(item, achievements);
  if (!achievement) return item;

  const answerKey = compact(item.answer);
  let pool = null;
  if (compact(achievement.title) === answerKey) {
    pool = titleChoicePool(achievement, achievements);
  } else if (compact(achievement.king) === answerKey) {
    pool = actorChoicePool(achievement, achievements);
  } else if (compact(subjectText(achievement)) === answerKey) {
    pool = subjectChoicePool(achievement, achievements);
  } else if (compact(`${achievement.dynasty} · ${achievement.king}`) === answerKey) {
    pool = eraSubjectChoicePool(achievement, achievements);
  }
  if (!pool) return item;
  return {
    ...item,
    choices: choicesFor(item.answer, pool, `${item.id}|tightened`)
  };
}

function rewriteAnswerInPrompt(item) {
  const rewrites = {
    'hqa-0217': {
      prompt: '최고 정책 심의·행정 실무·언론/감찰/경연 기능 구분과 맞는 조선 중앙 제도를 고르세요.',
      choices: [
        '의정부·6조·삼사',
        '비변사·훈련도감·속오군',
        '승정원·의금부·한성부',
        '홍문관·예문관·춘추관'
      ]
    },
    'hqb-0099': {
      prompt: '보국안민·제폭구민 구호, 전봉준, 집강소 단서와 연결되는 운동을 고르세요.',
      choices: [
        '동학농민운동',
        '갑신정변',
        '독립협회 운동',
        '을미의병'
      ]
    },
    'hqb-0195': {
      prompt: '자의 대비 상복 기간을 둘러싸고 서인과 남인이 두 차례 대립한 사건을 고르세요.',
      choices: [
        '예송 논쟁',
        '기묘사화',
        '인조반정',
        '환국 정치'
      ]
    },
    'hqb-0212': {
      prompt: '군국기무처 주도, 개국 기년, 의정부·8아문, 탁지아문 재정 일원화와 연결되는 개혁을 고르세요.',
      choices: [
        '갑오개혁 1차',
        '갑오개혁 2차',
        '을미개혁',
        '광무개혁'
      ]
    },
    'hqb-0213': {
      prompt: '홍범 14조, 7부 설치, 23부 개편, 재판소 설치와 연결되는 개혁을 고르세요.',
      choices: [
        '갑오개혁 2차',
        '갑오개혁 1차',
        '을미개혁',
        '광무개혁'
      ]
    },
    'hqb-0214': {
      prompt: '건양 연호, 친위대·진위대, 단발령, 태양력, 종두법과 연결되는 개혁을 고르세요.',
      choices: [
        '을미개혁',
        '갑오개혁 1차',
        '갑오개혁 2차',
        '광무개혁'
      ]
    },
    'ht-0010': {
      answer: '원 영향이 나타나는 고려 후기 대리석 10층 석탑',
      prompt: '경천사지 10층 석탑과 가장 알맞은 설명을 고르세요.',
      choices: [
        '원 영향이 나타나는 고려 후기 대리석 10층 석탑',
        '익산 미륵사지의 목탑 계통 석탑',
        '감은사지의 쌍탑식 3층 석탑',
        '원각사지의 대리석 10층 석탑'
      ],
      explanation: '경천사지 10층 석탑은 원의 영향을 받은 고려 후기 대리석 석탑이다. 조선 전기 원각사지 10층 석탑과 양식상 연결되지만 시대와 위치를 구분해야 한다.'
    },
    'ht-0012': {
      answer: '무왕 때 익산에 세운 백제 석탑',
      prompt: '미륵사지 석탑과 가장 알맞은 설명을 고르세요.',
      choices: [
        '무왕 때 익산에 세운 백제 석탑',
        '사비 도성 중심 사찰에 세운 백제의 5층 석탑',
        '원 영향이 나타나는 고려 후기 대리석 10층 석탑',
        '신문왕 때 감은사 터에 세운 3층 석탑'
      ],
      explanation: '미륵사지 석탑은 백제 무왕 때 익산 미륵사에 세운 석탑으로, 정림사지 5층 석탑·경천사지 10층 석탑·감은사지 3층 석탑과 구분한다.'
    },
    'hqa-0162': {
      answer: '주심포 양식의 고려 목조 건축',
      prompt: '부석사 무량수전에 대한 설명으로 맞는 것을 고르세요.',
      choices: [
        '주심포 양식의 고려 목조 건축',
        '다포 양식이 두드러지는 조선 전기 궁궐 정전',
        '익공 양식이 확산된 조선 후기 향교 건축',
        '서양식 석재와 철골 구조를 쓴 근대 건축'
      ],
      explanation: '부석사 무량수전은 고려 시대 주심포 양식 목조 건축으로 출제된다. 공포 양식과 시대를 함께 구분해야 한다.'
    },
    'hqa-0174': {
      answer: '원 영향이 반영된 고려 후기 대리석 석탑',
      prompt: '경천사지 10층 석탑에 대한 설명으로 맞는 것을 고르세요.',
      choices: [
        '원 영향이 반영된 고려 후기 대리석 석탑',
        '무왕 때 익산 미륵사에 조성한 석탑',
        '신문왕 때 감은사 터에 세운 3층 석탑',
        '세조 때 원각사 터에 세운 대리석 10층 석탑'
      ],
      explanation: '경천사지 10층 석탑은 고려 후기 원 간섭기 문화의 영향을 보여 주는 대리석 석탑이다.'
    },
    'hqa-0309': {
      prompt: '환구단 황제 즉위, 대한국 국제, 지계 발급·양전 사업 단서에 맞는 시대·주체 연결을 고르세요.',
      choices: [
        '대한제국 · 고종',
        '조선 · 고종',
        '대한제국 · 순종',
        '조선 · 흥선대원군'
      ],
      explanation: '환구단 황제 즉위, 대한국 국제, 양전 사업과 지계 발급은 대한제국 고종의 광무개혁 흐름과 연결된다.'
    },
    'hqa-0329': {
      answer: '직지=금속 활자, 팔만대장경=몽골 침입기 목판 대장경',
      prompt: '고려 인쇄 문화유산의 연결로 맞는 것을 고르세요.',
      choices: [
        '직지=금속 활자, 팔만대장경=몽골 침입기 목판 대장경',
        '직지=목판 인쇄본, 팔만대장경=금속 활자본',
        '직지=초조대장경판, 팔만대장경=조선 세종 때 활자본',
        '직지=거란 침입 때 조성, 팔만대장경=원 간섭기 불교 서적'
      ],
      explanation: '직지는 현존하는 오래된 금속 활자본이고, 팔만대장경은 몽골 침입기에 조판한 목판 대장경이다.'
    },
    'hm-0005': {
      answer: '고려 중추원=군사·왕명 출납, 독립협회 중추원=의회식 개편 추진, 총독부 중추원=자문 기구',
      prompt: '중추원이라는 이름이 나올 때 시대별 성격 연결로 맞는 것을 고르세요.',
      choices: [
        '고려 중추원=군사·왕명 출납, 독립협회 중추원=의회식 개편 추진, 총독부 중추원=자문 기구',
        '고려 중추원=회계 담당 삼사, 독립협회 중추원=군국기무처 개편, 총독부 중추원=헌병 경찰 기구',
        '고려 중추원=도병마사 후신, 독립협회 중추원=집강소 운영, 총독부 중추원=형평사 본부',
        '고려 중추원=언론 삼사, 독립협회 중추원=갑신정변 내각, 총독부 중추원=임시 의정원'
      ],
      explanation: '중추원은 고려의 군사·왕명 출납 기구, 독립협회의 의회식 개편 요구, 일제 강점기 총독부 자문 기구를 구분해야 한다.'
    }
  };
  if (!rewrites[item.id]) return item;
  return { ...item, ...rewrites[item.id] };
}

function recalcKinds(questions) {
  return Object.fromEntries(
    Object.entries(questions.reduce((acc, item) => {
      acc[item.kind] = (acc[item.kind] || 0) + 1;
      return acc;
    }, {})).sort(([a], [b]) => a.localeCompare(b, 'ko'))
  );
}

function validateQuiz(questions) {
  if (questions.length !== TARGET_TOTAL) {
    throw new Error(`Expected ${TARGET_TOTAL} questions, got ${questions.length}`);
  }

  const ids = new Set();
  const promptAnswers = new Set();
  const answerInPrompt = [];
  for (const item of questions) {
    if (ids.has(item.id)) throw new Error(`Duplicate id: ${item.id}`);
    ids.add(item.id);
    const key = compact(`${item.prompt}|${item.answer}`);
    if (promptAnswers.has(key)) throw new Error(`Duplicate prompt-answer: ${item.id}`);
    promptAnswers.add(key);
    if (Array.isArray(item.choices)) {
      if (item.choices.length !== 4) throw new Error(`Bad choice count for ${item.id}`);
      if (!item.choices.some(choice => compact(choice) === compact(item.answer))) {
        throw new Error(`Answer missing from choices for ${item.id}: ${item.answer}`);
      }
    }
    const answerKey = compact(item.answer);
    if (answerKey.length >= 2 && compact(item.prompt).includes(answerKey)) {
      answerInPrompt.push(`${item.id}:${item.answer}`);
    }
  }
  if (answerInPrompt.length) {
    throw new Error(`Answer appears in prompt: ${answerInPrompt.join(', ')}`);
  }
}

function updateQuiz(achievements) {
  const quiz = readJson(QUIZ_PATH);
  const before = quiz.questions || [];
  const withoutGenerated = before.filter(item => {
    const id = String(item.id || '');
    return !id.startsWith(GENERATED_PREFIX) && !id.startsWith(REFINED_PREFIX);
  });
  const withoutBadOriginalChoices = withoutGenerated.filter(item => !shouldRemoveOriginalChoiceQuestion(item));
  const withoutDuplicateModern = withoutBadOriginalChoices.filter(item => !['hqd-0016', 'hqd-0018'].includes(item.id));
  const withoutWeakDuplicates = withoutDuplicateModern.filter(item => !shouldRemoveDuplicateOrWeakQuestion(item));
  const cleaned = withoutWeakDuplicates.map(item => rewriteAnswerInPrompt(tightenChoices(item, achievements)));

  let seq = 1;
  const nextId = () => `${GENERATED_PREFIX}${String(seq++).padStart(4, '0')}`;
  const generated = [
    ...buildGeneratedAchievementQuestions(achievements, nextId),
    ...manualAncientQuestions(nextId, achievements)
  ];
  const refinedNeeded = TARGET_TOTAL - cleaned.length - generated.length;
  const refined = buildRefinedReplacementQuestions(achievements, refinedNeeded);

  const questions = [...cleaned, ...generated, ...refined];
  validateQuiz(questions);

  quiz.questions = questions;
  quiz.meta ||= {};
  quiz.meta.quiz_count = questions.length;
  quiz.meta.kinds = recalcKinds(questions);
  quiz.meta.user_requested_ancient_mnemonic_cleanup = {
    generated_at: '2026-05-15',
    removed_original_hq_choice_questions: withoutGenerated.length - withoutBadOriginalChoices.length,
    removed_duplicate_questions: withoutBadOriginalChoices.length - withoutDuplicateModern.length,
    removed_content_duplicate_or_weak_questions_this_run: withoutDuplicateModern.length - withoutWeakDuplicates.length,
    active_content_duplicate_or_weak_replacements: refined.length,
    removed_content_duplicate_or_weak_types: [
      'hqa-* 자동 생성 시대 연결 중 단서·주체 반복형',
      'hqb-* 자동 생성 주체 단답 중 동일 단서 반복형',
      '왕조명만 보고 거를 수 있는 문화재·기관 비교 보기'
    ],
    added_mnemonic_questions: generated.length,
    added_refined_replacement_questions: refined.length,
    final_total: questions.length,
    focus: '삼국·남북국 암기코드 반영, 내용 중복 유형 제거, 같은 시대·왕조 안에서 헷갈리는 보기로 교체'
  };

  writeJson(QUIZ_PATH, quiz);
}

const achievements = updateAchievements();
updateFlowNotes();
updateConceptPage02();
updateQuiz(achievements);
console.log('Updated ancient mnemonics, concept page, flow notes, and quiz total to 1000.');
