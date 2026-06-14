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

/* ISO-8601 week number (weeks start Monday; week 1 contains the year's
   first Thursday). Shared by the dashboard slate and the calendar. */
export function isoWeek(value) {
  const src = value instanceof Date ? value : new Date(value);
  const d = new Date(Date.UTC(src.getFullYear(), src.getMonth(), src.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

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

/* ── Stat numerals (luxury count-up on load) ─────────────── */

const NUM_GB = new Intl.NumberFormat('en-GB');

export function statMoney(value) {
  const n = Math.round(Math.abs(Number(value) || 0));
  const sign = Number(value) < 0 ? '−' : '';
  return `${sign}<span class="cur">£</span><span data-count-to="${n}">${NUM_GB.format(n)}</span>`;
}

export function statInt(value) {
  const n = Math.round(Number(value) || 0);
  return `<span data-count-to="${n}" data-count-fmt="int">${NUM_GB.format(n)}</span>`;
}

/* Animate every [data-count-to] inside scope from 0 → target.
   Markup ships with the final value, so no-JS and reduced-motion
   users simply see the number. */
export function runCountUps(scope) {
  if (!scope || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  scope.querySelectorAll('[data-count-to]').forEach((el) => {
    const to = Number(el.dataset.countTo);
    if (!to) return;
    const t0 = performance.now();
    const DURATION = 650;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / DURATION);
      el.textContent = NUM_GB.format(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/* ── Sparklines ──────────────────────────────────────────────
   Compact monochrome trend line for a short numeric series
   (e.g. six months of revenue). Ships at a fixed viewBox and is
   themed entirely through CSS — .spark-area fills, .spark-line
   strokes (non-scaling so it stays crisp at any width), and
   .spark-dot marks the latest point — so one helper reads
   correctly on white or warm-black. Returns '' for a series too
   short to imply a trend. */
export function sparkline(values, { width = 150, height = 36, pad = 5 } = {}) {
  const nums = (values || []).map(Number).filter(Number.isFinite);
  if (nums.length < 2) return '';

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  const floor = height - pad;
  const stepX = (width - pad * 2) / (nums.length - 1);
  // A flat series rests on the mid-line rather than the floor.
  const y = (v) => (span === 0 ? height / 2 : floor - ((v - min) / span) * (height - pad * 2));

  const pts = nums.map((v, i) => [pad + i * stepX, y(v)]);
  const line = pts
    .map(([x, py], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${py.toFixed(1)}`)
    .join(' ');
  const last = pts[pts.length - 1];
  const area = `${line} L${last[0].toFixed(1)} ${floor} L${pad} ${floor} Z`;

  return `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">`
    + `<path class="spark-area" d="${area}"></path>`
    + `<path class="spark-line" d="${line}"></path>`
    + `<circle class="spark-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.6"></circle>`
    + `</svg>`;
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
