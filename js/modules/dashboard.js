/* Dashboard Home — the morning briefing.
   Immediate action items, monthly revenue, pipeline snapshot, what's next. */

import { projects, deals, transactions, getPrefs } from '../store.js';
import {
  money, esc, fmtTime, relDay, dayKey, todayKey,
  statMoney, statInt, runCountUps,
} from '../ui.js';
import {
  CONTENT_STAGES, STAGE_BY_KEY, PLATFORM_BY_KEY, DEAL_STATUS_BY_KEY,
  stageTone,
} from '../domain.js';

const OPEN_DEAL_STATUSES = new Set(['lead', 'negotiating', 'signed', 'delivered']);

export async function init() {
  renderSlate();

  const [projs, dls, txns, prefs] = await Promise.all([
    projects.list(), deals.list(), transactions.list(),
    getPrefs().catch(() => null),
  ]);

  renderStats(projs, dls, txns, prefs);
  renderActions(projs, dls);
  renderPipeline(projs);
  renderLedgerMini(txns);
  renderUpNext(projs);
}

/* ── Slate line ──────────────────────────────────────────── */

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function renderSlate() {
  const now = new Date();
  const parts = now
    .toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace(/,/g, '');
  document.getElementById('dash-slate').textContent =
    `${parts} · WEEK ${String(isoWeek(now)).padStart(2, '0')}`;
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

function renderStats(projs, dls, txns, prefs) {
  const month = todayKey().slice(0, 7);
  const inMonth = txns.filter((t) => String(t.occurred_at).startsWith(month));
  const income = inMonth.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const costs = inMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const net = income - costs;

  const open = dls.filter((d) => OPEN_DEAL_STATUSES.has(d.status));
  const pipelineValue = open.reduce((s, d) => s + Number(d.value), 0);

  const active = projs.filter((p) => p.status !== 'published');
  const inProduction = active.filter((p) => p.status === 'production').length;

  const today = todayKey();
  const horizon = dayKey(new Date(Date.now() + 7 * 86400000));
  const dueContent = projs.filter((p) =>
    p.status !== 'published' && p.scheduled_at &&
    dayKey(p.scheduled_at) >= today && dayKey(p.scheduled_at) <= horizon);
  const dueDeals = open.filter((d) =>
    d.deadline && d.deadline >= today && d.deadline <= horizon);

  const goal = Number(prefs?.goal_monthly_revenue) || 0;
  const goalFoot = goal > 0
    ? ` · ${Math.round((income / goal) * 100)}% of ${money(goal)} target`
    : '';

  const statsEl = document.getElementById('dash-stats');
  statsEl.innerHTML =
    statHtml('Revenue this month', statMoney(income),
      `net ${money(net)} after ${money(costs)} costs${goalFoot}`) +
    statHtml('Pipeline value', statMoney(pipelineValue),
      `${open.length} open deal${open.length === 1 ? '' : 's'}`) +
    statHtml('Active projects', statInt(active.length),
      `${inProduction} in production`) +
    statHtml('Due in 7 days', statInt(dueContent.length + dueDeals.length),
      `${dueContent.length} post${dueContent.length === 1 ? '' : 's'} · ${dueDeals.length} deal deadline${dueDeals.length === 1 ? '' : 's'}`);
  runCountUps(statsEl);
}

/* ── Action items ────────────────────────────────────────── */

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

function renderActions(projs, dls) {
  const today = todayKey();
  const items = [];

  for (const d of dls) {
    if (!OPEN_DEAL_STATUSES.has(d.status) || !d.deadline) continue;
    const rel = relDay(d.deadline);
    if (d.deadline < today) {
      items.push({ rank: 0, tone: 'red', href: '/deals',
        title: esc(d.brand_name),
        meta: `${DEAL_STATUS_BY_KEY[d.status].label.toLowerCase()} · deliverable overdue`,
        right: rel.label });
    } else if (rel.tone === 'warn') {
      items.push({ rank: 2, tone: 'amber', href: '/deals',
        title: esc(d.brand_name),
        meta: `${DEAL_STATUS_BY_KEY[d.status].label.toLowerCase()} · ${money(d.value)} on the line`,
        right: rel.label });
    }
  }

  for (const p of projs) {
    if (p.status === 'published' || !p.scheduled_at) continue;
    const key = dayKey(p.scheduled_at);
    if (key < today) {
      items.push({ rank: 1, tone: 'red', href: '/content',
        title: esc(p.title),
        meta: 'slipped past its slot — reschedule or publish',
        right: relDay(p.scheduled_at).label });
    } else if (key === today) {
      items.push({ rank: 2, tone: 'amber', href: '/content',
        title: esc(p.title),
        meta: `${PLATFORM_BY_KEY[p.platform]?.label ?? p.platform} · scheduled today`,
        right: fmtTime(p.scheduled_at) });
    }
  }

  items.sort((a, b) => a.rank - b.rank);
  const shown = items.slice(0, 8);

  document.getElementById('actions-count').textContent =
    items.length ? `${items.length}` : '';

  document.getElementById('actions-list').innerHTML = shown.length
    ? shown.map(rowHtml).join('')
    : `<div class="empty">
         <p class="empty-title">All clear.</p>
         <p class="empty-sub">Nothing overdue, nothing on fire. Go make something.</p>
       </div>`;
}

/* ── Pipeline snapshot ───────────────────────────────────── */

function renderPipeline(projs) {
  const counts = CONTENT_STAGES.map((s) => ({
    ...s,
    n: projs.filter((p) => p.status === s.key).length,
  }));
  const max = Math.max(1, ...counts.map((c) => c.n));

  document.getElementById('pipeline-bars').innerHTML = counts.map((c) => `
    <div class="bar-row">
      <span class="bar-label">${c.label}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(c.n / max) * 100}%"></span></span>
      <span class="bar-count">${c.n}</span>
    </div>`).join('');
}

/* ── Month mini-ledger ───────────────────────────────────── */

function renderLedgerMini(txns) {
  const month = todayKey().slice(0, 7);
  const inMonth = txns.filter((t) => String(t.occurred_at).startsWith(month));
  const income = inMonth.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const costs = inMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const net = income - costs;
  const max = Math.max(1, income, costs);

  document.getElementById('ledger-mini').innerHTML = `
    <div class="bar-row">
      <span class="bar-label">Income</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(income / max) * 100}%;background:var(--tone-green)"></span></span>
      <span class="bar-count">${money(income)}</span>
    </div>
    <div class="bar-row">
      <span class="bar-label">Expenses</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(costs / max) * 100}%;background:var(--tone-red)"></span></span>
      <span class="bar-count">${money(costs)}</span>
    </div>
    <div class="net-line">
      <span class="label">Net</span>
      <span class="value ${net >= 0 ? '' : 'tone-danger'}">${money(net)}</span>
    </div>`;
}

/* ── Up next ─────────────────────────────────────────────── */

function renderUpNext(projs) {
  const today = todayKey();
  const upcoming = projs
    .filter((p) => p.status !== 'published' && p.scheduled_at && dayKey(p.scheduled_at) >= today)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 6);

  document.getElementById('upnext-list').innerHTML = upcoming.length
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
