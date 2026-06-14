/* Analytics — the business review.
   Revenue vs costs by month, income by category, content output,
   deal win rate, and this-month progress against targets. */

import { transactions, projects, deals, getPrefs, savePrefs } from '../store.js';
import {
  esc, money, todayKey, formData, bindDialog,
  statMoney, statInt, runCountUps, sparkline,
} from '../ui.js';
import { CATEGORY_BY_KEY, DEAL_STATUS_BY_KEY } from '../domain.js';
import { toast } from '../toast.js';

let txns = [];
let projs = [];
let dls = [];
let prefs = {};
let range = 6;

export async function init() {
  [txns, projs, dls, prefs] = await Promise.all([
    transactions.list(), projects.list(), deals.list(), getPrefs(),
  ]);

  bindDialog(document.getElementById('goals-modal'));
  document.querySelectorAll('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      range = Number(btn.dataset.range);
      syncRange();
      renderAll();
    });
  });
  document.getElementById('goals-edit-btn').addEventListener('click', openGoals);
  document.getElementById('goals-form').addEventListener('submit', onGoalsSave);
  document.getElementById('ana-goals').addEventListener('click', (e) => {
    if (e.target.closest('[data-set-targets]')) openGoals();
  });

  syncRange();
  renderAll();
}

/* ── Helpers ─────────────────────────────────────────────── */

function syncRange() {
  document.querySelectorAll('[data-range]').forEach((btn) => {
    btn.classList.toggle('is-active', Number(btn.dataset.range) === range);
  });
}

function monthsBack(n) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      year: d.getFullYear(),
    });
  }
  return out;
}

const monthSum = (key, type) => txns
  .filter((t) => t.type === type && String(t.occurred_at).startsWith(key))
  .reduce((s, t) => s + Number(t.amount), 0);

const inRange = (months) => {
  const keys = new Set(months.map((m) => m.key));
  return txns.filter((t) => keys.has(String(t.occurred_at).slice(0, 7)));
};

function renderAll() {
  const months = monthsBack(range);
  renderStats(months);
  renderAudience();
  renderChart(months);
  renderFunnel();
  renderCats(months);
  renderGoals();
  renderOutput(months);
}

/* ── Audience ────────────────────────────────────────────────
   Followers over time, captured by the creator in Business
   settings. Hidden until at least one reading exists. */

const nf = new Intl.NumberFormat('en-GB');

const sortedHistory = () =>
  (Array.isArray(prefs.follower_history) ? prefs.follower_history : [])
    .filter((h) => h && Number.isFinite(Number(h.count)))
    .map((h) => ({ month: String(h.month), count: Number(h.count) }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));

function renderAudience() {
  const panel = document.getElementById('ana-audience');
  if (!panel) return;
  const hist = sortedHistory();
  if (!hist.length) { panel.hidden = true; return; }
  panel.hidden = false;

  const counts = hist.map((h) => h.count);
  const current = counts[counts.length - 1];
  const prev = counts.length > 1 ? counts[counts.length - 2] : null;
  const delta = prev === null ? null : current - prev;
  const pct = prev ? (delta / prev) * 100 : null;

  const numEl = document.getElementById('aud-num');
  numEl.innerHTML = statInt(current);

  let deltaHtml;
  if (delta === null) {
    deltaHtml = '<span class="aud-delta">First reading</span>';
  } else {
    const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '→';
    const pctText = pct === null ? '' : ` · ${Math.abs(pct).toFixed(1)}%`;
    deltaHtml = `<span class="aud-delta ${dir}">${arrow} ${nf.format(Math.abs(delta))}${pctText}</span>`
      + '<span class="aud-foot-label">vs last month</span>';
  }
  document.getElementById('aud-delta').innerHTML = deltaHtml;
  document.getElementById('aud-spark').innerHTML = sparkline(counts, { width: 260, height: 64 });
  runCountUps(numEl);
}

/* Replace this month's reading (or append it) and keep the series
   trimmed and ordered. */
function upsertFollowerCount(history, count) {
  const month = todayKey().slice(0, 7);
  const list = (Array.isArray(history) ? history : []).filter((h) => h && h.month !== month);
  list.push({ month, count: Math.round(count) });
  return list.sort((a, b) => (a.month < b.month ? -1 : 1)).slice(-24);
}

/* ── Deal conversion funnel ──────────────────────────────── */

const FUNNEL_STAGES = ['lead', 'negotiating', 'signed', 'delivered', 'paid'];

