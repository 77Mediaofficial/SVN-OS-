/* Shared UI helpers: formatting, escaping, dialogs, forms. */

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const CURRENCY = 'GBP';
const moneyRound = new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: CURRENCY, maximumFractionDigits: 0,
});
const moneyExact = new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: CURRENCY, minimumFractionDigits: 2,
});

export const money = (n, { exact = false } = {}) =>
  (exact ? moneyExact : moneyRound).format(Number(n) || 0);

/* Local YYYY-MM-DD key for a Date or parseable value. */
export function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const todayKey = () => dayKey(new Date());

export function fmtDate(value, { withYear = false } = {}) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const opts = { day: 'numeric', month: 'short' };
  if (withYear || d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-GB', opts);
}

export function fmtTime(value) {
  const d = new Date(value);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/* Relative framing for a deadline-ish date → { label, tone }. */
export function relDay(value) {
  if (!value) return { label: '—', tone: 'dim' };
  const target = new Date(dayKey(value) + 'T00:00:00');
  const today = new Date(todayKey() + 'T00:00:00');
  const diff = Math.round((target - today) / 86400000);
  if (diff < -1) return { label: `${-diff}d overdue`, tone: 'danger' };
  if (diff === -1) return { label: 'Yesterday', tone: 'danger' };
  if (diff === 0) return { label: 'Today', tone: 'warn' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'warn' };
  if (diff <= 7) return { label: `In ${diff} days`, tone: 'warn' };
  return { label: fmtDate(value), tone: 'dim' };
}

/* ISO string → value usable in <input type="datetime-local">. */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formData(form) {
  const data = {};
  new FormData(form).forEach((v, k) => {
    data[k] = typeof v === 'string' ? v.trim() : v;
  });
  return data;
}

export const parseTags = (input) =>
  String(input || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

export function initials(name) {
  const parts = String(name || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '—';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

/* ── Dialogs ─────────────────────────────────────────────── */

export function bindDialog(dialog) {
  // Close on [data-close] buttons and on backdrop click.
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { dialog.close(); return; }
    if (e.target === dialog) dialog.close();
  });
}

export function confirmAction(message, { confirmLabel = 'Delete' } = {}) {
  const dialog = document.getElementById('confirm-dialog');
  if (!dialog) return Promise.resolve(window.confirm(message));
  document.getElementById('confirm-msg').textContent = message;
  document.getElementById('confirm-ok').textContent = confirmLabel;
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}
