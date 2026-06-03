import { db, getCurrentUser, signOut } from '../supabase.js';
import { showToast } from '../toast.js';
import { seedDemoData, clearDemoData } from './demo-data.js';
import { exportTransactionsCsv, exportDealsCsv, exportContentCsv } from './export.js';

const FONT_SIZE_KEY = 'svn-os-font-size';
const COMPACT_KEY = 'svn-os-compact-mode';

const fontSizeMap = {
  small: '13px',
  default: '15px',
  large: '17px',
};

export async function init() {
  // Apply saved preferences immediately
  applySavedPreferences();

  const user = await getCurrentUser();
  if (!user) return;

  populateEmail(user);
  await loadProfile(user);
  bindProfileForm(user);
  bindPasswordForm();
  bindSignOut();
  bindDeleteAccount();
  bindAppearance();
  bindDataActions();

  return cleanup;
}

/* ── Helpers ──────────────────────────────────────────────────── */

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function updateUsernameHint(username) {
  const hint = document.getElementById('settings-username-hint');
  if (!hint) return;
  if (username) {
    const url = `${window.location.origin}/u/${username}`;
    hint.innerHTML = '';
    hint.append('Your public profile lives at ');
    const a = document.createElement('a');
    a.href = `/u/${username}`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'mono';
    a.textContent = url;
    hint.appendChild(a);
  } else {
    hint.textContent = 'Add a handle to enable your shareable public profile at /u/yourname';
  }
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

/* ── Profile Loading ──────────────────────────────────────────── */

function populateEmail(user) {
  const emailInput = document.getElementById('settings-email');
  const displayEmail = document.getElementById('settings-display-email');
  if (emailInput) emailInput.value = user.email || '';
  if (displayEmail) displayEmail.textContent = user.email || '';
}

async function loadProfile(user) {
  try {
    const { data: profile, error } = await db
      .from('profiles')
      .select('username, full_name, avatar_url, bio, website')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    if (!profile) return;

    const fullNameInput = document.getElementById('settings-fullname');
    const usernameInput = document.getElementById('settings-username');
    const bioInput = document.getElementById('settings-bio');
    const websiteInput = document.getElementById('settings-website');
    const avatarEl = document.getElementById('settings-avatar');
    const displayName = document.getElementById('settings-display-name');

    if (fullNameInput) fullNameInput.value = profile.full_name || '';
    if (usernameInput) usernameInput.value = profile.username || '';
    updateUsernameHint(profile.username || '');
    if (bioInput) bioInput.value = profile.bio || '';
    if (websiteInput) websiteInput.value = profile.website || '';

    const name = profile.full_name || user.email.split('@')[0];
    if (displayName) displayName.textContent = escapeHtml(name);

    if (avatarEl) {
      if (profile.avatar_url) {
        avatarEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = profile.avatar_url;
        img.alt = 'Avatar';
        avatarEl.appendChild(img);
      } else {
        avatarEl.textContent = getInitials(name);
      }
    }
  } catch (err) {
    showToast('Failed to load profile', 'error');
  }
}

/* ── Profile Save ─────────────────────────────────────────────── */

function bindProfileForm(user) {
  const form = document.getElementById('settings-profile-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const saveBtn = document.getElementById('settings-save-profile');
    if (saveBtn) saveBtn.disabled = true;

    const fullName = document.getElementById('settings-fullname')?.value.trim() || '';
    const usernameRaw = document.getElementById('settings-username')?.value.trim() || '';
    const username = usernameRaw ? usernameRaw.toLowerCase() : null;
    const bio = document.getElementById('settings-bio')?.value.trim() || '';
    const website = document.getElementById('settings-website')?.value.trim() || '';

    if (username && !/^[a-z0-9_-]{3,32}$/.test(username)) {
      showToast('Username must be 3-32 chars: a-z, 0-9, _ or -', 'warning');
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    try {
      const { error } = await db
        .from('profiles')
        .update({
          full_name: fullName,
          username: username,
          bio: bio,
          website: website,
        })
        .eq('id', user.id);

      if (error) {
        if (error.code === '23505') {
          showToast('That handle is already taken', 'warning');
          if (saveBtn) saveBtn.disabled = false;
          return;
        }
        throw error;
      }
      updateUsernameHint(username || '');

      // Also update auth user metadata so the nav sidebar reflects the name
      await db.auth.updateUser({
        data: { full_name: fullName }
      });

      // Update avatar display
      const avatarEl = document.getElementById('settings-avatar');
      const displayName = document.getElementById('settings-display-name');
      if (displayName) displayName.textContent = escapeHtml(fullName || user.email.split('@')[0]);
      if (avatarEl && !avatarEl.querySelector('img')) {
        avatarEl.textContent = getInitials(fullName || user.email.split('@')[0]);
      }

      // Update nav sidebar
      const navName = document.getElementById('nav-user-name');
      const navAvatar = document.getElementById('nav-avatar');
      if (navName) navName.textContent = fullName || user.email.split('@')[0];
      if (navAvatar && !avatarEl?.querySelector('img')) {
        navAvatar.textContent = getInitials(fullName || user.email.split('@')[0]);
      }

      showToast('Profile saved', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save profile', 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });
}

/* ── Password Change ──────────────────────────────────────────── */

function bindPasswordForm() {
  const form = document.getElementById('settings-password-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const changeBtn = document.getElementById('settings-change-pw');
    if (changeBtn) changeBtn.disabled = true;

    const currentPw = document.getElementById('settings-current-pw')?.value || '';
    const newPw = document.getElementById('settings-new-pw')?.value || '';
    const confirmPw = document.getElementById('settings-confirm-pw')?.value || '';

    if (!currentPw || !newPw || !confirmPw) {
      showToast('Please fill in all password fields', 'warning');
      if (changeBtn) changeBtn.disabled = false;
      return;
    }

    if (newPw.length < 6) {
      showToast('New password must be at least 6 characters', 'warning');
      if (changeBtn) changeBtn.disabled = false;
      return;
    }

    if (newPw !== confirmPw) {
      showToast('New passwords do not match', 'warning');
      if (changeBtn) changeBtn.disabled = false;
      return;
    }

    try {
      const { error } = await db.auth.updateUser({ password: newPw });
      if (error) throw error;

      // Clear form
      document.getElementById('settings-current-pw').value = '';
      document.getElementById('settings-new-pw').value = '';
      document.getElementById('settings-confirm-pw').value = '';

      showToast('Password updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update password', 'error');
    } finally {
      if (changeBtn) changeBtn.disabled = false;
    }
  });
}

/* ── Sign Out ─────────────────────────────────────────────────── */

function bindSignOut() {
  const btn = document.getElementById('settings-signout');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const confirmed = window.confirm('Are you sure you want to sign out?');
    if (!confirmed) return;

    try {
      await signOut();
      window.location.reload();
    } catch (err) {
      showToast(err.message || 'Failed to sign out', 'error');
    }
  });
}

/* ── Delete Account ───────────────────────────────────────────── */

function bindDeleteAccount() {
  const btn = document.getElementById('settings-delete-account');
  if (!btn) return;

  btn.addEventListener('click', () => {
    showToast('Account deletion is not yet available. Contact support to delete your account.', 'warning');
  });
}

/* ── Appearance ───────────────────────────────────────────────── */

function bindAppearance() {
  const fontSelect = document.getElementById('settings-fontsize');
  const compactToggle = document.getElementById('settings-compact');

  // Restore saved values into the controls
  const savedFontSize = localStorage.getItem(FONT_SIZE_KEY) || 'default';
  const savedCompact = localStorage.getItem(COMPACT_KEY) === 'true';

  if (fontSelect) {
    fontSelect.value = savedFontSize;
    fontSelect.addEventListener('change', () => {
      const size = fontSelect.value;
      localStorage.setItem(FONT_SIZE_KEY, size);
      applyFontSize(size);
      showToast('Font size updated', 'info');
    });
  }

  if (compactToggle) {
    compactToggle.checked = savedCompact;
    compactToggle.addEventListener('change', () => {
      const compact = compactToggle.checked;
      localStorage.setItem(COMPACT_KEY, String(compact));
      applyCompactMode(compact);
      showToast(compact ? 'Compact mode enabled' : 'Compact mode disabled', 'info');
    });
  }
}

function applyFontSize(size) {
  const px = fontSizeMap[size] || fontSizeMap.default;
  document.documentElement.style.fontSize = px;
}

function applyCompactMode(enabled) {
  document.body.classList.toggle('compact-mode', enabled);
}

function applySavedPreferences() {
  const savedFontSize = localStorage.getItem(FONT_SIZE_KEY);
  if (savedFontSize && fontSizeMap[savedFontSize]) {
    applyFontSize(savedFontSize);
  }

  const savedCompact = localStorage.getItem(COMPACT_KEY) === 'true';
  if (savedCompact) {
    applyCompactMode(true);
  }
}

/* ── Data Actions ─────────────────────────────────────────────── */

function bindDataActions() {
  const seedBtn = document.getElementById('settings-seed-demo');
  const clearBtn = document.getElementById('settings-clear-demo');
  const txBtn = document.getElementById('settings-export-transactions');
  const dealBtn = document.getElementById('settings-export-deals');
  const contentBtn = document.getElementById('settings-export-content');

  if (seedBtn) {
    seedBtn.addEventListener('click', async () => {
      seedBtn.disabled = true;
      try {
        const counts = await seedDemoData();
        showToast(`Added ${counts.content} projects, ${counts.deals} deals, ${counts.transactions} transactions`, 'success');
      } catch (err) {
        showToast(err.message || 'Failed to load sample data', 'error');
      } finally {
        seedBtn.disabled = false;
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const confirmed = window.confirm('Remove all sample data? Only items added via "Load sample data" will be deleted.');
      if (!confirmed) return;
      clearBtn.disabled = true;
      try {
        await clearDemoData();
        showToast('Sample data cleared', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to clear sample data', 'error');
      } finally {
        clearBtn.disabled = false;
      }
    });
  }

  const wireExport = (btn, fn, label) => {
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const count = await fn();
        if (count === 0) {
          showToast(`No ${label} to export`, 'info');
        } else {
          showToast(`Exported ${count} ${label}`, 'success');
        }
      } catch (err) {
        showToast(err.message || `Failed to export ${label}`, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  };

  wireExport(txBtn, exportTransactionsCsv, 'transactions');
  wireExport(dealBtn, exportDealsCsv, 'deals');
  wireExport(contentBtn, exportContentCsv, 'content projects');
}

/* ── Cleanup ──────────────────────────────────────────────────── */

function cleanup() {
  // No persistent listeners outside the page partial to clean up
}