function renderFunnel() {
  const active = dls.filter((d) => d.status !== 'lost');
  const lost = dls.length - active.length;
  const reached = FUNNEL_STAGES.map((_, i) =>
    active.filter((d) => FUNNEL_STAGES.indexOf(d.status) >= i).length);
  const top = Math.max(1, reached[0]);

  document.getElementById('ana-funnel-count').textContent =
    dls.length ? `${active.length} active${lost ? ` · ${lost} lost` : ''}` : '';

  const el = document.getElementById('ana-funnel');
  if (!dls.length) {
    el.innerHTML = `<div class="empty">
      <p class="empty-title">No deals yet.</p>
      <p class="empty-sub">Track sponsorships in Deals &amp; Ledger.</p></div>`;
    return;
  }

  el.innerHTML = FUNNEL_STAGES.map((stage, i) => {
    const n = reached[i];
    const pct = Math.round((n / top) * 100);
    return `
      <div class="funnel-row">
        <span class="funnel-label">${DEAL_STATUS_BY_KEY[stage].label}</span>
        <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${Math.max(3, (n / top) * 100)}%"></div></div>
        <span class="funnel-num">${n} · ${pct}%</span>
      </div>`;
  }).join('');
}

/* ── Stat band ───────────────────────────────────────────── */

function renderStats(months) {
  const rows = inRange(months);
  const income = rows.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const costs = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const net = income - costs;
  const avg = income / months.length;

  // Per-month series feed the trend lines under the headline figures.
  const incomeSeries = months.map((m) => monthSum(m.key, 'income'));
  const netSeries = months.map((m) => monthSum(m.key, 'income') - monthSum(m.key, 'expense'));

  const paid = dls.filter((d) => d.status === 'paid').length;
  const lost = dls.filter((d) => d.status === 'lost').length;
  const closed = paid + lost;
  const winRate = closed ? Math.round((paid / closed) * 100) : null;

  const el = document.getElementById('ana-stats');
  el.innerHTML = `
    <div class="stat">
      <div class="stat-label">Revenue · ${range}M</div>
      <div class="stat-num">${statMoney(income)}</div>
      <div class="stat-foot">${money(costs)} in costs</div>
      <div class="stat-spark">${sparkline(incomeSeries)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Net profit · ${range}M</div>
      <div class="stat-num ${net >= 0 ? 'is-pos' : 'is-neg'}">${statMoney(net)}</div>
      <div class="stat-foot">${income > 0 ? Math.round((net / income) * 100) + '% margin' : 'no income yet'}</div>
      <div class="stat-spark">${sparkline(netSeries)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Avg per month</div>
      <div class="stat-num">${statMoney(avg)}</div>
      <div class="stat-foot">income across ${range} months</div>
    </div>
    <div class="stat">
      <div class="stat-label">Deal win rate</div>
      <div class="stat-num">${winRate === null ? '—' : `${statInt(winRate)}<span class="stat-unit">%</span>`}</div>
      <div class="stat-foot">${closed ? `${paid} won · ${lost} lost` : 'no closed deals yet'}</div>
    </div>`;
  runCountUps(el);
}

/* ── Monthly chart ───────────────────────────────────────── */

function renderChart(months) {
  const data = months.map((m) => ({
    ...m,
    income: monthSum(m.key, 'income'),
    costs: monthSum(m.key, 'expense'),
  }));
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.costs]));

  document.getElementById('ana-chart').innerHTML = data.map((d) => `
    <div class="chart-col" title="${d.label} ${d.year} — in ${money(d.income)} · out ${money(d.costs)}">
      <div class="chart-bars">
        <span class="cbar cbar-in" style="height:${(d.income / max) * 100}%"></span>
        <span class="cbar cbar-out" style="height:${(d.costs / max) * 100}%"></span>
      </div>
      <span class="chart-label">${d.label}</span>
    </div>`).join('');
}

/* ── Income by category ──────────────────────────────────── */

function renderCats(months) {
  const rows = inRange(months).filter((t) => t.type === 'income');
  const byCat = new Map();
  for (const t of rows) {
    byCat.set(t.category, (byCat.get(t.category) || 0) + Number(t.amount));
  }
  const total = [...byCat.values()].reduce((s, v) => s + v, 0);
  const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  document.getElementById('ana-cats-count').textContent =
    total ? money(total) : '';

  document.getElementById('ana-cats').innerHTML = sorted.length
    ? sorted.map(([cat, sum]) => `
        <div class="bar-row">
          <span class="bar-label">${esc(CATEGORY_BY_KEY[cat]?.label ?? cat)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(sum / total) * 100}%"></span></span>
          <span class="bar-count">${money(sum)} · ${Math.round((sum / total) * 100)}%</span>
        </div>`).join('')
    : `<div class="empty">
         <p class="empty-title">No income in this range.</p>
         <p class="empty-sub">Log payments in the ledger and the mix shows up here.</p>
       </div>`;
}

