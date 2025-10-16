import { createClient } from '@supabase/supabase-js';

function missingEnv(res) {
  return res.status(500).json({ error: 'Missing env vars. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
}

async function getJsonBody(req) {
  // Works whether body is already parsed or is a raw string/stream
  if (req.body && typeof req.body === 'object') return req.body;
  if (req.body && typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { /* fallthrough */ }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  try { return JSON.parse(raw); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return missingEnv(res);

  const supabaseAdmin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const body = await getJsonBody(req);
    const email = body?.email;
    if (!email) return res.status(400).json({ error: 'email required' });

    const { data, error } = await supabaseAdmin.auth.admin.getUserByEmail(email);

    // If the SDK returns no user, just say exists:false (don’t 500)
    if (error && !data?.user) {
      // Log server-side for debugging, but respond cleanly
      console.error('check-account admin error:', error);
    }
    const exists = !!data?.user;
    return res.status(200).json({ exists });
  } catch (e) {
    console.error('check-account fatal:', e);
    return res.status(500).json({ error: e?.message || 'unknown error' });
  }
}
