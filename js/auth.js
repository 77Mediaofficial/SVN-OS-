/* Auth: Supabase email/password sessions, or a synthetic demo user
   when credentials haven't been wired yet. */

import { supabase, DEMO_MODE } from './supabase.js';
import { setUserId } from './store.js';
import { toast } from './toast.js';
import { formData } from './ui.js';

const DEMO_USER = {
  id: 'demo-user',
  email: 'jordan@northlight.studio',
  user_metadata: { full_name: 'Jordan Cole' },
};

// When credentials ARE wired but no one is signed in, the app runs in GUEST mode: the
// full UI on local demo data, so the public site stays a frictionless showcase. Real
// persistence begins only after sign-in; guest never touches Supabase.
const GUEST_USER = {
  id: 'guest',
  email: null,
  user_metadata: { full_name: 'Guest' },
};

let currentUser = null;
export const getUser = () => currentUser;
export const isGuest = () => currentUser?.id === 'guest';

export async function initAuth(onChange) {
  if (DEMO_MODE) {
    currentUser = DEMO_USER;
    setUserId(DEMO_USER.id);
    onChange(currentUser);
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user ?? GUEST_USER;          // no session → guest, never a forced login wall
  setUserId(currentUser.id);                          // 'guest' keeps the store in local mode

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    const next = nextSession?.user ?? GUEST_USER;     // sign-out → back to guest
    const changed = next.id !== currentUser?.id;
    currentUser = next;
    setUserId(next.id);
    if (changed) onChange(currentUser);
  });

  onChange(currentUser);
}

export function bindAuthForm() {
  const form = document.getElementById('auth-form');
  if (!form) return;

  const errEl = document.getElementById('auth-error');
  const nameField = document.getElementById('auth-name-field');
  const pwField = document.getElementById('auth-password').closest('.field');
  const submitBtn = document.getElementById('auth-submit');
  const toggleBtn = document.getElementById('auth-toggle');
  const toggleLine = document.getElementById('auth-toggle-line');
  const forgot = document.getElementById('auth-forgot');
  let mode = 'signin'; // 'signin' | 'signup' | 'reset'

  function syncMode() {
    const signup = mode === 'signup';
    const reset = mode === 'reset';
    nameField.hidden = !signup;
    if (pwField) pwField.hidden = reset;
    if (forgot) forgot.hidden = signup || reset;
    submitBtn.textContent = reset ? 'Send reset link' : signup ? 'Create account' : 'Sign in';
    toggleLine.firstChild.textContent = reset ? 'Remembered it? ' : signup ? 'Already set up? ' : 'No account? ';
    toggleBtn.textContent = reset ? 'Back to sign in' : signup ? 'Sign in instead' : 'Create one';
    errEl.hidden = true;
  }

  toggleBtn.addEventListener('click', () => {
    mode = mode === 'signin' ? 'signup' : 'signin';
    syncMode();
  });
  forgot?.addEventListener('click', () => { mode = 'reset'; syncMode(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    submitBtn.disabled = true;
    const { email, password, full_name } = formData(form);
    try {
      if (DEMO_MODE) {
        toast(mode === 'reset'
          ? 'Demo mode — connect Supabase to send real reset links.'
          : 'Demo session — add Supabase credentials in js/supabase.js for real accounts.');
        return;
      }
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw error;
        toast('Password reset link sent — check your inbox.', 'success');
        mode = 'signin';
        syncMode();
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
        if (error) throw error;
        toast('Account created — check your inbox to confirm.', 'success');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      errEl.textContent = err.message || 'Something went wrong.';
      errEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  syncMode();
}

export async function signOut() {
  if (DEMO_MODE) {
    toast('Demo session — add Supabase credentials in js/supabase.js for real accounts.');
    return;
  }
  await supabase.auth.signOut();
}
