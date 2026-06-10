/* Toast notifications — max 4 on screen, auto-dismiss, text-only (XSS-safe). */

const MAX_TOASTS = 4;
const LIFETIME_MS = 3600;

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;

  while (root.children.length >= MAX_TOASTS) root.firstElementChild.remove();

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  root.appendChild(el);

  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 700); // safety net if transitions are disabled
  }, LIFETIME_MS);
}
