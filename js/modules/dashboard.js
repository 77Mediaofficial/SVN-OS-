/* Dashboard Home — the morning briefing.
   Immediate action items (operable inline — resolve/snooze with optimistic
   updates + undo), monthly revenue, pipeline snapshot, what's next.

   QA / architecture pass:
   • render-from-state is pure & synchronous; fetch-into-state is async. That
     split is what lets an inline action repaint instantly and roll back cleanly.
   • A generation token + a returned cleanup keep the view leak-safe: a fetch
     that resolves after you've navigated away — or a late background write —
     becomes a no-op instead of writing to torn-down DOM. The one click listener
     lives on the stable #outlet and is removed on cleanup.
   • Every write goes through the data layer (store.js repos), which throws on a
     Supabase error. We catch, roll the UI back, and surface it — never fail
     silently. Reads use allSettled so one dead query degrades a single panel,
     not the whole view. All of this is correct in demo mode today and works
     unchanged once Supabase is wired. */

import { projects, deals, transactions, getPrefs } from '../store.js';
import {
  money, esc, fmtTime, relDay, dayKey, todayKey, isoWeek,
  statMoney, statInt, runCountUps, applyVars,
} from '../ui.js';
import {
  CONTENT_STAGES, STAGE_BY_KEY, PLATFORM_BY_KEY, DEAL_STATUS_BY_KEY,
  stageTone,
} from '../domain.js';
import { toast } from '../toast.js';

const OPEN_DEAL_STATUSES = new Set(['lead', 'negotiating', 'signed', 'delivered']);
const DEAL_FLOW = { lead: 'negotiating', negotiating: 'signed', signed: 'delivered', delivered: 'paid' };

const ICON_DONE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 5"/></svg>';
const ICON_SNOOZE = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8.5" r="5.2"/><path d="M8 5.6V8.6l2 1.4"/><path d="M2.5 3.5 5 1.8M13.5 3.5 11 1.8"/></svg>';

/* ── View state & lifecycle ──────────────────────────────────
   `gen` increments on every mount and on cleanup; async continuations capture
   the gen they began under and bail when it changes. `busy` guards a single
   item against a double-tap while its write is in flight. */
let gen = 0;
let state = emptyState();
let busy = new Set();
let countedUp = false;  // 1A: the stat count-up fires once per mount, never on a mutation re-render
let clockTimer = null;  // Command-State live clock — cleared on cleanup so it can't tick a torn-down view

function emptyState() {
  return { projs: [], dls: [], txns: [], prefs: null, errors: {} };
}

const byId = (id) => document.getElementById(id);
const REPOS = { projs: projects, dls: deals, txns: transactions };

const EXIT_MS = 200;                              // 3A: row exit-fade duration (mirrors the CSS)
const ACTION_LIMIT = 8;                           // 1D: rows shown before collapsing to "+N more"
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const actionRow = (id) => byId('actions-list')?.querySelector(`.act[data-id="${CSS.escape(id)}"]`);

export async function init() {
  const myGen = ++gen;
  state = emptyState();
  busy = new Set();
  countedUp = false;                               // 1A: re-arm the once-per-mount count-up

  const outlet = byId('outlet');
  renderSlate();
  mountCmdState();                                 // Command-State hero: greeting + live clock
  mountSpotlight();                                // 2G: Today-only cinematic wash
  // Delegated click handling on the STABLE outlet node: survives panel
  // re-renders, and is removed on cleanup so it can't leak or fire on the next
  // view. Re-adding the same fn ref is a spec no-op, so this stays idempotent.
  outlet?.addEventListener('click', onClick);

  // Hydrate without blocking init: the fragment ships skeletons, so they show
  // until data lands. Detaching also lets the router register `cleanup` before
  // any mid-fetch navigation, closing the listener-leak window entirely.
  hydrate(myGen).catch((err) => console.error('dashboard: hydrate crashed', err));

  return function cleanup() {
    gen++;
    outlet?.removeEventListener('click', onClick);
    clearInterval(clockTimer); clockTimer = null;  // stop the Command-State clock
    unmountSpotlight();                            // 2G: tear the wash down with the view
  };
}

