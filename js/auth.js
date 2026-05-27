import { db, getCurrentUser, signOut as supabaseSignOut } from './supabase.js';
import { showToast } from './toast.js';

let authModalStyleInjected = false;

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

function injectAuthModalStyles() {
  if (authModalStyleInjected) return;
  authModalStyleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .auth-modal-overlay {
      opacity: 0;
      transition: opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .auth-modal-overlay.auth-modal--visible {
      opacity: 1;
    }

    .auth-modal-overlay .modal-card {
      transform: translateY(12px) scale(0.97);
      opacity: 0;
      transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
                  opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .auth-modal-overlay.auth-modal--visible .modal-card {
      transform: translateY(0) scale(1);
      opacity: 1;
    }

    .auth-modal-close {
      position: absolute;
      top: 14px;
      right: 14px;
      background: none;
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 6px;
      color: var(--color-text-muted, #777);
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 0.85rem;
      line-height: 1;
      transition: color 150ms ease, border-color 150ms ease;
    }

    .auth-modal-close:hover {
      color: var(--color-text, #fff);
      border-color: var(--color-text-dim, #555);
    }

    .modal-card {
      position: relative;
    }
  `;
  document.head.appendChild(style);
}

/**
 * @param {Object} [options]
 * @param {boolean} [options.allowClose=false] - Show the X button to dismiss
 */
function showAuthModal(options = {}) {
  const { allowClose = false } = options;

  const existing = document.getElementById('auth-modal');
  if (existing) return;

  injectAuthModalStyles();

  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'modal-overlay auth-modal-overlay';

  const closeBtn = allowClose
    ? `<button class="auth-modal-close" id="auth-modal-close" aria-label="Close" type="button">&times;</button>`
    : '';

  modal.innerHTML = `
    <div class="modal-card">
      ${closeBtn}
      <h2>Welcome to SVN OS</h2>
      <p class="modal-subtitle">Sign in to your creator dashboard</p>
      <form id="auth-form">
        <div class="form-group">
          <label for="auth-email">Email</label>
          <input type="email" id="auth-email" required placeholder="you@example.com" />
        </div>
        <div class="form-group">
          <label for="auth-password">Password</label>
          <input type="password" id="auth-password" required placeholder="••••••••" />
        </div>
        <button type="submit" class="btn btn-primary" id="auth-submit">Sign In</button>
        <p class="auth-toggle">
          Don't have an account? <a href="#" id="auth-switch">Sign up</a>
        </p>
        <p class="auth-error" id="auth-error"></p>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  // Fade-in on next frame
  requestAnimationFrame(() => {
    modal.classList.add('auth-modal--visible');
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
  modal.classList.remove('auth-modal--visible');
  modal.addEventListener('transitionend', () => modal.remove(), { once: true });
  // Fallback removal
  setTimeout(() => { if (modal.parentNode) modal.remove(); }, 350);
}
