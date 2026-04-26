import { neon } from '@neondatabase/serverless';

function parseCookies(str) {
  const out = {};
  for (const part of (str || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v.join('='));
  }
  return out;
}

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  const cookies = parseCookies(req.headers.cookie);
  let uid = cookies.uid;
  const newCookie = !uid;

  if (!uid) uid = crypto.randomUUID();

  const cookieHeader = `uid=${uid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;

  if (req.method === 'GET') {
    const rows = await sql`SELECT data FROM topcit_progress WHERE uid = ${uid}`;
    const data = rows[0]?.data ?? {};
    if (newCookie) res.setHeader('Set-Cookie', cookieHeader);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));

  } else if (req.method === 'POST') {
    await sql`
      INSERT INTO topcit_progress (uid, data, updated_at)
      VALUES (${uid}, ${JSON.stringify(req.body)}, NOW())
      ON CONFLICT (uid) DO UPDATE
        SET data = EXCLUDED.data, updated_at = NOW()
    `;
    if (newCookie) res.setHeader('Set-Cookie', cookieHeader);
    res.json({ ok: true });

  } else {
    res.status(405).end();
  }
}
