// api/ai/check-account.js
async function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
function bad(res, code, msg){ return res.status(code).json({ error: msg }); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'Only POST allowed');

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return bad(res, 500, 'Missing env vars');

  try {
    const { email: raw } = await getJsonBody(req);

    // normalize whatever the bot/user said
    const email = (raw || '')
      .toString()
      .trim()
      .replace(/\s+/g, '')     // remove spaces like "name @ domain"
      .toLowerCase();

    if (!email || !email.includes('@')) return bad(res, 400, 'email required');

    // Call Supabase Admin REST: /auth/v1/admin/users?email=<...>
    const r = await fetch(`${base}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    // Shape can be { users: [...] } or [...]
    const json = await r.json();
    let users = [];
    if (Array.isArray(json)) users = json;
    else if (Array.isArray(json?.users)) users = json.users;
    else if (json?.user) users = [json.user];

    const exists = users.some(u => (u.email || '').toLowerCase() === email);

    return res.status(200).json({ exists });
  } catch (e) {
    console.error('check-account REST fatal:', e);
    return bad(res, 500, e?.message || 'unknown error');
  }
}