/* 2G — Hero spotlight: a Today-only flourish. It lives on <body> (fixed-position,
   so it stays viewport-anchored regardless of parent) and is created on mount /
   removed on cleanup — it no longer sits in the global shell glowing behind every
   route. Re-mounting replays its entrance each time you land on Today. */
let spotlightEl = null;
function mountSpotlight() {
  unmountSpotlight();
  spotlightEl = document.createElement('div');
  spotlightEl.className = 'hero-spotlight';
  spotlightEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(spotlightEl);
}
function unmountSpotlight() {
  spotlightEl?.remove();
  spotlightEl = null;
}

/* ── Hydrate: fetch-into-state, then render ──────────────────
   allSettled, not all — one dead query degrades a single panel, never the
   whole view, and never leaves a skeleton spinning forever. */
async function hydrate(myGen) {
  const [projsR, dlsR, txnsR, prefsR] = await Promise.allSettled([
    projects.list(), deals.list(), transactions.list(), getPrefs(),
  ]);
  if (myGen !== gen) return; // navigated away mid-fetch — drop the stale result

  state = {
    projs: projsR.status === 'fulfilled' ? projsR.value : [],
    dls:   dlsR.status === 'fulfilled' ? dlsR.value : [],
    txns:  txnsR.status === 'fulfilled' ? txnsR.value : [],
    prefs: prefsR.status === 'fulfilled' ? prefsR.value : null,
    errors: {
      projs: projsR.status === 'rejected',
      dls:   dlsR.status === 'rejected',
      txns:  txnsR.status === 'rejected',
    },
  };

  for (const [label, r] of [['projects', projsR], ['deals', dlsR], ['transactions', txnsR], ['prefs', prefsR]]) {
    if (r.status === 'rejected') console.error(`dashboard: ${label} failed to load`, r.reason);
  }

  renderFromState();
}

/* Re-fetch and repaint — panel "Try again" + post-undo reconciliation. */
async function reload() {
  await hydrate(gen);
}

/* ── render-from-state: pure, synchronous, fault-isolated ─────
   Each panel renders independently; one throwing never blocks the others. */
function renderFromState() {
  safe(renderCmdGreeting);   // fill "PERSON // STUDIO" once prefs land
  safe(renderStats);
  safe(renderActions);
  safe(renderPipeline);
  safe(renderLedgerMini);
  safe(renderUpNext);
}

function safe(fn) {
  try { fn(); } catch (err) { console.error(`dashboard: ${fn.name} threw`, err); }
}

/* Inline panel failure state — reuses existing .empty / .btn styling, and the
   retry button is picked up by the delegated outlet listener. */
function panelError(label) {
  return `
    <div class="empty">
      <p class="empty-title">Couldn’t load ${label}.</p>
      <p class="empty-sub">Your data is safe — nothing was lost.</p>
      <button type="button" class="btn" data-dash-retry>Try again</button>
    </div>`;
}

/* ── Command-State hero: greeting + live clock + active pulse ──
   The clock ticks via a single setInterval that writes ONLY the #cmd-clock
   text node — no view re-render — and is cleared on cleanup. */
const pad2 = (n) => String(n).padStart(2, '0');
const fmtClock = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

function renderCmdGreeting() {
  const el = byId('cmd-greeting');
  if (!el) return;
  const person = (byId('user-name')?.textContent || '').trim();
  const studio = (state.prefs?.business_name || '').trim();
  el.textContent = [person, studio].filter(Boolean).map((s) => s.toUpperCase()).join('  //  ') || '—';
}

function mountCmdState() {
  renderCmdGreeting();
  clearInterval(clockTimer);
  const tick = () => { const el = byId('cmd-clock'); if (el) el.textContent = fmtClock(); };
  tick();
  clockTimer = setInterval(tick, 1000);
}

/* ── Slate line ──────────────────────────────────────────── */

function renderSlate() {
  const el = byId('dash-slate');
  if (!el) return;
  const now = new Date();
  const parts = now
    .toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace(/,/g, '');
  el.textContent = `${parts} · WEEK ${String(isoWeek(now)).padStart(2, '0')}`;
}

/* ── Stat band ───────────────────────────────────────────── */

function statHtml(label, num, foot, numClass = '') {
  return `
    <div class="stat">
      <div class="stat-label">${label}</div>
      <div class="stat-num ${numClass}">${num}</div>
      <div class="stat-foot">${foot}</div>
    </div>`;
}

