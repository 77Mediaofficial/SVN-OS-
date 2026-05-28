import { db, getCurrentUser, signOut as supabaseSignOut } from './supabase.js';
import { showToast } from './toast.js';

/**
 * Guard a route: returns the current user, or null if not authenticated.
 * When null, the auth modal is shown automatically.
 * @param {Object} [options]
 * @param {boolean} [options.voluntary=false] - If true, the modal shows a close button
 * @returns {Promise<Object|null>}
 */
export async function requireAuth(options = {}) {
  const user = await getCurrentUser();
  if (!user) {
    showAuthModal({ allowClose: options.voluntary === true });
    return null;
  }
  return user;
}

export function onAuthStateChange(callback) {
  return db.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

/**
 * Sign out the current user, show a toast, and reload the page.
 */
export async function signOut() {
  try {
    await supabaseSignOut();
    showToast('Signed out successfully', 'success');
    // Brief delay so the user can see the toast before reload
    setTimeout(() => window.location.reload(), 600);
  } catch (err) {
    showToast('Sign-out failed: ' + err.message, 'error');
  }
}

/**
 * @param {Object} [options]
 * @param {boolean} [options.allowClose=false] - Show the X button to dismiss
 */
function showAuthModal(options = {}) {
  const { allowClose = false } = options;

  const root = document.getElementById('auth-modal-root');
  if (!root) {
    console.error('[SVN OS] Auth modal anchor #auth-modal-root not found in the DOM. Cannot display the auth modal.');
    return;
  }

  const existing = document.getElementById('auth-modal');
  if (existing) return;

  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'auth-overlay';

  const closeBtn = allowClose
    ? `<button class="auth-close" id="auth-modal-close" aria-label="Close" type="button">&times;</button>`
    : '';

  modal.innerHTML = `
    <div class="auth-modal">
      ${closeBtn}
      <div class="auth-header">
        <h2>Welcome to SVN OS</h2>
        <p>Sign in to your creator dashboard</p>
      </div>
      <form id="auth-form">
        <div class="auth-form-group">
          <label for="auth-email">Email</label>
          <input class="auth-input" type="email" id="auth-email" required placeholder="you@example.com" autocomplete="email" />
        </div>
        <div class="auth-form-group">
          <label for="auth-password">Password</label>
          <input class="auth-input" type="password" id="auth-password" required placeholder="••••••••" autocomplete="current-password" />
        </div>
        <button type="submit" class="auth-button" id="auth-submit">Sign In</button>
        <p class="auth-toggle">
          Don't have an account? <a id="auth-switch">Sign up</a>
        </p>
        <p class="auth-error" id="auth-error"></p>
      </form>
    </div>
  `;
  root.appendChild(modal);

  // Fade-in on next frame
  requestAnimationFrame(() => {
    modal.classList.add('active');
  });

  let isSignUp = false;
  const form = document.getElementById('auth-form');
  const switchLink = document.getElementById('auth-switch');
  const submitBtn = document.getElementById('auth-submit');
  const errorEl = document.getElementById('auth-error');

  // Close button (only present when allowClose is true)
  if (allowClose) {
    const closeEl = document.getElementById('auth-modal-close');
    closeEl.addEventListener('click', () => {
      dismissAuthModal(modal);
    });
  }

  switchLink.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;
    submitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    switchLink.textContent = isSignUp ? 'Sign in' : 'Sign up';
    errorEl.textContent = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    errorEl.textContent = '';
    submitBtn.disabled = true;

    try {
      if (isSignUp) {
        const { error } = await db.auth.signUp({ email, password });
        if (error) throw error;
        showToast('Check your email for a confirmation link.', 'info');
        errorEl.style.color = 'var(--color-success)';
        errorEl.textContent = 'Check your email for a confirmation link.';
        submitBtn.disabled = false;
        return;
      }
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      showToast('Welcome back!', 'success');
      dismissAuthModal(modal);
      // Brief delay so user sees the toast before reload
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      showToast(err.message, 'error');
      errorEl.style.color = 'var(--color-danger)';
      errorEl.textContent = err.message;
      submitBtn.disabled = false;
    }
  });
}

/**
 * Dismiss the auth modal with a fade-out animation.
 */
function dismissAuthModal(modal) {
  modal.classList.remove('active');
  modal.addEventListener('transitionend', () => modal.remove(), { once: true });
  // Fallback removal
  setTimeout(() => { if (modal.parentNode) modal.remove(); }, 350);
}
