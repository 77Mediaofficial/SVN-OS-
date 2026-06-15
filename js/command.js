/* Command palette (⌘K / Ctrl-K) + global quick-create.
   One keyboard-first surface for navigating, searching across the
   workspace, creating records, and reaching utilities. Builds its own
   overlay (like drawer.js) and themes entirely through CSS tokens, so it
   matches both the white and warm-black themes. Opens only while the app
   shell is visible, never on the signed-out gate. */

import { navigate } from './router.js';
import { projects, deals, clients, transactions } from './store.js';
import { esc, todayKey } from './ui.js';
import { toast } from './toast.js';
import { getAppearance, setAppearance } from './appearance.js';
import { openPrivacySheet } from './applock.js';
import {
  PLATFORMS, CONTENT_STAGES, DEAL_STATUSES, TXN_CATEGORIES, optionsHtml,
} from './domain.js';

let root = null;
let input = null;
let listEl = null;
let footEl = null;
let lastFocus = null;
let visible = [];      // flat list of currently-shown items
let active = 0;        // highlighted index into `visible`
let cache = { projects: [], deals: [], clients: [] };

const ICON = {
  go: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>',
  create: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>',
  search: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 13 13"/></svg>',
  tool: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2"/><path d="M8 2v1.6M8 12.4V14M14 8h-1.6M3.6 8H2"/></svg>',
};

/* ── Static commands ─────────────────────────────────────── */

function navCommands() {
  const go = (label, path) => ({
    group: 'Go to', icon: ICON.go, label, hint: path,
    keywords: label.toLowerCase(),
    run: () => { close(); navigate(path); },
  });
  return [
    go('Today', '/'),
    go('Content Engine', '/content'),
    go('Resizer', '/resizer'),
    go('Calendar', '/calendar'),
    go('Deals & Ledger', '/deals'),
    go('Studio', '/studio'),
    go('Analytics', '/analytics'),
    go('Settings', '/settings'),
  ];
}

function createCommands() {
  const mk = (label, kind, keywords) => ({
    group: 'Create', icon: ICON.create, label, hint: 'New record',
    keywords: `new add create ${keywords}`,
    run: () => showForm(kind),
  });
  return [
    mk('New project', 'project', 'content video idea pipeline'),
    mk('New deal', 'deal', 'brand sponsor pipeline client'),
    mk('New transaction', 'transaction', 'income expense ledger money payment'),
  ];
}

function toolCommands() {
  const dark = () => document.documentElement.classList.contains('theme-dark');
  return [
    {
      group: 'Workspace', icon: ICON.tool,
      label: () => `Switch to ${dark() ? 'light' : 'dark'} theme`,
      keywords: 'theme dark light appearance toggle',
      run: () => {
        setAppearance({ theme: dark() ? 'light' : 'dark' });
        close();
        toast(`${dark() ? 'Dark' : 'Light'} theme on.`);
      },
    },
    {
      group: 'Workspace', icon: ICON.tool, label: 'Privacy & security',
      keywords: 'privacy security lock export erase data',
      run: () => { close(); openPrivacySheet(); },
    },
    {
      group: 'Workspace', icon: ICON.tool, label: 'Keyboard shortcuts',
      keywords: 'keyboard shortcuts help cheat sheet keys',
      run: () => { close(); window.dispatchEvent(new CustomEvent('svnos:shortcuts')); },
    },
    {
      group: 'Workspace', icon: ICON.tool, label: 'View landing page',
      keywords: 'landing marketing pricing front door signed out welcome',
      run: () => { close(); window.dispatchEvent(new CustomEvent('svnos:landing')); },
    },
  ];
}

/* ── Entity search ───────────────────────────────────────── */

function searchEntities(q) {
  const out = [];
  const needle = q.toLowerCase();
  const add = (label, hint, path) => out.push({
    group: 'Search', icon: ICON.search, label, hint,
    keywords: label.toLowerCase(), run: () => { close(); navigate(path); },
  });
  for (const p of cache.projects) {
    if (p.title && p.title.toLowerCase().includes(needle)) add(p.title, 'Project', '/content');
    if (out.length >= 6) break;
  }
  for (const d of cache.deals) {
    if (d.brand_name && d.brand_name.toLowerCase().includes(needle)) add(d.brand_name, 'Deal', '/deals');
    if (out.length >= 10) break;
  }
  for (const c of cache.clients) {
    if (c.name && c.name.toLowerCase().includes(needle)) add(c.name, 'Client', '/settings');
    if (out.length >= 14) break;
  }
  return out;
}

const labelOf = (item) => (typeof item.label === 'function' ? item.label() : item.label);

/* ── Render ──────────────────────────────────────────────── */