/* ── Goals ───────────────────────────────────────────────── */

const RING_C = 2 * Math.PI * 34; // circle radius 34

function ringHtml(label, value, target, fmt) {
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;
  const off = RING_C * (1 - Math.min(1, pct / 100));
  return `
    <div class="ring-card">
      <div class="ring">
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <circle class="ring-bg" cx="40" cy="40" r="34"></circle>
          <circle class="ring-fill ${pct >= 100 ? 'is-done' : ''}" cx="40" cy="40" r="34"
                  style="stroke-dasharray:${RING_C.toFixed(1)};stroke-dashoffset:${off.toFixed(1)}"></circle>
        </svg>
        <div class="ring-center"><span class="ring-pct">${pct}%</span></div>
      </div>
      <div class="ring-label">${label}</div>
      <div class="ring-val">${fmt(value)} / ${fmt(target)}</div>
    </div>`;
}

function renderGoals() {
  const monthKey = todayKey().slice(0, 7);
  const incomeThisMonth = monthSum(monthKey, 'income');
  const publishedThisMonth = projs.filter((p) =>
    p.published_at && String(p.published_at).slice(0, 7) === monthKey).length;

  const el = document.getElementById('ana-goals');
  const hasTargets = prefs.goal_monthly_revenue > 0 || prefs.goal_monthly_posts > 0;

  if (!hasTargets) {
    el.innerHTML = `<div class="empty">
         <p class="empty-title">No targets set.</p>
         <p class="empty-sub">Give the month a number to beat.</p>
         <button class="btn btn-primary" data-set-targets type="button">Set targets</button>
       </div>`;
    return;
  }

  const rings = [
    prefs.goal_monthly_revenue > 0
      ? ringHtml('Revenue', incomeThisMonth, Number(prefs.goal_monthly_revenue), (v) => money(v))
      : '',
    prefs.goal_monthly_posts > 0
      ? ringHtml('Posts', publishedThisMonth, Number(prefs.goal_monthly_posts), (v) => String(Math.round(v)))
      : '',
  ].join('');

  el.innerHTML =
    `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
       <linearGradient id="ringbrass" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="#e9cb98"></stop>
         <stop offset="1" stop-color="#a8895d"></stop>
       </linearGradient>
     </defs></svg>
     <div class="rings">${rings}</div>`;
}

function openGoals() {
  const form = document.getElementById('goals-form');
  form.business_name.value = prefs.business_name || '';
  form.invoice_details.value = prefs.invoice_details || '';
  form.goal_monthly_revenue.value = prefs.goal_monthly_revenue ?? '';
  form.goal_monthly_posts.value = prefs.goal_monthly_posts ?? '';
  const hist = sortedHistory();
  form.followers.value = hist.length ? hist[hist.length - 1].count : '';
  document.getElementById('goals-modal').showModal();
}

async function onGoalsSave(e) {
  e.preventDefault();
  const raw = formData(e.currentTarget);
  const patch = {
    business_name: raw.business_name || '',
    invoice_details: raw.invoice_details || '',
    goal_monthly_revenue: raw.goal_monthly_revenue === '' ? null : Number(raw.goal_monthly_revenue),
    goal_monthly_posts: raw.goal_monthly_posts === '' ? null : Math.round(Number(raw.goal_monthly_posts)),
  };
  if (raw.followers !== '' && Number.isFinite(Number(raw.followers))) {
    patch.follower_history = upsertFollowerCount(prefs.follower_history, Number(raw.followers));
  }
  try {
    prefs = await savePrefs(patch);
    document.getElementById('goals-modal').close();
    renderGoals();
    renderAudience();
    toast('Settings saved.', 'success');
  } catch (err) {
    console.error(err);
    toast('Could not save settings.', 'error');
  }
}

/* ── Content output ──────────────────────────────────────── */

function renderOutput(months) {
  const counts = months.map((m) => ({
    ...m,
    n: projs.filter((p) => p.published_at && String(p.published_at).slice(0, 7) === m.key).length,
  }));
  const total = counts.reduce((s, c) => s + c.n, 0);
  const max = Math.max(1, ...counts.map((c) => c.n));

  document.getElementById('ana-output-count').textContent =
    total ? `${total} published` : '';

  document.getElementById('ana-output').innerHTML = counts.map((c) => `
    <div class="chart-col" title="${c.label} ${c.year} — ${c.n} published">
      <div class="chart-bars">
        <span class="cbar cbar-posts" style="height:${(c.n / max) * 100}%"></span>
      </div>
      <span class="chart-label">${c.label}</span>
    </div>`).join('');
}
