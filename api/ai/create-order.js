import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  try {
    const body = req.body || {};
    const email = body.account_email_attached;
    if (!email) return res.status(400).json({ error: 'account_email_attached required' });

    // Verify the email has a Remnant account
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserByEmail(email);
    if (userErr || !userRes?.user) {
      return res.status(400).json({ error: 'No Remnant account for this email' });
    }

    // Insert exactly your columns
    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert([{
        account_email_attached: email,
        capturing: body.capturing ?? null,
        address: body.address ?? null,
        gate_codes: body.gate_codes ?? null,
        scope: body.scope ?? null,
        date: body.date ?? null,
        capture_time: body.capture_time ?? null,
        Addons: body.Addons ?? null
      }])
      .select();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, order: data?.[0] ?? null });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'unknown error' });
  }
}
