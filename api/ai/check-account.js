import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });

    const { data, error } = await supabaseAdmin.auth.admin.getUserByEmail(email);

    if (error?.message?.includes('User not found') || !data?.user) {
      return res.status(200).json({ exists: false });
    }
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ exists: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'unknown error' });
  }
}
