/* ============================================================
   SVN OS — Notifications Center
   Bell icon in nav-footer + dropdown with recent activity & overdue items
   ============================================================ */

import { db, isAuthenticated } from '/js/supabase.js';
import { navigate } from '/js/router.js';

const SEEN_KEY = 'svn-os-notifications-seen-at';
let styleInjected = false;
let dropdownEl = null;
let outsideClickHandler = null;
let escHandler = null;
let cachedItems = [];

export function initNotifications() {
  injectStyles();
  mountBell();
  // Poll for fresh counts every 60s while the app is open.
  setInterval(refreshUnreadCount, 60 * 1000);
  // Refresh whenever the route changes (cheap: just re-query unread count).
  window.addEventListener('popstate', refreshUnreadCount);
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-route]');
    if (link) setTimeout(refreshUnreadCount, 400);
  });
  // Initial pull.
  refreshUnreadCount();
}

function mountBell() {
  const navFooter = document.querySelector('.nav-footer');
  if (!navFooter) return;
  if (document.getElementById('notif-bell')) return;

  const wrap = document.createElement('div');
  wrap.className = 'notif-wrap';
  wrap.innerHTML = `
    <button class="notif-bell" id="notif-bell" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 01-3.46 0"/>
      </svg>
      <span class="notif-dot" id="notif-dot" hidden></span>
    </button>
  `;
  // Insert above the user block.
  const userEl = navFooter.querySelector('.nav-user');
  if (userEl) navFooter.insertBefore(wrap, userEl);
  else navFooter.appendChild(wrap);

  document.getElementById('notif-bell').addEventListener('click', toggleDropdown);
}

