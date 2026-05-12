import { neon } from '@neondatabase/serverless';

let schemaPromise;
let schemaReady = false;

function parseCookies(str) {
  const out = {};
  for (const part of (str || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v.join('='));
  }
  return out;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function ensureSchema(sql) {
  if (schemaReady) return Promise.resolve();
  schemaPromise ||= sql`
    CREATE TABLE IF NOT EXISTS hankuksa_quiz_progress (
      uid TEXT NOT NULL,
      question_id TEXT NOT NULL,
      is_correct BOOLEAN NOT NULL,
      PRIMARY KEY (uid, question_id)
    )
  `.then(() => {
    schemaReady = true;
  }).catch(error => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function databaseUrl() {
  return process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_URL
    || process.env.POSTGRES_URL_NON_POOLING
    || process.env.NEON_DATABASE_URL;
}

export default async function handler(req, res) {
  try {
    const url = databaseUrl();
    if (!url) {
      sendJson(res, 503, { ok: false, error: 'database url is not configured' });
      return;
    }

    const sql = neon(url);
    const cookies = parseCookies(req.headers.cookie);
    let uid = cookies.uid;
    const newCookie = !uid;

    if (!uid) uid = crypto.randomUUID();

    const cookieHeader = `uid=${uid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
    if (newCookie) res.setHeader('Set-Cookie', cookieHeader);

    await ensureSchema(sql);

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT question_id, is_correct
        FROM hankuksa_quiz_progress
        WHERE uid = ${uid}
      `;
      const byId = {};
      for (const row of rows) {
        byId[row.question_id] = row.is_correct ? 'correct' : 'wrong';
      }
      sendJson(res, 200, { byId });
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const questionId = String(body.questionId || '').trim();
      const hasCorrect = typeof body.correct === 'boolean';

      if (!questionId || questionId.length > 80 || !hasCorrect) {
        sendJson(res, 400, { ok: false, error: 'questionId and boolean correct are required' });
        return;
      }

      await sql`
        INSERT INTO hankuksa_quiz_progress (uid, question_id, is_correct)
        VALUES (${uid}, ${questionId}, ${body.correct})
        ON CONFLICT (uid, question_id) DO UPDATE
          SET is_correct = EXCLUDED.is_correct
      `;

      sendJson(res, 200, {
        ok: true,
        questionId,
        result: body.correct ? 'correct' : 'wrong',
      });
      return;
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM hankuksa_quiz_progress WHERE uid = ${uid}`;
      sendJson(res, 200, { ok: true });
      return;
    }

    res.status(405).end();
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || 'internal error' });
  }
}