function compute(q) {
  const all = [...createCommands(), ...navCommands(), ...toolCommands()];
  if (!q.trim()) return all;
  const needle = q.toLowerCase();
  const matchedCmds = all.filter((c) =>
    labelOf(c).toLowerCase().includes(needle) || (c.keywords || '').includes(needle));
  return [...matchedCmds, ...searchEntities(q)];
}

function renderList(q) {
  visible = compute(q);
  active = 0;

  if (!visible.length) {
    listEl.innerHTML = `<p class="cmd-empty">No matches for “${esc(q)}”.</p>`;
    return;
  }

  const groups = [];
  const order = ['Create', 'Go to', 'Search', 'Workspace'];
  for (const name of order) {
    const items = visible.filter((it) => it.group === name);
    if (items.length) groups.push([name, items]);
  }

  let idx = 0;
  listEl.innerHTML = groups.map(([name, items]) => `
    <div class="cmd-group" role="group" aria-label="${name}">
      <p class="cmd-group-label">${name}</p>
      ${items.map((it) => {
        const i = idx++;
        return `
          <button type="button" class="cmd-item${i === 0 ? ' is-active' : ''}" role="option" data-idx="${i}">
            <span class="cmd-ico">${it.icon || ''}</span>
            <span class="cmd-label">${esc(labelOf(it))}</span>
            <span class="cmd-hint">${esc(it.hint || '')}</span>
          </button>`;
      }).join('')}
    </div>`).join('');
}

function setActive(next) {
  const items = listEl.querySelectorAll('.cmd-item');
  if (!items.length) return;
  active = (next + items.length) % items.length;
  items.forEach((el, i) => el.classList.toggle('is-active', i === active));
  items[active].scrollIntoView({ block: 'nearest' });
}

function runActive() {
  const item = visible[active];
  if (item) item.run();
}

/* ── Quick-create forms ──────────────────────────────────── */

function showForm(kind) {
  const forms = {
    project: {
      title: 'New project',
      fields: `
        <div class="field"><label>Title</label>
          <input name="title" required autocomplete="off" placeholder="What are you making?" /></div>
        <div class="field-row">
          <div class="field"><label>Platform</label>
            <select name="platform">${optionsHtml(PLATFORMS, 'youtube')}</select></div>
          <div class="field"><label>Stage</label>
            <select name="status">${optionsHtml(CONTENT_STAGES.map((s) => ({ key: s.key, label: s.label })), 'idea')}</select></div>
        </div>`,
      create: (d) => projects.create({
        title: d.title, platform: d.platform, status: d.status,
        description: '', notes: '', tags: [], scheduled_at: null, published_at: null,
      }),
      go: '/content',
    },
    deal: {
      title: 'New deal',
      fields: `
        <div class="field"><label>Brand</label>
          <input name="brand_name" required autocomplete="off" placeholder="Who's the client?" /></div>
        <div class="field-row">
          <div class="field"><label>Value (£)</label>
            <input name="value" type="number" min="0" step="50" placeholder="0" /></div>
          <div class="field"><label>Status</label>
            <select name="status">${optionsHtml(DEAL_STATUSES.map((s) => ({ key: s.key, label: s.label })), 'lead')}</select></div>
        </div>`,
      create: (d) => deals.create({
        brand_name: d.brand_name, value: Number(d.value) || 0, status: d.status,
        contact_name: '', contact_email: '', notes: '', tags: [], deadline: null,
      }),
      go: '/deals',
    },
    transaction: {
      title: 'New transaction',
      fields: `
        <div class="field-row">
          <div class="field"><label>Type</label>
            <select name="type"><option value="income">Income</option><option value="expense">Expense</option></select></div>
          <div class="field"><label>Amount (£)</label>
            <input name="amount" type="number" min="0" step="0.01" required placeholder="0.00" /></div>
        </div>
        <div class="field"><label>Description</label>
          <input name="description" autocomplete="off" placeholder="What was it?" /></div>
        <div class="field"><label>Category</label>
          <select name="category">${optionsHtml(TXN_CATEGORIES, 'sponsorship')}</select></div>`,
      create: (d) => transactions.create({
        type: d.type, amount: Number(d.amount) || 0, description: d.description || '',
        category: d.category, occurred_at: todayKey(), recurrence: 'none',
        recurrence_end: null, parent_transaction_id: null, deal_id: null,
      }),
      go: '/deals',
    },
  };

  const spec = forms[kind];
  root.classList.add('is-form');
  input.value = '';
  listEl.innerHTML = `
    <form class="cmd-form" id="cmd-form" novalidate>
      <p class="cmd-form-title">${spec.title}</p>
      ${spec.fields}
      <p class="auth-error" id="cmd-form-error" hidden></p>
      <div class="cmd-form-actions">
        <button type="button" class="btn" data-cmd-back>Back</button>
        <button type="submit" class="btn btn-primary">Create</button>
      </div>
    </form>`;

  const form = listEl.querySelector('#cmd-form');
  form.querySelector('input, select')?.focus();
  form.querySelector('[data-cmd-back]').addEventListener('click', () => exitForm());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = typeof v === 'string' ? v.trim() : v; });
    const errEl = form.querySelector('#cmd-form-error');
    if ((kind === 'project' && !data.title) || (kind === 'deal' && !data.brand_name) ||
        (kind === 'transaction' && !(Number(data.amount) > 0))) {
      errEl.textContent = kind === 'transaction' ? 'Enter an amount above zero.' : 'Give it a name first.';
      errEl.hidden = false;
      return;
    }
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await spec.create(data);
      close();
      toast(`${spec.title.replace('New ', '').replace(/^\w/, (c) => c.toUpperCase())} created.`, 'success');
      navigate(spec.go);
    } catch (err) {
      console.error(err);
      errEl.textContent = 'Could not save — try again.';
      errEl.hidden = false;
      submitBtn.disabled = false;
    }
  });
}

