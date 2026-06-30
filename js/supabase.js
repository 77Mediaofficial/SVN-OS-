/* Supabase connection utility.
   Wired to the dedicated SVN OS project (London / eu-west-2, ref daqeghxsuvufqubsbmnv).
   The anon key is public-safe by design: it only grants what row-level security allows,
   and every table enforces auth.uid() = user_id. This is the standard browser key for a
   Supabase SPA. To run the app in pure DEMO MODE again, restore the 'YOUR_' placeholders.
   Schema lives in sql/schema.sql + sql/002_studio_tables.sql. */

export const SUPABASE_URL = 'https://daqeghxsuvufqubsbmnv.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhcWVnaHhzdXZ1ZnF1YnNibW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NDYxMjgsImV4cCI6MjA5ODQyMjEyOH0.uHaIJ6QkVE2aqxeqb7kRAtBrQyNzAWbHAStyjgjBXYA';

export const DEMO_MODE =
  SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_');

let client = null;
if (!DEMO_MODE) {
  // Pinned exact version — bump deliberately, never auto-upgrade a CDN dep.
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

export const supabase = client;
