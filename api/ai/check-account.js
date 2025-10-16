// api/ai/check-account.js

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
function send(res, code, obj){ return res.status(code).json(obj); }
function norm(v){ return (v ?? '').toString().trim().replace(/\s+/g,'').toLowerCase(); }

// Fetch JSON with admin auth
async function getJSON(url, key) {
  const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, text, json };
}
function extractUsers(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.users)) return json.users;
  if (json.user) return [json.user];
  return [];
}

export default async function handler(req, res) {
  const t0 = Date.now();
  if (req.method !== 'POST') return send(res, 405, { error: 'Only POST allowed' });

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) {
    return send(res, 500, { error: 'Missing env vars', debug: { base, keyPresent: !!key } });
  }

  try {
    const { email: rawEmail } = await readBody(req);
    const email = norm(rawEmail);

    // Surface env target to verify the project (masked)
    const projectHost = new URL(base).host; // e.g. abcd.supabase.co
    console.log('[check-account] project:', projectHost);
    console.log('[check-account] raw:', rawEmail, 'normalized:', email);

    if (!email || !email.includes('@')) {
      return send(res, 400, { error: 'email required', debug: { rawEmail, email } });
    }

    let exists = false;
    const tried = [];

    // Try 1: direct match with aud=authenticated
    {
      const url = `${base}/auth/v1/admin/users?email=${encodeURIComponent(email)}&aud=authenticated`;
      const { status, json } = await getJSON(url, key);
      const users = extractUsers(json);
      exists = users.some(u => (u?.email || '').toLowerCase() === email);
      tried.push({ step: 'email+aud', status, usersLen: users.length, exists });
    }

    // Try 2: direct match without aud
    if (!exists) {
      const url = `${base}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
      const { status, json } = await getJSON(url, key);
      const users = extractUsers(json);
      exists = users.some(u => (u?.email || '').toLowerCase() === email);
      tried.push({ step: 'email', status, usersLen: users.length, exists });
    }

    // Try 3: page through list with aud=authenticated (up to 1000)
    if (!exists) {
      for (let page = 1; page <= 5; page++) {
        const url = `${base}/auth/v1/admin/users?aud=authenticated&page=${page}&per_page=200`;
        const { status, json } = await getJSON(url, key);
        const users = extractUsers(json);
        const hit = users.find(u => (u?.email || '').toLowerCase() === email);
        tried.push({ step: `list+aud p${page}`, status, usersLen: users.length, found: !!hit });
        if (hit) { exists = true; break; }
        if (!users.length) break;
      }
    }

    // Try 4: page without aud
    if (!exists) {
      for (let page = 1; page <= 5; page++) {
        const url = `${base}/auth/v1/admin/users?page=${page}&per_page=200`;
        const { status, json } = await getJSON(url, key);
        const users = extractUsers(json);
        const hit = users.find(u => (u?.email || '').toLowerCase() === email);
        tried.push({ step: `list p${page}`, status, usersLen: users.length, found: !!hit });
        if (hit) { exists = true; break; }
        if (!users.length) break;
      }
    }

    console.log('[check-account] exists:', exists, 'tries:', tried.map(t=>t.step).join(', '), 'ms:', Date.now()-t0);

    return send(res, 200, {
      exists,
      debug: {
        emailRaw: rawEmail,
        emailNormalized: email,
        projectHost,
        tries: tried
      }
    });
  } catch (e) {
    console.error('[check-account] fatal:', e);
    return send(res, 500, { error: e?.message || 'unknown error' });
  }
}
