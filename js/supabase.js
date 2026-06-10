/* Supabase connection utility.
   1. Create a project at https://supabase.com
   2. Run sql/schema.sql in the SQL Editor
   3. Paste your Project URL + anon public key below (Settings → API)
   Until then the app runs in DEMO MODE on local sample data. */

export const SUPABASE_URL = 'YOUR_SUPABASE_URL';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const DEMO_MODE =
  SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_');

let client = null;
if (!DEMO_MODE) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

export const supabase = client;
