/* Settings — profile, appearance, privacy & account.
   Appearance changes apply instantly (device-level); profile saves
   to the profiles table (or the demo profile) and refreshes the
   sidebar identity. */

import { getProfile, updateProfile } from '../store.js';
import { getAppearance, setAppearance } from '../appearance.js';
import { openPrivacySheet } from '../applock.js';
import { signOut } from '../auth.js';
import { DEMO_MODE } from '../supabase.js';
import { formData } from '../ui.js';
import { toast } from '../toast.js';

export async function init() {
  const form = document.getElementById('profile-form');
  const errEl = document.getElementById('profile-error');

  const profile = await getProfile().catch(() => null);
  if (profile) {
    form.full_name.value = profile.full_name || '';
    form.username.value = profile.username || '';
    form.bio.value = profile.bio || '';
    form.website.value = profile.website || '';
  }

  // Reflect current appearance into the radio pills.
  const appearance = getAppearance();
  selectPill('theme', appearance.theme);
  selectPill('textSize', appearance.textSize);
  selectPill('density', appearance.density);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const raw = formData(form);

    const username = raw.username.toLowerCase();
    if (username && !/^[a-z0-9_]{3,30}$/.test(username)) {
      errEl.textContent = 'Username must be 3–30 characters: lowercase letters, numbers, or underscores.';
      errEl.hidden = false;
      return;
    }

    const patch = {
      full_name: raw.full_name || '',
      username: username || null,
      bio: raw.bio || '',
      website: raw.website || '',
    };

    const btn = document.getElementById('profile-save');
    btn.disabled = true;
    try {
      const saved = await updateProfile(patch);
      const name = saved.full_name || profile?.full_name || 'Creator';
      window.dispatchEvent(new CustomEvent('svnos:identity', { detail: { name } }));
      toast('Profile saved.', 'success');
    } catch (err) {
      console.error(err);
      errEl.textContent = err?.code === '23505'
        ? 'That username is already taken.'
        : 'Could not save your profile.';
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  // Appearance pills apply immediately, no save button.
  document.querySelectorAll('[name="theme"], [name="textSize"], [name="density"]').forEach((input) => {
    input.addEventListener('change', () => {
      setAppearance({ [input.name]: input.value });
    });
  });

  document.getElementById('settings-privacy-btn').addEventListener('click', openPrivacySheet);
  document.getElementById('settings-signout-btn').addEventListener('click', signOut);

  if (DEMO_MODE) {
    document.getElementById('settings-account-sub').textContent =
      'Demo session — add Supabase credentials in js/supabase.js for real accounts.';
  }
}

function selectPill(name, value) {
  const input = document.querySelector(`[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}
