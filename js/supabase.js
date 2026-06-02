const SUPABASE_URL = 'https://vtvniushkftodhlvdkom.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_uJ-Up0TKgepP9QRdHnXQAA_yLuynRcm';

const { createClient } = supabase;

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getCurrentUser() {
  const { data: { user } } = await db.auth.getUser();
  return user;
}

export async function signIn(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, fullName) {
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await db.auth.signOut();
  if (error) throw error;
}

/**
 * Synchronously check if there is an active session in localStorage.
 * Useful for quick route guards without an async round-trip to Supabase.
 * Returns true if a session token exists, false otherwise.
 */
export function isAuthenticated() {
  try {
    const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    // Supabase stores session data with an access_token when authenticated
    return !!(parsed?.access_token || parsed?.currentSession?.access_token);
  } catch {
    return false;
  }
}