function exitForm() {
  root.classList.remove('is-form');
  renderList('');
  input.value = '';
  input.focus();
}

/* ── Open / close ────────────────────────────────────────── */

function appVisible() {
  const shell = document.getElementById('app');
  return shell && !shell.hidden && !document.body.classList.contains('locked');
}

export async function openCommand() {
  if (!root) build();
  if (!appVisible()) return;
  if (!root.hidden) return;
  lastFocus = document.activeElement;
  root.classList.remove('is-form');
  root.hidden = false;
  document.body.classList.add('cmd-open');
  input.value = '';
  renderList('');
  void root.offsetWidth;        // commit start state before transitioning in
  root.classList.add('is-open');
  input.focus();

  // Refresh search caches in the background; re-render if still open + empty query.
  Promise.all([projects.list(), deals.list(), clients.list()])
    .then(([p, d, c]) => {
      cache = { projects: p, deals: d, clients: c };
      if (!root.hidden && !root.classList.contains('is-form') && input.value === input.value) renderList(input.value);
    })
    .catch(() => {});
}

export function close() {
  if (!root || root.hidden) return;
  root.classList.remove('is-open');
  document.body.classList.remove('cmd-open');
  setTimeout(() => { if (root) root.hidden = true; }, 200);
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
}

/* ── Build + global wiring ───────────────────────────────── */

function build() {
  root = document.createElement('div');
  root.className = 'cmd-root';
  root.hidden = true;
  root.innerHTML = `
    <div class="cmd-backdrop" data-cmd-close></div>
    <div class="cmd-panel" role="dialog" aria-modal="true" aria-label="Command palette">
      <div class="cmd-search">
        ${ICON.search}
        <input id="cmd-input" type="text" autocomplete="off" spellcheck="false"
               placeholder="Search or run a command…" aria-label="Command palette search" />
        <kbd class="cmd-esc">esc</kbd>
      </div>
      <div class="cmd-list" id="cmd-list" role="listbox" aria-label="Commands"></div>
      <div class="cmd-foot" id="cmd-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> select</span>
        <span><kbd>esc</kbd> close</span>
      </div>`;
  document.body.appendChild(root);

  input = root.querySelector('#cmd-input');
  listEl = root.querySelector('#cmd-list');
  footEl = root.querySelector('#cmd-foot');

  input.addEventListener('input', () => { if (!root.classList.contains('is-form')) renderList(input.value); });

  input.addEventListener('keydown', (e) => {
    if (root.classList.contains('is-form')) return; // form handles its own keys
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); runActive(); }
  });

  listEl.addEventListener('click', (e) => {
    const item = e.target.closest('.cmd-item');
    if (!item) return;
    active = Number(item.dataset.idx);
    runActive();
  });
  listEl.addEventListener('mousemove', (e) => {
    const item = e.target.closest('.cmd-item');
    if (item) setActive(Number(item.dataset.idx));
  });

  root.addEventListener('click', (e) => { if (e.target.closest('[data-cmd-close]')) close(); });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (root && !root.hidden) close(); else openCommand();
      return;
    }
    if (e.key === 'Escape' && root && !root.hidden) {
      e.preventDefault();
      if (root.classList.contains('is-form')) exitForm(); else close();
    }
  });
}

export function initCommand() {
  if (!root) build();
  const btn = document.getElementById('cmd-launch');
  if (btn) btn.addEventListener('click', () => openCommand());
}