/* Each stat degrades on its own source: a failed query shows "—" rather than a
   misleading zero. In demo mode nothing fails, so this is byte-identical output. */
function renderStats() {
  const statsEl = byId('dash-stats');
  if (!statsEl) return;
  const { projs, dls, txns, prefs, errors } = state;
  const DASH = '—';

  let revenueNum = DASH, revenueFoot = 'unavailable';
  if (!errors.txns) {
    const month = todayKey().slice(0, 7);
    const inMonth = txns.filter((t) => String(t.occurred_at).startsWith(month));
    const income = inMonth.filter((t) => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const costs = inMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const net = income - costs;
    const goal = Number(prefs?.goal_monthly_revenue) || 0;
    const goalFoot = goal > 0 ? ` · ${Math.round((income / goal) * 100)}% of ${money(goal)} target` : '';
    revenueNum = statMoney(income);
    revenueFoot = `net ${money(net)} after ${money(costs)} costs${goalFoot}`;
  }

  let pipelineNum = DASH, pipelineFoot = 'unavailable';
  if (!errors.dls) {
    const open = dls.filter((d) => OPEN_DEAL_STATUSES.has(d.status));
    const pipelineValue = open.reduce((s, d) => s + (Number(d.value) || 0), 0);
    pipelineNum = statMoney(pipelineValue);
    pipelineFoot = `${open.length} open deal${open.length === 1 ? '' : 's'}`;
  }

  let activeNum = DASH, activeFoot = 'unavailable';
  if (!errors.projs) {
    const active = projs.filter((p) => p.status !== 'published');
    const inProduction = active.filter((p) => p.status === 'production').length;
    activeNum = statInt(active.length);
    activeFoot = `${inProduction} in production`;
  }

  let dueNum = DASH, dueFoot = 'unavailable';
  if (!errors.projs && !errors.dls) {
    const today = todayKey();
    const horizon = dayKey(new Date(Date.now() + 7 * 86400000));
    const open = dls.filter((d) => OPEN_DEAL_STATUSES.has(d.status));
    const dueContent = projs.filter((p) =>
      p.status !== 'published' && p.scheduled_at &&
      dayKey(p.scheduled_at) >= today && dayKey(p.scheduled_at) <= horizon);
    const dueDeals = open.filter((d) => d.deadline && d.deadline >= today && d.deadline <= horizon);
    dueNum = statInt(dueContent.length + dueDeals.length);
    dueFoot = `${dueContent.length} post${dueContent.length === 1 ? '' : 's'} · ${dueDeals.length} deal deadline${dueDeals.length === 1 ? '' : 's'}`;
  }

  statsEl.innerHTML =
    statHtml('Revenue this month', revenueNum, revenueFoot) +
    statHtml('Pipeline value', pipelineNum, pipelineFoot) +
    statHtml('Active projects', activeNum, activeFoot) +
    statHtml('Due in 7 days', dueNum, dueFoot);
  // 1A: animate only on the first paint of this mount — never re-roll on a mutation.
  // 1C: hand the loop a cancel token so it aborts the instant the view is torn down.
  // N1: only spend the once-per-mount flag once REAL numbers paint. An all-error first
  // hydrate renders "—" (no [data-count-to] spans), so the flag stays armed and a
  // successful retry still gets the count-up.
  if (!countedUp && statsEl.querySelector('[data-count-to]')) {
    countedUp = true;
    const animGen = gen;
    runCountUps(statsEl, () => animGen !== gen);
  }
}

/* ── Action items (operable) ─────────────────────────────── */

function actionRowHtml({ id, kind, tone, title, meta, right, href, resolveTitle }) {
  return `
    <li class="act" data-id="${id}" data-kind="${kind}">
      <a class="act-main" data-link href="${href}">
        <span class="dot tone-${tone}"></span>
        <span class="row-body">
          <span class="row-title">${title}</span>
          <span class="row-meta">${meta}</span>
        </span>
      </a>
      <span class="act-tail">
        <span class="row-right">${right}</span>
        <span class="act-btns">
          <button type="button" class="act-btn act-resolve" data-act="resolve" title="${resolveTitle}" aria-label="${resolveTitle}">${ICON_DONE}</button>
          <button type="button" class="act-btn" data-act="snooze" title="Snooze" aria-label="Snooze">${ICON_SNOOZE}</button>
        </span>
      </span>
    </li>`;
}

function buildActionItems() {
  const today = todayKey();
  const items = [];

  for (const d of state.dls) {
    if (!OPEN_DEAL_STATUSES.has(d.status) || !d.deadline) continue;
    const rel = relDay(d.deadline);
    const next = DEAL_FLOW[d.status];
    const resolveTitle = next ? `Move to ${DEAL_STATUS_BY_KEY[next].label}` : 'Advance';
    if (d.deadline < today) {
      items.push({ rank: 0, tone: 'red', href: '/deals', id: d.id, kind: 'deal', resolveTitle,
        title: esc(d.brand_name),
        meta: `${DEAL_STATUS_BY_KEY[d.status].label.toLowerCase()} · deliverable overdue`,
        right: rel.label });
    } else if (rel.tone === 'warn') {
      items.push({ rank: 2, tone: 'amber', href: '/deals', id: d.id, kind: 'deal', resolveTitle,
        title: esc(d.brand_name),
        meta: `${DEAL_STATUS_BY_KEY[d.status].label.toLowerCase()} · ${money(d.value)} on the line`,
        right: rel.label });
    }
  }

  for (const p of state.projs) {
    if (p.status === 'published' || !p.scheduled_at) continue;
    const key = dayKey(p.scheduled_at);
    if (key < today) {
      items.push({ rank: 1, tone: 'red', href: '/content', id: p.id, kind: 'project', resolveTitle: 'Mark published',
        title: esc(p.title),
        meta: p.owner ? `with ${esc(p.owner)} · past its slot — reassign or publish` : 'slipped past its slot — reschedule or publish',
        right: relDay(p.scheduled_at).label });
    } else if (key === today) {
      items.push({ rank: 2, tone: 'amber', href: '/content', id: p.id, kind: 'project', resolveTitle: 'Mark published',
        title: esc(p.title),
        meta: `${p.owner ? esc(p.owner) + ' · ' : ''}${PLATFORM_BY_KEY[p.platform]?.label ?? p.platform} · scheduled today`,
        right: fmtTime(p.scheduled_at) });
    }
  }

  items.sort((a, b) => a.rank - b.rank);
  return items;
}

function renderActions() {
  const listEl = byId('actions-list');
  const countEl = byId('actions-count');
  if (!listEl) return;

  if (state.errors.projs || state.errors.dls) {
    if (countEl) countEl.textContent = '';
    listEl.innerHTML = panelError('action items');
    return;
  }

  const items = buildActionItems();
  const shown = items.slice(0, ACTION_LIMIT);
  const overflow = items.length - shown.length;

  // 1D: never show a count that disagrees with the list. The badge reads "8 of 12"
  // when truncated, and a static "+N more" row accounts for the remainder.
  if (countEl) {
    countEl.textContent = items.length
      ? (overflow > 0 ? `${shown.length} of ${items.length}` : `${items.length}`)
      : '';
  }

  listEl.innerHTML = shown.length
    ? `<ul class="acts">${shown.map(actionRowHtml).join('')}${
        overflow > 0 ? `<li class="act act-more">+${overflow} more in Content &amp; Deals</li>` : ''
      }</ul>`
    : `<div class="empty">
         <p class="empty-title">All clear.</p>
         <p class="empty-sub">Nothing overdue, nothing on fire. Go make something.</p>
       </div>`;
}

/* ── Interaction: one delegated handler for the whole view ─── */

function onClick(e) {
  // Per-panel retry after a load failure.
  if (e.target.closest('[data-dash-retry]')) {
    e.preventDefault();
    reload();
    return;
  }
  const btn = e.target.closest('.act-btn');
  if (!btn) return;
  e.preventDefault();
  const li = btn.closest('.act');
  if (!li) return;
  const { id, kind } = li.dataset;
  if (busy.has(id)) return; // 1E: this row is mid-resolve — ignore repeat taps entirely
  if (kind === 'deal') resolveDeal(id, btn.dataset.act);
  else resolveProject(id, btn.dataset.act);
}

/* ── Optimistic state helpers ────────────────────────────────
   Updates are immutable: demo `list()` hands back live store-row references, so
   we swap in a fresh object rather than mutate one in place — the store is never
   touched until its own update() runs, which keeps rollback honest. */
function patchLocal(coll, id, patch) {
  const arr = state[coll];
  const i = arr.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const prev = arr[i];
  state[coll] = [...arr.slice(0, i), { ...prev, ...patch }, ...arr.slice(i + 1)];
  return prev;
}

function restoreLocal(coll, id, prevRow) {
  if (!prevRow) return;
  const arr = state[coll];
  const i = arr.findIndex((r) => r.id === id);
  state[coll] = i < 0
    ? [prevRow, ...arr]
    : [...arr.slice(0, i), prevRow, ...arr.slice(i + 1)];
}

/* The heart of it: patch local state → repaint instantly → persist in the
   background → roll back + surface on failure → offer undo on success. */
async function optimistic({ coll, id, patch, undoPatch, message, tone, errorMsg }) {
  if (busy.has(id)) return;                          // 1E: synchronous lock — no double-fire
  if (!state[coll].some((r) => r.id === id)) return;
  busy.add(id);                                      // claim the row before any await

  const myGen = gen;
  const li = actionRow(id);
  if (li) li.classList.add('is-resolving');          // 1E: freezes this row (pointer-events:none)
  const prevRow = patchLocal(coll, id, patch);

  // 3A: if this row is leaving the list, play its exit fade before repainting.
  // (A row that stays — e.g. a snooze, or a still-overdue deal — repaints instantly.)
  const leaving = !buildActionItems().some((it) => it.id === id);
  if (li && leaving && !reducedMotion()) {
    li.classList.add('is-leaving');
    await delay(EXIT_MS);
    if (myGen !== gen) { busy.delete(id); return; }  // navigated away mid-fade
  }
  renderFromState();                                 // item is gone/updated now

  try {
    await REPOS[coll].update(id, patch);             // background sync
    if (myGen === gen) {
      toast(message, tone, undoAction(coll, id, prevRow, undoPatch));
    }
  } catch (err) {
    console.error(`dashboard: ${coll}.update failed`, err);
    if (myGen === gen) {
      restoreLocal(coll, id, prevRow);               // 1B: a real failure now reaches here — roll back
      renderFromState();
      toast(errorMsg, 'error');
    }
  } finally {
    busy.delete(id);
  }
}

function undoAction(coll, id, prevRow, undoPatch) {
  return {
    action: {
      label: 'Undo',
      onClick: async () => {
        try {
          await REPOS[coll].update(id, undoPatch);
          await reload();                            // reconcile from the store
        } catch (err) {
          console.error('dashboard: undo failed', err);
          await reload();
          toast('Couldn’t undo that — refreshed.', 'error');
        }
      },
    },
  };
}

function resolveProject(id, act) {
  const p = state.projs.find((x) => x.id === id);
  if (!p) return;

  if (act === 'resolve') {
    return optimistic({
      coll: 'projs', id,
      patch: { status: 'published', published_at: new Date().toISOString() },
      undoPatch: { status: p.status, published_at: p.published_at ?? null },
      message: `“${truncate(p.title)}” marked published.`,
      tone: 'success',
      errorMsg: 'Couldn’t publish that — restored. Check your connection.',
    });
  }

  if (!p.scheduled_at) return;          // nothing to snooze — avoid new Date(null) → 1970
  const d = new Date(p.scheduled_at);
  const now = new Date();
  if (d < now) d.setTime(now.getTime());
  d.setDate(d.getDate() + 1);
  return optimistic({
    coll: 'projs', id,
    patch: { scheduled_at: d.toISOString() },
    undoPatch: { scheduled_at: p.scheduled_at },
    message: `Snoozed to ${relDay(d).label.toLowerCase()}.`,
    tone: 'info',
    errorMsg: 'Couldn’t snooze that — restored.',
  });
}

function resolveDeal(id, act) {
  const dl = state.dls.find((x) => x.id === id);
  if (!dl) return;

  if (act === 'resolve') {
    const next = DEAL_FLOW[dl.status];
    if (!next) return;
    return optimistic({
      coll: 'dls', id,
      patch: { status: next },
      undoPatch: { status: dl.status },
      message: `${dl.brand_name} moved to ${DEAL_STATUS_BY_KEY[next].label}.`,
      tone: 'success',
      errorMsg: `Couldn’t update ${dl.brand_name} — restored.`,
    });
  }

  const base = dl.deadline ? new Date(dl.deadline + 'T00:00:00') : new Date();
  base.setDate(base.getDate() + 7);
  return optimistic({
    coll: 'dls', id,
    patch: { deadline: dayKey(base) },
    undoPatch: { deadline: dl.deadline },
    message: 'Deadline pushed a week.',
    tone: 'info',
    errorMsg: 'Couldn’t push the deadline — restored.',
  });
}

const truncate = (s, n = 40) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

/* ── Pipeline snapshot ───────────────────────────────────── */

function renderPipeline() {
  const el = byId('pipeline-bars');
  if (!el) return;
  if (state.errors.projs) { el.innerHTML = panelError('the pipeline'); return; }

  const counts = CONTENT_STAGES.map((s) => ({
    ...s,
    n: state.projs.filter((p) => p.status === s.key).length,
  }));
  const max = Math.max(1, ...counts.map((c) => c.n));

  el.innerHTML = counts.map((c) => `
    <div class="bar-row">
      <span class="bar-label">${c.label}</span>
      <span class="bar-track"><span class="bar-fill" data-svar="--w:${(c.n / max) * 100}%"></span></span>
      <span class="bar-count">${c.n}</span>
    </div>`).join('');
  applyVars(el);
}

/* ── Month mini-ledger ───────────────────────────────────── */

function renderLedgerMini() {
  const el = byId('ledger-mini');
  if (!el) return;
  if (state.errors.txns) { el.innerHTML = panelError('this month'); return; }

  const month = todayKey().slice(0, 7);
  const inMonth = state.txns.filter((t) => String(t.occurred_at).startsWith(month));
  const income = inMonth.filter((t) => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const costs = inMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const net = income - costs;
  const max = Math.max(1, income, costs);

  // V1: monochrome ledger hierarchy — Income is the brightest element (the white
  // accent), Expenses recede to a dim gray. Net stays bright when positive, dims
  // when negative (no red — the danger reads through recession, not hue).
  el.innerHTML = `
    <div class="bar-row">
      <span class="bar-label">Income</span>
      <span class="bar-track"><span class="bar-fill is-income" data-svar="--w:${(income / max) * 100}%"></span></span>
      <span class="bar-count">${money(income)}</span>
    </div>
    <div class="bar-row">
      <span class="bar-label">Expenses</span>
      <span class="bar-track"><span class="bar-fill is-cost" data-svar="--w:${(costs / max) * 100}%"></span></span>
      <span class="bar-count">${money(costs)}</span>
    </div>
    <div class="net-line">
      <span class="label">Net</span>
      <span class="value ${net >= 0 ? '' : 'tone-dim'}">${money(net)}</span>
    </div>`;
  applyVars(el);
}

/* ── Up next ─────────────────────────────────────────────── */

function rowHtml({ tone, title, meta, right, href }) {
  return `
    <a class="row-item" data-link href="${href}">
      <span class="dot tone-${tone}"></span>
      <span class="row-body">
        <span class="row-title">${title}</span>
        <span class="row-meta">${meta}</span>
      </span>
      <span class="row-right">${right}</span>
    </a>`;
}

function renderUpNext() {
  const el = byId('upnext-list');
  if (!el) return;
  if (state.errors.projs) { el.innerHTML = panelError('the calendar'); return; }

  const today = todayKey();
  const upcoming = state.projs
    .filter((p) => p.status !== 'published' && p.scheduled_at && dayKey(p.scheduled_at) >= today)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 6);

  el.innerHTML = upcoming.length
    ? upcoming.map((p) => {
        const rel = relDay(p.scheduled_at);
        return rowHtml({
          tone: stageTone(p.status),
          href: '/calendar',
          title: esc(p.title),
          meta: `${PLATFORM_BY_KEY[p.platform]?.label ?? p.platform} · ${STAGE_BY_KEY[p.status]?.label.toLowerCase()}`,
          right: `${rel.label} · ${fmtTime(p.scheduled_at)}`,
        });
      }).join('')
    : `<div class="empty">
         <p class="empty-title">Nothing scheduled.</p>
         <p class="empty-sub">Give your next piece a date and it shows up here.</p>
       </div>`;
}
