import { createClient } from '@supabase/supabase-js';

async function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function userExistsByEmail(supabaseAdmin, email) {
  // Scan up to 1000 users (5 pages × 200). Fine for your scale; easy to switch later.
  let page = 1;
  while (page <= 5) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users || [];
    if (users.some(u => (u.email || '').toLowerCase() === email.toLowerCase())) return true;
    if (!users.length || (data?.lastPage && page >= data.lastPage)) break;
    page++;
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });
  try {
    const { email } = await getJsonBody(req);
    if (!email) return res.status(400).json({ error: 'email required' });

    const supabaseAdmin = makeAdmin();
    const exists = await userExistsByEmail(supabaseAdmin, email);

    return res.status(200).json({ exists });
  } catch (e) {
    console.error('check-account fatal:', e);
    return res.status(500).json({ error: e?.message || 'unknown error' });
  }
}
