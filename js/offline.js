/* ============================================================
   SVN OS — Offline Support
   1. A connectivity indicator that appears when the device drops
      offline and confirms when it returns.
   2. A durable write queue: mutations made while offline are
      stored in localStorage and replayed automatically on
      reconnect, in order.

   Modules opt in by routing their writes through queueOrRun().
   ============================================================ */

import { db } from '/js/supabase.js';
import { showToast } from '/js/toast.js';

const QUEUE_KEY = 'svn-os-offline-queue';
const MAX_QUEUE = 200;

let indicatorEl = null;
let styleInjected = false;
let flushing = false;
let listeners = [];

export function initOffline() {
  injectStyles();
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  // If we booted offline, reflect it. If we booted online with a
  // pending queue (e.g. tab was closed mid-offline), flush it.
  if (!navigator.onLine) {
    renderIndicator('offline');
  } else if (getQueue().length > 0) {
    flushQueue();
  }
}

export function isOnline() {
  return navigator.onLine;
}

/**
 * Generate a client-side UUID for new rows. Letting the client mint the
 * primary key means an optimistic row created offline keeps the same id
 * when it finally syncs — no reconciliation needed, and links between
 * rows (e.g. a transaction's deal_id) stay valid before the insert lands.
 */
export function newId() {
  return cryptoId();
}

/** Subscribe to queue-length changes. Returns an unsubscribe fn. */
export function onQueueChange(cb) {
  listeners.push(cb);
  cb(getQueue().length);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

export function pendingCount() {
  return getQueue().length;
}

/**
 * Run a Supabase write, or queue it if we're offline / it fails to
 * reach the network. `op` is a serializable descriptor so it can be
 * replayed later:
 *   { table, action: 'insert'|'update'|'delete'|'upsert',
 *     payload, match: { col: val }, conflict? }
 * `optimistic` (optional) is applied immediately to local state by
 * the caller — this helper only handles persistence + replay.
 *
 * Returns { queued: boolean, error?: Error }.
 */
export async function queueOrRun(op, label) {
  if (!navigator.onLine) {
    enqueue(op, label);
    showToast(`Saved offline — will sync when you reconnect`, 'info');
    return { queued: true };
  }
  try {
    await runOp(op);
    return { queued: false };
  } catch (err) {
    // Network-style failure → queue it; anything else → surface.
    if (isNetworkError(err)) {
      enqueue(op, label);
      showToast(`Saved offline — will sync when you reconnect`, 'info');
      return { queued: true };
    }
    return { queued: false, error: err };
  }
}

/* ── Queue persistence ────────────────────────────────────── */
function getQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setQueue(q) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {}
  const len = q.length;
  listeners.forEach(l => { try { l(len); } catch {} });
}

function enqueue(op, label) {
  const q = getQueue();
  q.push({ id: cryptoId(), op, label: label || '', ts: Date.now() });
  if (q.length > MAX_QUEUE) q.shift();
  setQueue(q);
  renderIndicator(navigator.onLine ? 'syncing' : 'offline');
}

/* ── Replay ──────────────────────────────────────────────── */
export async function flushQueue() {
  if (flushing) return;
  const queue = getQueue();
  if (queue.length === 0) return;
  if (!navigator.onLine) return;

  flushing = true;
  renderIndicator('syncing');

  let remaining = [...queue];
  let synced = 0;
  let failed = 0;

  while (remaining.length > 0) {
    const item = remaining[0];
    try {
      await runOp(item.op);
      synced++;
      remaining = remaining.slice(1);
      setQueue(remaining);
    } catch (err) {
      if (isNetworkError(err)) {
        // Still offline-ish — stop and keep the rest for next time.
        break;
      }
      // Permanent failure (e.g. validation): drop it so we don't wedge.
      failed++;
      remaining = remaining.slice(1);
      setQueue(remaining);
    }
  }

  flushing = false;

  if (remaining.length === 0) {
    if (synced > 0) {
      showToast(`Synced ${synced} offline change${synced !== 1 ? 's' : ''}`, 'success');
      window.dispatchEvent(new CustomEvent('svn-os:synced'));
    }
    if (failed > 0) {
      showToast(`${failed} change${failed !== 1 ? 's' : ''} could not be synced`, 'error');
    }
    renderIndicator(navigator.onLine ? 'online-flash' : 'offline');
  } else {
    renderIndicator('offline');
  }
}

