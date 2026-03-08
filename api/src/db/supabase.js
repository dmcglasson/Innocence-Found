const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

/** Server-side client with service role (bypasses RLS). Use for admin operations. */
const adminClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

/** Client that can verify user JWTs (uses anon key; auth is verified per-request). */
const anonClient = createClient(url, anonKey || serviceRoleKey, {
  auth: { persistSession: false },
});

module.exports = { adminClient, anonClient };