function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .notif-wrap {
      position: relative;
      margin-bottom: 12px;
      padding: 0 4px;
    }
    .notif-bell {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      color: var(--color-text-dim);
      background: transparent;
      transition: color var(--transition-fast), background var(--transition-fast);
      font-size: 0.87rem;
      position: relative;
    }
    .notif-bell::after {
      content: 'Notifications';
      font-size: inherit;
      color: inherit;
    }
    .notif-bell:hover { color: var(--color-text); background: var(--color-surface-2); }
    .notif-bell[aria-expanded="true"] { color: var(--color-text); background: var(--color-surface-2); }
    .notif-dot {
      position: absolute;
      top: 8px;
      left: 22px;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--color-danger);
      box-shadow: 0 0 0 2px var(--color-surface);
    }

    .notif-dropdown {
      position: fixed;
      left: calc(var(--nav-width) + 12px);
      bottom: 24px;
      width: 360px;
      max-height: 70vh;
      background: #141414;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-elevated);
      z-index: 999;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: notifIn 160ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes notifIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .notif-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--color-border);
    }
    .notif-title {
      font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.1em; color: var(--color-text-dim);
    }
    .notif-mark {
      font-size: 0.7rem; color: var(--color-text-muted); background: none; border: none;
      cursor: pointer; transition: color var(--transition-fast);
    }
    .notif-mark:hover { color: var(--color-text); }

    .notif-list {
      flex: 1; overflow-y: auto; padding: 4px 0;
    }
    .notif-item {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-border-subtle);
      cursor: pointer;
      transition: background var(--transition-fast);
      text-align: left;
      width: 100%;
      background: transparent;
      border-left: none; border-right: none;
      color: inherit;
    }
    .notif-item:last-child { border-bottom: none; }
    .notif-item:hover { background: var(--color-surface-2); }
    .notif-item.unread {
      background: rgba(255, 255, 255, 0.015);
    }
    .notif-item.unread .notif-item-title {
      color: var(--color-text);
    }
    .notif-icon {
      width: 28px; height: 28px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      background: var(--color-surface);
      color: var(--color-text-dim);
    }
    .notif-icon.warn { color: var(--color-warning); background: rgba(251, 191, 36, 0.08); }
    .notif-icon.success { color: var(--color-success); background: rgba(52, 211, 153, 0.08); }
    .notif-icon.info { color: var(--color-info); background: rgba(96, 165, 250, 0.08); }
    .notif-body { flex: 1; min-width: 0; }
    .notif-item-title {
      font-size: 0.82rem; color: var(--color-text-dim); line-height: 1.4;
      word-wrap: break-word;
    }
    .notif-item-meta {
      font-size: 0.66rem; color: var(--color-text-muted); margin-top: 3px;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .notif-empty {
      padding: 32px 16px; text-align: center; font-size: 0.78rem;
      color: var(--color-text-muted);
    }

    @media (max-width: 768px) {
      .notif-dropdown {
        left: 12px; right: 12px; width: auto; bottom: 12px;
      }
    }
  `;
  document.head.appendChild(style);
}

async function refreshUnreadCount() {
  if (!(await isAuthenticated())) {
    setDot(false);
    return;
  }
  try {
    const items = await loadItems(20);
    cachedItems = items;
    const seenAt = getSeenAt();
    const unread = items.some(it => new Date(it.timestamp).getTime() > seenAt);
    setDot(unread);
  } catch {
    setDot(false);
  }
}

function setDot(visible) {
  const dot = document.getElementById('notif-dot');
  if (!dot) return;
  dot.hidden = !visible;
}

function getSeenAt() {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

function setSeenAt(ts) {
  try { localStorage.setItem(SEEN_KEY, String(ts)); } catch {}
}

async function toggleDropdown() {
  if (dropdownEl) {
    closeDropdown();
    return;
  }
  await openDropdown();
}

async function openDropdown() {
  const bell = document.getElementById('notif-bell');
  if (bell) bell.setAttribute('aria-expanded', 'true');

  dropdownEl = document.createElement('div');
  dropdownEl.className = 'notif-dropdown';
  dropdownEl.setAttribute('role', 'dialog');
  dropdownEl.setAttribute('aria-label', 'Notifications');
  dropdownEl.innerHTML = `
    <div class="notif-head">
      <div class="notif-title">Activity</div>
      <button class="notif-mark" id="notif-mark-all">Mark all as read</button>
    </div>
    <div class="notif-list" id="notif-list">
      <div class="notif-empty">Loading…</div>
    </div>
  `;
  document.body.appendChild(dropdownEl);

  document.getElementById('notif-mark-all').addEventListener('click', () => {
    setSeenAt(Date.now());
    setDot(false);
    if (dropdownEl) renderList(cachedItems);
  });

  // Load fresh data
  try {
    cachedItems = await loadItems(20);
  } catch {
    cachedItems = [];
  }
  renderList(cachedItems);

  // Click-outside closes
  outsideClickHandler = (e) => {
    if (!dropdownEl) return;
    if (dropdownEl.contains(e.target)) return;
    if (e.target.closest('#notif-bell')) return;
    closeDropdown();
  };
  setTimeout(() => document.addEventListener('click', outsideClickHandler), 0);

  escHandler = (e) => {
    if (e.key === 'Escape') closeDropdown();
  };
  document.addEventListener('keydown', escHandler);
}

function closeDropdown() {
  if (!dropdownEl) return;
  dropdownEl.remove();
  dropdownEl = null;
  const bell = document.getElementById('notif-bell');
  if (bell) bell.setAttribute('aria-expanded', 'false');
  if (outsideClickHandler) document.removeEventListener('click', outsideClickHandler);
  if (escHandler) document.removeEventListener('keydown', escHandler);
  outsideClickHandler = null;
  escHandler = null;
}

function renderList(items) {
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (!items || items.length === 0) {
    list.innerHTML = '<div class="notif-empty">No recent activity yet.</div>';
    return;
  }
  const seenAt = getSeenAt();
  list.innerHTML = items.map(it => {
    const ts = new Date(it.timestamp).getTime();
    const unread = ts > seenAt;
    return `
      <button type="button" class="notif-item ${unread ? 'unread' : ''}" data-route="${escapeAttr(it.route)}">
        <div class="notif-icon ${it.iconClass || ''}">${it.icon}</div>
        <div class="notif-body">
          <div class="notif-item-title">${escapeHtml(it.title)}</div>
          <div class="notif-item-meta">${escapeHtml(it.meta)} · ${formatRelativeTime(it.timestamp)}</div>
        </div>
      </button>
    `;
  }).join('');

  list.querySelectorAll('.notif-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const route = btn.getAttribute('data-route');
      closeDropdown();
      if (route) navigate(route);
    });
  });
}

async function loadItems(limit) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 7);
  const horizonKey = horizon.toISOString().slice(0, 10);

  const [content, deals, txns, overdueDeals, upcomingDeals] = await Promise.all([
    db.from('content_projects')
      .select('id, title, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit),
    db.from('brand_deals')
      .select('id, brand_name, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit),
    db.from('transactions')
      .select('id, description, amount, type, date, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    db.from('brand_deals')
      .select('id, brand_name, status, deadline')
      .lt('deadline', todayKey)
      .in('status', ['lead', 'negotiating', 'signed', 'in_progress'])
      .order('deadline', { ascending: true })
      .limit(10),
    db.from('brand_deals')
      .select('id, brand_name, status, deadline')
      .gte('deadline', todayKey)
      .lte('deadline', horizonKey)
      .in('status', ['lead', 'negotiating', 'signed', 'in_progress'])
      .order('deadline', { ascending: true })
      .limit(10),
  ]);

  const items = [];

  (overdueDeals.data || []).forEach(d => {
    items.push({
      title: `${d.brand_name} is overdue`,
      meta: `Deal · ${d.status}`,
      timestamp: d.deadline + 'T00:00:00.000Z',
      route: '/deals',
      icon: warningIcon(),
      iconClass: 'warn',
      priority: 100,
    });
  });

  (upcomingDeals.data || []).forEach(d => {
    items.push({
      title: `${d.brand_name} deadline approaching`,
      meta: `Due ${d.deadline}`,
      timestamp: d.deadline + 'T00:00:00.000Z',
      route: '/deals',
      icon: clockIcon(),
      iconClass: 'info',
      priority: 50,
    });
  });

  (content.data || []).forEach(c => {
    items.push({
      title: `${c.title || 'Untitled'} — ${c.status}`,
      meta: 'Content',
      timestamp: c.updated_at,
      route: '/content',
      icon: contentIcon(),
    });
  });

  (deals.data || []).forEach(d => {
    items.push({
      title: `${d.brand_name} — ${d.status}`,
      meta: 'Deal',
      timestamp: d.updated_at,
      route: '/deals',
      icon: dealIcon(),
      iconClass: d.status === 'completed' ? 'success' : '',
    });
  });

  (txns.data || []).forEach(t => {
    const amt = Number(t.amount) || 0;
    items.push({
      title: `${t.description || 'Transaction'} · $${amt.toLocaleString('en-US')}`,
      meta: t.type === 'income' ? 'Income' : 'Expense',
      timestamp: t.created_at || (t.date + 'T00:00:00.000Z'),
      route: '/deals',
      icon: t.type === 'income' ? incomeIcon() : expenseIcon(),
      iconClass: t.type === 'income' ? 'success' : '',
    });
  });

  // Sort: priority desc, then timestamp desc
  items.sort((a, b) => {
    const pa = a.priority || 0;
    const pb = b.priority || 0;
    if (pa !== pb) return pb - pa;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return items.slice(0, 25);
}

function formatRelativeTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/&/g, '&amp;');
}

const ICON_ATTRS = 'viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

function contentIcon() {
  return `<svg ${ICON_ATTRS}><rect x="2" y="2" width="5" height="6" rx="1"/><rect x="9" y="2" width="5" height="4" rx="1"/><rect x="2" y="10" width="5" height="4" rx="1"/><rect x="9" y="8" width="5" height="6" rx="1"/></svg>`;
}
function dealIcon() {
  return `<svg ${ICON_ATTRS}><line x1="8" y1="1" x2="8" y2="15"/><path d="M11 4H7a2 2 0 000 4h2a2 2 0 010 4H4"/></svg>`;
}
function incomeIcon() {
  return `<svg ${ICON_ATTRS}><line x1="8" y1="14" x2="8" y2="2"/><polyline points="3 7 8 2 13 7"/></svg>`;
}
function expenseIcon() {
  return `<svg ${ICON_ATTRS}><line x1="8" y1="2" x2="8" y2="14"/><polyline points="3 9 8 14 13 9"/></svg>`;
}
function clockIcon() {
  return `<svg ${ICON_ATTRS}><circle cx="8" cy="8" r="6"/><polyline points="8 5 8 8 10 10"/></svg>`;
}
function warningIcon() {
  return `<svg ${ICON_ATTRS}><path d="M8 1L1 14h14L8 1z"/><line x1="8" y1="6" x2="8" y2="9"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/></svg>`;
}