async function runOp(op) {
  const { table, action, payload, match, conflict } = op;
  let query = db.from(table);

  if (action === 'insert') {
    const { error } = await query.insert(payload);
    if (error) throw error;
  } else if (action === 'upsert') {
    const { error } = await query.upsert(payload, conflict ? { onConflict: conflict } : undefined);
    if (error) throw error;
  } else if (action === 'update') {
    let q = query.update(payload);
    q = applyMatch(q, match);
    const { error } = await q;
    if (error) throw error;
  } else if (action === 'delete') {
    let q = query.delete();
    q = applyMatch(q, match);
    const { error } = await q;
    if (error) throw error;
  } else {
    throw new Error(`Unknown offline op action: ${action}`);
  }
}

function applyMatch(q, match) {
  if (!match) return q;
  for (const [col, val] of Object.entries(match)) {
    if (Array.isArray(val)) q = q.in(col, val);
    else q = q.eq(col, val);
  }
  return q;
}

/* ── Connectivity events ─────────────────────────────────── */
function onOnline() {
  renderIndicator('online-flash');
  flushQueue();
}

function onOffline() {
  renderIndicator('offline');
}

/* ── Indicator UI ─────────────────────────────────────────── */
function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .net-indicator {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%) translateY(-12px);
      background: #151515;
      border: 1px solid #2a2a2a;
      border-radius: 999px;
      padding: 7px 16px 7px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.74rem;
      font-weight: 500;
      color: #f0f0f0;
      z-index: 9800;
      box-shadow: 0 8px 28px rgba(0,0,0,0.5);
      opacity: 0;
      transition: opacity 200ms ease, transform 200ms cubic-bezier(0.4,0,0.2,1);
      pointer-events: none;
    }
    .net-indicator.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .net-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .net-indicator[data-state="offline"] .net-dot { background: #fbbf24; }
    .net-indicator[data-state="syncing"] .net-dot { background: #60a5fa; animation: netPulse 1s ease-in-out infinite; }
    .net-indicator[data-state="online-flash"] .net-dot { background: #34d399; }
    @keyframes netPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  `;
  document.head.appendChild(style);
}

let flashTimer = null;

function renderIndicator(state) {
  injectStyles();
  if (!indicatorEl) {
    indicatorEl = document.createElement('div');
    indicatorEl.className = 'net-indicator';
    indicatorEl.innerHTML = `<span class="net-dot"></span><span class="net-label"></span>`;
    document.body.appendChild(indicatorEl);
  }
  const label = indicatorEl.querySelector('.net-label');
  indicatorEl.setAttribute('data-state', state);

  clearTimeout(flashTimer);

  if (state === 'offline') {
    label.textContent = 'Offline — changes will sync later';
    indicatorEl.classList.add('show');
  } else if (state === 'syncing') {
    const n = getQueue().length;
    label.textContent = n > 0 ? `Syncing ${n} change${n !== 1 ? 's' : ''}…` : 'Syncing…';
    indicatorEl.classList.add('show');
  } else if (state === 'online-flash') {
    label.textContent = 'Back online';
    indicatorEl.classList.add('show');
    flashTimer = setTimeout(() => indicatorEl && indicatorEl.classList.remove('show'), 2200);
  }
}

/* ── Helpers ─────────────────────────────────────────────── */
function isNetworkError(err) {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  return msg.includes('failed to fetch')
    || msg.includes('network')
    || msg.includes('fetch')
    || msg.includes('load failed')
    || err.name === 'TypeError';
}

function cryptoId() {
  try {
    return crypto.randomUUID();
  } catch {
    return 'q' + Date.now() + Math.random().toString(36).slice(2);
  }
}
