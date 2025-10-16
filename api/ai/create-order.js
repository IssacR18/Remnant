import { createClient } from '@supabase/supabase-js';

function missingEnv(res) {
  return res.status(500).json({ error: 'Missing env vars. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
}
async function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (req.body && typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch {}
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
    const email = body?.account_email_attached;
    if (!email) return res.status(400).json({ error: 'account_email_attached required' });

    // Ensure the email has an account
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserByEmail(email);
    if (userErr || !userRes?.user) {
      console.error('create-order account check:', userErr);
      return res.status(400).json({ error: 'No Remnant account for this email' });
    }

    const insert = {
      account_email_attached: email,
      capturing: body.capturing ?? null,
      address: body.address ?? null,
      gate_codes: body.gate_codes ?? null,
      scope: body.scope ?? null,
      date: body.date ?? null,
      capture_time: body.capture_time ?? null,
      Addons: body.Addons ?? null,
    };

    const { data, error } = await supabaseAdmin.from('orders').insert([insert]).select();
    if (error) {
      console.error('create-order insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true, order: data?.[0] ?? null });
  } catch (e) {
    console.error('create-order fatal:', e);
    return res.status(500).json({ error: e?.message || 'unknown error' });
  }
}
