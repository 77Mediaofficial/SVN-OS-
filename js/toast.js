/* Toast notifications — max 4 on screen, auto-dismiss, text-only (XSS-safe).
   An optional action button (e.g. Undo) keeps the toast alive longer and
   runs a callback when pressed — the message text and the button label are
   both set via textContent, so untrusted strings can never inject markup. */

const MAX_TOASTS = 4;
const LIFETIME_MS = 3600;
const ACTION_LIFETIME_MS = 6500; // longer, so there's time to hit Undo

export function toast(message, type = 'info', opts = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;

  while (root.children.length >= MAX_TOASTS) root.firstElementChild.remove();

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  el.appendChild(text);

  let life = opts.duration || LIFETIME_MS;
  if (opts.action && typeof opts.action.onClick === 'function') {
    life = opts.duration || ACTION_LIFETIME_MS;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = opts.action.label || 'Undo';
    btn.addEventListener('click', () => {
      try { opts.action.onClick(); } finally { dismiss(); }
    });
    el.appendChild(btn);
  }

  root.appendChild(el);

  let killed = false;
  function dismiss() {
    if (killed) return;
    killed = true;
    el.classList.add('toast-out');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 700); // safety net if transitions are disabled
  }

  setTimeout(dismiss, life);
}
