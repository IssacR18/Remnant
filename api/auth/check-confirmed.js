// /api/auth/check-confirmed.js
// Server-only endpoint for cross-device confirmation checks.
// Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Small helper: JSON response with CORS
function send(res, code, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(code).end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  try {
    if (!url || !serviceKey) {
      return send(res, 500, { ok: false, error: 'Missing server env vars' });
    }

    const email = (req.query.email || '').toString().trim().toLowerCase();
    if (!email) return send(res, 400, { ok: false, error: 'missing_email' });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Try direct lookup by email (supported in newer @supabase/supabase-js)
    let user = null;
    if (admin.auth?.admin?.getUserByEmail) {
      const { data, error } = await admin.auth.admin.getUserByEmail(email);
      if (error && error.message !== 'User not found') {
        return send(res, 500, { ok: false, error: error.message });
      }
      user = data?.user ?? null;
    }

    // Fallback: scan first page if direct lookup not available
    if (!user) {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) return send(res, 500, { ok: false, error: error.message });
      user = data?.users?.find(u => (u.email || '').toLowerCase() === email) ?? null;
    }

    const confirmed = !!(user?.email_confirmed_at || user?.confirmed_at);
    return send(res, 200, {
      ok: true,
      confirmed,
      user_id: user?.id ?? null,
      email: user?.email ?? email
    });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'server_error' });
  }
}
