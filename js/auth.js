import { db, getCurrentUser } from './supabase.js';

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    showAuthModal();
    return null;
  }
  return user;
}

export function onAuthStateChange(callback) {
  return db.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

function showAuthModal() {
  const existing = document.getElementById('auth-modal');
  if (existing) return;

  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-card">
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

  let isSignUp = false;
  const form = document.getElementById('auth-form');
  const switchLink = document.getElementById('auth-switch');
  const submitBtn = document.getElementById('auth-submit');
  const errorEl = document.getElementById('auth-error');

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
        errorEl.style.color = 'var(--color-success)';
        errorEl.textContent = 'Check your email for a confirmation link.';
        submitBtn.disabled = false;
        return;
      }
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      modal.remove();
      window.location.reload();
    } catch (err) {
      errorEl.style.color = 'var(--color-danger)';
      errorEl.textContent = err.message;
      submitBtn.disabled = false;
    }
  });
}
