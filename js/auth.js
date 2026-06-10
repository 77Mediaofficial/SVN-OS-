/* Auth: Supabase email/password sessions, or a synthetic demo user
   when credentials haven't been wired yet. */

import { supabase, DEMO_MODE } from './supabase.js';
import { setUserId } from './store.js';
import { toast } from './toast.js';
import { formData } from './ui.js';

const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@svn-os.app',
  user_metadata: { full_name: 'Demo Creator' },
};

let currentUser = null;
export const getUser = () => currentUser;

export async function initAuth(onChange) {
  if (DEMO_MODE) {
    currentUser = DEMO_USER;
    setUserId(DEMO_USER.id);
    onChange(currentUser);
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user ?? null;
  setUserId(currentUser?.id ?? null);

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    const next = nextSession?.user ?? null;
    const changed = next?.id !== currentUser?.id;
    currentUser = next;
    setUserId(next?.id ?? null);
    if (changed) onChange(currentUser);
  });

  onChange(currentUser);
}

export function bindAuthForm() {
  const form = document.getElementById('auth-form');
  if (!form || DEMO_MODE) return;

  const errEl = document.getElementById('auth-error');
  const nameField = document.getElementById('auth-name-field');
  const submitBtn = document.getElementById('auth-submit');
  const toggleBtn = document.getElementById('auth-toggle');
  const toggleLine = document.getElementById('auth-toggle-line');
  let mode = 'signin';

  function syncMode() {
    const signup = mode === 'signup';
    nameField.hidden = !signup;
    submitBtn.textContent = signup ? 'Create account' : 'Sign in';
    toggleLine.firstChild.textContent = signup ? 'Already set up? ' : 'No account? ';
    toggleBtn.textContent = signup ? 'Sign in instead' : 'Create one';
    errEl.hidden = true;
  }

  toggleBtn.addEventListener('click', () => {
    mode = mode === 'signin' ? 'signup' : 'signin';
    syncMode();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    submitBtn.disabled = true;
    const { email, password, full_name } = formData(form);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email, password, options: { data: { full_name } },
        });
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
