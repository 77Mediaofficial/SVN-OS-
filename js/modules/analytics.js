import { db, getCurrentUser } from '../supabase.js';
import { showToast } from '../toast.js';

let currentRange = 6;
let cachedData = null;

export async function init() {
  const user = await getCurrentUser();
  if (!user) return;

  bindRange();
  await loadAll();

  return cleanup;
}

function bindRange() {
  const bar = document.getElementById('an-range');
  if (!bar) return;
  bar.addEventListener('click', async (e) => {
    const btn = e.target.closest('.an-range-btn');
    if (!btn) return;
    const range = parseInt(btn.dataset.range, 10);
    if (!range || range === currentRange) return;
    bar.querySelectorAll('.an-range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRange = range;
    await loadAll();
  });
}

async function loadAll() {
  const since = monthsAgo(currentRange);
  try {
    const [txRes, dealRes, contentRes] = await Promise.all([
      db.from('transactions')
        .select('id, type, category, amount, date, deal_id, brand_deals(brand_name)')
        .gte('date', since.toISOString().slice(0, 10))
        .order('date', { ascending: true }),
      db.from('brand_deals').select('id, brand_name, value, status, created_at'),
      db.from('content_projects')
        .select('id, status, platform, published_at, created_at')
        .order('updated_at', { ascending: false }),
    ]);

    if (txRes.error) throw txRes.error;
    if (dealRes.error) throw dealRes.error;
    if (contentRes.error) throw contentRes.error;

    cachedData = {
      transactions: txRes.data || [],
      deals: dealRes.data || [],
      content: contentRes.data || [],
    };
  } catch (err) {
    showToast(err.message || 'Failed to load analytics', 'error');
    cachedData = { transactions: [], deals: [], content: [] };
  }

  renderKpis();
  renderRevenueChart();
  renderExpenseBreakdown();
  renderTopBrands();
  renderContentVelocity();
}

function renderKpis() {
  const tx = cachedData.transactions;
  const income = sum(tx.filter(t => t.type === 'income').map(t => Number(t.amount) || 0));
  const expenses = sum(tx.filter(t => t.type === 'expense').map(t => Number(t.amount) || 0));
  const net = income - expenses;

  const since = monthsAgo(currentRange);
  const postedCount = cachedData.content.filter(c =>
    c.status === 'posted' && c.published_at && new Date(c.published_at) >= since
  ).length;

  setText('an-kpi-income', formatCurrency(income));
  setText('an-kpi-expenses', formatCurrency(expenses));

  const netEl = document.getElementById('an-kpi-net');
  if (netEl) {
    netEl.textContent = formatCurrency(net);
    netEl.classList.remove('positive', 'negative');
    if (net > 0) netEl.classList.add('positive');
    else if (net < 0) netEl.classList.add('negative');
  }

  setText('an-kpi-posted', String(postedCount));

  setText('an-kpi-income-sub', `Last ${currentRange} months`);
  setText('an-kpi-expenses-sub', `Last ${currentRange} months`);
  setText('an-kpi-net-sub', net >= 0 ? 'Profitable period' : 'Loss period');
  setText('an-kpi-posted-sub', `Across ${currentRange} months`);
}

function renderRevenueChart() {
  const wrap = document.getElementById('an-revenue-chart');
  if (!wrap) return;

  const buckets = buildMonthlyBuckets(currentRange);
  cachedData.transactions.forEach(t => {
    const key = monthKey(new Date(t.date));
    const b = buckets.find(b => b.key === key);
    if (!b) return;
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') b.income += amt;
    else if (t.type === 'expense') b.expenses += amt;
  });

  buckets.forEach(b => { b.net = b.income - b.expenses; });

  const hasAnyData = buckets.some(b => b.income || b.expenses);
  if (!hasAnyData) {
    wrap.innerHTML = '<div class="an-chart-empty">No transactions in this range</div>';
    return;
  }

  const W = 600;
  const H = 220;
  const padL = 40;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxVal = Math.max(
    1,
    ...buckets.map(b => Math.max(b.income, b.expenses, Math.abs(b.net)))
  );

  const xFor = (i) => padL + (buckets.length === 1 ? innerW / 2 : (i / (buckets.length - 1)) * innerW);
  const yFor = (val) => padT + innerH - (val / maxVal) * innerH;

  const linePath = (key) => buckets.map((b, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(b[key]).toFixed(1)}`).join(' ');

  const gridLines = [0.25, 0.5, 0.75, 1].map(frac => {
    const y = padT + innerH - frac * innerH;
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
  }).join('');

  const yLabels = [0.25, 0.5, 0.75, 1].map(frac => {
    const y = padT + innerH - frac * innerH;
    const val = maxVal * frac;
    return `<text x="${padL - 8}" y="${y + 3}" text-anchor="end" fill="var(--color-text-muted)" font-size="9" font-family="var(--font-mono)">${shortNum(val)}</text>`;
  }).join('');

  const xLabels = buckets.map((b, i) => {
    if (currentRange > 6 && i % 2 !== 0) return '';
    return `<text x="${xFor(i)}" y="${H - 8}" text-anchor="middle" fill="var(--color-text-muted)" font-size="9">${b.label}</text>`;
  }).join('');

  const dots = (key, color) => buckets.map((b, i) =>
    `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(b[key]).toFixed(1)}" r="2.5" fill="${color}"/>`
  ).join('');

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Revenue trend">
      ${gridLines}
      ${yLabels}
      ${xLabels}
      <path d="${linePath('income')}" fill="none" stroke="var(--color-success)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${linePath('expenses')}" fill="none" stroke="var(--color-danger)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${linePath('net')}" fill="none" stroke="var(--color-text-dim)" stroke-width="1.4" stroke-dasharray="3 3" stroke-linecap="round"/>
      ${dots('income', 'var(--color-success)')}
      ${dots('expenses', 'var(--color-danger)')}
    </svg>
  `;
}

function renderExpenseBreakdown() {
  const el = document.getElementById('an-expense-breakdown');
  if (!el) return;

  const totals = {};
  cachedData.transactions.forEach(t => {
    if (t.type !== 'expense') return;
    const cat = t.category || 'other';
    totals[cat] = (totals[cat] || 0) + (Number(t.amount) || 0);
  });

  const rows = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (rows.length === 0) {
    el.innerHTML = '<div class="an-empty">No expenses in this range</div>';
    return;
  }

  const max = rows[0][1] || 1;
  el.innerHTML = rows.map(([cat, val]) => {
    const pct = Math.max(4, (val / max) * 100);
    return `
      <div class="an-bar-row">
        <span class="an-bar-label">${escapeHtml(formatCategory(cat))}</span>
        <span class="an-bar-value">${formatCurrency(val)}</span>
        <div class="an-bar-track"><div class="an-bar-fill expense" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
    `;
  }).join('');
}

function renderTopBrands() {
  const el = document.getElementById('an-top-brands');
  if (!el) return;

  const totals = {};
  cachedData.transactions.forEach(t => {
    if (t.type !== 'income' || !t.deal_id) return;
    const brand = t.brand_deals?.brand_name || 'Unknown';
    totals[brand] = (totals[brand] || 0) + (Number(t.amount) || 0);
  });

  const rows = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (rows.length === 0) {
    el.innerHTML = '<div class="an-empty">No brand-linked income yet</div>';
    return;
  }

  const max = rows[0][1] || 1;
  el.innerHTML = rows.map(([brand, val]) => {
    const pct = Math.max(4, (val / max) * 100);
    return `
      <div class="an-bar-row">
        <span class="an-bar-label">${escapeHtml(brand)}</span>
        <span class="an-bar-value">${formatCurrency(val)}</span>
        <div class="an-bar-track"><div class="an-bar-fill brand" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
    `;
  }).join('');
}

function renderContentVelocity() {
  const el = document.getElementById('an-content-velocity');
  if (!el) return;

  const buckets = buildMonthlyBuckets(currentRange);
  cachedData.content.forEach(c => {
    if (c.status !== 'posted' || !c.published_at) return;
    const key = monthKey(new Date(c.published_at));
    const b = buckets.find(b => b.key === key);
    if (b) b.count = (b.count || 0) + 1;
  });

  const max = Math.max(1, ...buckets.map(b => b.count || 0));
  const hasAny = buckets.some(b => b.count);
  if (!hasAny) {
    el.innerHTML = '<div class="an-empty">No published content in this range</div>';
    return;
  }

  el.innerHTML = buckets.map(b => {
    const pct = Math.max(4, ((b.count || 0) / max) * 100);
    return `
      <div class="an-bar-row">
        <span class="an-bar-label">${b.fullLabel}</span>
        <span class="an-bar-value">${b.count || 0}</span>
        <div class="an-bar-track"><div class="an-bar-fill content" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
    `;
  }).join('');
}

/* ── Helpers ──────────────────────────────────────────────── */

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - (n - 1));
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildMonthlyBuckets(n) {
  const now = new Date();
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: monthKey(d),
      label: MONTH_LABELS[d.getMonth()],
      fullLabel: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
      income: 0,
      expenses: 0,
      net: 0,
      count: 0,
    });
  }
  return buckets;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function shortNum(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function formatCategory(cat) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function cleanup() {
  cachedData = null;
}
