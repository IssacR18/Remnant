// api/ai/check-account.js

// --- tiny helper: read JSON body safely whether it's parsed or a raw stream
async function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  try { return JSON.parse(raw); } catch { return {}; }
}

// --- tiny helper: consistent error replies
function reply(res, code, data) { return res.status(code).json(data); }

export default async function handler(req, res) {
  const start = Date.now();

  if (req.method !== 'POST')
    return reply(res, 405, { error: 'Only POST allowed' });

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key)
    return reply(res, 500, { error: 'Missing env vars (URL or SERVICE_ROLE_KEY)' });

  try {
    const body = await getJsonBody(req);

    // what the AI actually sent
    const emailRaw = (body?.email ?? '').toString();

    // normalize: trim spaces, remove internal spaces, lowercase
    const email = emailRaw.trim().replace(/\s+/g, '').toLowerCase();

    // DEBUG LOGS you’ll see in Vercel → Logs
    console.log('[check-account] raw:', emailRaw);
    console.log('[check-account] normalized:', email);

    if (!email || !email.includes('@'))
      return reply(res, 400, { error: 'email required', debug: { emailRaw, email } });

    // Supabase Admin REST: find user(s) by email
    const url = `${base}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
    const r = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }

    // Normalize possible shapes
    let users = [];
    if (Array.isArray(json)) users = json;
    else if (Array.isArray(json?.users)) users = json.users;
    else if (json?.user) users = [json.user];

    const exists = users.some(u => (u?.email || '').toLowerCase() === email);

    // More DEBUG
    console.log('[check-account] http:', r.status, r.statusText);
    console.log('[check-account] users_len:', users.length, 'exists:', exists);

    // Return result + small debug for now (remove later if you want)
    return reply(res, 200, {
      exists,
      debug: {
        emailRaw,
        emailNormalized: email,
        httpStatus: r.status,
        usersLen: users.length
      }
    });

  } catch (e) {
    console.error('[check-account] fatal:', e);
    return reply(res, 500, { error: e?.message || 'unknown error' });
  } finally {
    console.log('[check-account] done in ms:', Date.now() - start);
  }
}
