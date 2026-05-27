import { db, getCurrentUser } from '../supabase.js';
import { showToast } from '../toast.js';

// ── Constants ────────────────────────────────────────────────
const REVENUE_GOAL = 10000;
const ACTIVITY_LIMIT = 10;
const DEADLINE_DAYS_AHEAD = 14;
const COUNTUP_DURATION = 1200;

// ── Cleanup tracking ─────────────────────────────────────────
let animationFrames = [];

export async function init() {
  // Auth guard — require a logged-in user
  const user = await getCurrentUser();
  if (!user) return;

  await Promise.all([
    loadRevenueMetrics(),
    loadActionItems(),
    loadPipelineSnapshot(),
    loadRecentDeals(),
    loadRecentActivity(),
    loadPlatformDistribution(),
    loadUpcomingDeadlines(),
    loadActiveDealsMetric()
  ]);

  startCountUpAnimations();

  // Return cleanup function
  return () => {
    animationFrames.forEach(id => cancelAnimationFrame(id));
    animationFrames = [];
  };
}

// ── Revenue Metrics with Monthly Comparison & Sparkline ──────
async function loadRevenueMetrics() {
  const now = new Date();
  const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const curMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  // Sparkline: last 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [curRes, prevRes, sparkRes] = await Promise.all([
      db.from('transactions').select('amount, type').gte('date', curMonthStart).lte('date', curMonthEnd),
      db.from('transactions').select('amount, type').gte('date', prevMonthStart).lte('date', prevMonthEnd),
      db.from('transactions').select('amount, type, date').gte('date', thirtyDaysAgo).order('date', { ascending: true })
    ]);

    const curTx = curRes.data || [];
    const prevTx = prevRes.data || [];
    const sparkTx = sparkRes.data || [];

    const curIncome = sumByType(curTx, 'income');
    const curExpenses = sumByType(curTx, 'expense');
    const curNet = curIncome - curExpenses;

    const prevIncome = sumByType(prevTx, 'income');
    const prevExpenses = sumByType(prevTx, 'expense');
    const prevNet = prevIncome - prevExpenses;

    setMetric('metric-revenue', curIncome, 'positive');
    setMetric('metric-expenses', curExpenses);
    setMetric('metric-net', curNet, curNet >= 0 ? 'positive' : 'negative');

    setMonthlyChange('metric-revenue-change', curIncome, prevIncome);
    setMonthlyChange('metric-expenses-change', curExpenses, prevExpenses, true);
    setMonthlyChange('metric-net-change', curNet, prevNet);

    // Revenue goal progress
    const goalPct = Math.min((curIncome / REVENUE_GOAL) * 100, 100);
    const goalFill = document.getElementById('revenue-goal-fill');
    const goalPctLabel = document.getElementById('revenue-goal-pct');
    if (goalFill) goalFill.style.width = goalPct + '%';
    if (goalPctLabel) goalPctLabel.textContent = Math.round(goalPct) + '% of ' + formatCurrency(REVENUE_GOAL);

    // Sparkline
    renderSparkline('sparkline-revenue', sparkTx);
  } catch {
    setMetric('metric-revenue', 0);
    setMetric('metric-expenses', 0);
    setMetric('metric-net', 0);
    showToast('Failed to load revenue metrics', 'error');
  }
}

// ── Active Deals Metric ──────────────────────────────────────
async function loadActiveDealsMetric() {
  try {
    const now = new Date();
    const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [curRes, prevRes] = await Promise.all([
      db.from('brand_deals').select('id').in('status', ['lead', 'negotiating', 'signed', 'in_progress']),
      db.from('brand_deals').select('id, created_at').in('status', ['lead', 'negotiating', 'signed', 'in_progress', 'completed', 'lost'])
    ]);

    const curCount = (curRes.data || []).length;

    // Previous month: approximate by filtering deals that existed before this month
    const prevDeals = (prevRes.data || []).filter(d => {
      const created = new Date(d.created_at);
      return created < new Date(curMonthStart);
    });

    setMetric('metric-deals', curCount);
    setMonthlyChange('metric-deals-change', curCount, prevDeals.length);
  } catch {
    setMetric('metric-deals', 0);
    showToast('Failed to load deals metric', 'error');
  }
}

// ── Action Items ─────────────────────────────────────────────
async function loadActionItems() {
  const container = document.getElementById('action-items');
  if (!container) return;

  try {
    const { data: projects } = await db
      .from('content_projects')
      .select('*')
      .in('status', ['idea', 'scripting', 'production'])
      .order('updated_at', { ascending: false })
      .limit(5);

    if (!projects || projects.length === 0) {
      container.innerHTML = '<li class="empty-cta"><h3>No active projects</h3><p>Your content pipeline is waiting. Create your first project to get moving.</p><button class="btn btn-primary" data-route="/content">Go to Content Engine</button></li>';
      return;
    }

    container.innerHTML = projects.map(p => `
      <li class="action-item">
        <span class="action-badge badge-${escapeHtml(p.status)}">${escapeHtml(p.status)}</span>
        <div class="action-detail">
          <strong>${escapeHtml(p.title)}</strong>
          <span class="action-meta">${escapeHtml(p.platform) || 'No platform'} &middot; Updated ${relativeTime(p.updated_at)}</span>
        </div>
      </li>
    `).join('');
  } catch {
    container.innerHTML = '<li class="empty-cta"><h3>Connection needed</h3><p>Connect Supabase to see your active projects and start tracking your pipeline.</p></li>';
    showToast('Failed to load action items', 'error');
  }
}

// ── Pipeline Snapshot ────────────────────────────────────────
async function loadPipelineSnapshot() {
  const container = document.getElementById('pipeline-bars');
  if (!container) return;

  const stages = ['idea', 'scripting', 'production', 'ready'];
  const labels = { idea: 'Ideas', scripting: 'Scripting', production: 'Production', ready: 'Ready' };

  try {
    const { data: projects } = await db
      .from('content_projects')
      .select('status');

    const counts = {};
    stages.forEach(s => counts[s] = 0);
    if (projects) {
      projects.forEach(p => {
        if (counts[p.status] !== undefined) counts[p.status]++;
      });
    }

    const max = Math.max(...Object.values(counts), 1);

    container.innerHTML = stages.map(s => `
      <div class="pipeline-row">
        <span class="pipeline-label">${labels[s]}</span>
        <div class="pipeline-track">
          <div class="pipeline-fill" style="width: ${(counts[s] / max) * 100}%" data-count="${counts[s]}"></div>
        </div>
        <span class="pipeline-count">${counts[s]}</span>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p class="empty-state">No pipeline data yet.</p>';
    showToast('Failed to load pipeline snapshot', 'error');
  }
}

// ── Recent Deals ─────────────────────────────────────────────
async function loadRecentDeals() {
  const container = document.getElementById('recent-deals');
  if (!container) return;

  try {
    const { data: deals } = await db
      .from('brand_deals')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(4);

    if (!deals || deals.length === 0) {
      container.innerHTML = '<li class="empty-state">No brand deals yet.</li>';
      return;
    }

    container.innerHTML = deals.map(d => `
      <li class="deal-item">
        <div class="deal-brand">${escapeHtml(d.brand_name)}</div>
        <span class="deal-badge badge-${escapeHtml(d.status)}">${escapeHtml(d.status)}</span>
        <div class="deal-value">${d.value ? formatCurrency(d.value) : '—'}</div>
      </li>
    `).join('');
  } catch {
    container.innerHTML = '<li class="empty-state">Connect Supabase to see deals.</li>';
    showToast('Failed to load recent deals', 'error');
  }
}

// ── Platform Distribution ────────────────────────────────────
async function loadPlatformDistribution() {
  const container = document.getElementById('platform-distribution');
  if (!container) return;

  const platformColors = {
    youtube: 'yt',
    tiktok: 'tiktok',
    instagram: 'ig',
    twitter: 'twitter',
    podcast: 'podcast',
    blog: 'blog'
  };

  try {
    const { data: projects } = await db
      .from('content_projects')
      .select('platform');

    if (!projects || projects.length === 0) {
      container.innerHTML = '<p class="empty-state">No content yet.</p>';
      return;
    }

    // Count by platform
    const counts = {};
    projects.forEach(p => {
      const plat = (p.platform || 'other').toLowerCase();
      counts[plat] = (counts[plat] || 0) + 1;
    });

    // Sort by count descending
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = Math.max(sorted[0]?.[1] || 1, 1);

    container.innerHTML = sorted.map(([platform, count]) => {
      const colorClass = platformColors[platform] || 'other';
      return `
        <div class="platform-row">
          <span class="platform-name">${escapeHtml(platform)}</span>
          <div class="platform-bar-track">
            <div class="platform-bar-fill ${colorClass}" style="width: ${(count / max) * 100}%"></div>
          </div>
          <span class="platform-count">${count}</span>
        </div>
      `;
    }).join('');
  } catch {
    container.innerHTML = '<p class="empty-state">No platform data yet.</p>';
    showToast('Failed to load platform distribution', 'error');
  }
}

// ── Upcoming Deadlines ───────────────────────────────────────
async function loadUpcomingDeadlines() {
  const container = document.getElementById('upcoming-deadlines');
  if (!container) return;

  try {
    const now = new Date();
    const futureDate = new Date(now.getTime() + DEADLINE_DAYS_AHEAD * 24 * 60 * 60 * 1000);

    const { data: deals } = await db
      .from('brand_deals')
      .select('brand_name, deadline, status, value')
      .not('deadline', 'is', null)
      .gte('deadline', now.toISOString().split('T')[0])
      .lte('deadline', futureDate.toISOString().split('T')[0])
      .in('status', ['signed', 'in_progress', 'negotiating'])
      .order('deadline', { ascending: true })
      .limit(5);

    if (!deals || deals.length === 0) {
      container.innerHTML = '<p class="empty-state">No upcoming deadlines.</p>';
      return;
    }

    container.innerHTML = deals.map(d => {
      const daysLeft = daysUntil(d.deadline);
      const urgencyClass = daysLeft <= 3 ? 'urgent' : daysLeft <= 7 ? 'soon' : 'normal';
      const daysLabel = daysLeft === 0 ? 'Today' : daysLeft === 1 ? '1 day' : daysLeft + ' days';

      return `
        <div class="deadline-item">
          <div class="deadline-urgency ${urgencyClass}"></div>
          <div class="deadline-info">
            <div class="deadline-brand">${escapeHtml(d.brand_name)}</div>
            <div class="deadline-meta">${escapeHtml(d.status)} ${d.value ? '&middot; ' + formatCurrency(d.value) : ''}</div>
          </div>
          <span class="deadline-days ${urgencyClass}">${daysLabel}</span>
        </div>
      `;
    }).join('');
  } catch {
    container.innerHTML = '<p class="empty-state">Could not load deadlines.</p>';
    showToast('Failed to load upcoming deadlines', 'error');
  }
}

// ── Recent Activity Feed ─────────────────────────────────────
async function loadRecentActivity() {
  const container = document.getElementById('activity-feed');
  if (!container) return;

  try {
    const [contentRes, dealsRes, txRes] = await Promise.all([
      db.from('content_projects').select('title, status, updated_at, created_at').order('updated_at', { ascending: false }).limit(ACTIVITY_LIMIT),
      db.from('brand_deals').select('brand_name, status, updated_at, created_at').order('updated_at', { ascending: false }).limit(ACTIVITY_LIMIT),
      db.from('transactions').select('description, type, amount, updated_at, created_at').order('updated_at', { ascending: false }).limit(ACTIVITY_LIMIT)
    ]);

    const items = [];

    (contentRes.data || []).forEach(p => {
      const isNew = isRecentlyCreated(p.created_at, p.updated_at);
      items.push({
        type: 'content',
        text: isNew
          ? `New project created: <strong>${escapeHtml(p.title)}</strong>`
          : `Project <strong>${escapeHtml(p.title)}</strong> moved to <strong>${escapeHtml(p.status)}</strong>`,
        time: p.updated_at
      });
    });

    (dealsRes.data || []).forEach(d => {
      const isNew = isRecentlyCreated(d.created_at, d.updated_at);
      items.push({
        type: 'deal',
        text: isNew
          ? `New deal added: <strong>${escapeHtml(d.brand_name)}</strong>`
          : `Deal <strong>${escapeHtml(d.brand_name)}</strong> status: <strong>${escapeHtml(d.status)}</strong>`,
        time: d.updated_at
      });
    });

    (txRes.data || []).forEach(t => {
      const desc = t.description || (t.type === 'income' ? 'Income' : 'Expense');
      items.push({
        type: 'transaction',
        text: `${t.type === 'income' ? 'Income' : 'Expense'} logged: <strong>${escapeHtml(desc)}</strong> (${formatCurrency(t.amount)})`,
        time: t.updated_at
      });
    });

    // Sort by time descending, take top N
    items.sort((a, b) => new Date(b.time) - new Date(a.time));
    const top = items.slice(0, ACTIVITY_LIMIT);

    if (top.length === 0) {
      container.innerHTML = '<li class="empty-state">No recent activity.</li>';
      return;
    }

    container.innerHTML = top.map(item => `
      <li class="activity-item">
        <div class="activity-icon type-${item.type}">
          ${activityIcon(item.type)}
        </div>
        <div class="activity-detail">
          <div class="activity-text">${item.text}</div>
          <div class="activity-time">${relativeTime(item.time)}</div>
        </div>
      </li>
    `).join('');
  } catch {
    container.innerHTML = '<li class="empty-state">Could not load activity.</li>';
    showToast('Failed to load recent activity', 'error');
  }
}

// ── SVG Sparkline ────────────────────────────────────────────
function renderSparkline(containerId, transactions) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Aggregate daily income over last 30 days
  const now = new Date();
  const dailyMap = {};

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    dailyMap[key] = 0;
  }

  transactions.forEach(t => {
    if (t.type === 'income') {
      const key = t.date?.split('T')[0] || t.date;
      if (dailyMap[key] !== undefined) {
        dailyMap[key] += Number(t.amount) || 0;
      }
    }
  });

  const values = Object.values(dailyMap);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const width = 200;
  const height = 40;
  const padding = 2;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Create gradient fill area
  const firstX = padding;
  const lastX = ((values.length - 1) / (values.length - 1)) * (width - padding * 2) + padding;
  const areaPoints = `${firstX},${height} ${points.join(' ')} ${lastX.toFixed(1)},${height}`;

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--color-success)" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="var(--color-success)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${areaPoints}" fill="url(#sparkGrad)"/>
      <polyline points="${points.join(' ')}" fill="none" stroke="var(--color-success)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

// ── Monthly Change Badge ─────────────────────────────────────
function setMonthlyChange(elementId, current, previous, invertColors) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (previous === 0 && current === 0) {
    el.textContent = '--';
    el.className = 'metric-change neutral';
    return;
  }

  let pct;
  if (previous === 0) {
    pct = current > 0 ? 100 : -100;
  } else {
    pct = ((current - previous) / Math.abs(previous)) * 100;
  }

  const isUp = pct >= 0;
  const arrow = isUp ? '↑' : '↓';
  const displayPct = Math.abs(Math.round(pct));

  let colorClass;
  if (invertColors) {
    // For expenses, going up is bad
    colorClass = isUp ? 'down' : 'up';
  } else {
    colorClass = isUp ? 'up' : 'down';
  }

  if (displayPct === 0) colorClass = 'neutral';

  el.textContent = `${arrow} ${displayPct}%`;
  el.className = `metric-change ${colorClass}`;
}

// ── Set Metric Value (for count-up) ──────────────────────────
function setMetric(id, value, colorClass) {
  const el = document.getElementById(id);
  if (!el) return;

  el.setAttribute('data-target', value);
  el.setAttribute('data-format', id === 'metric-deals' ? 'number' : 'currency');

  if (colorClass) {
    el.classList.remove('positive', 'negative');
    el.classList.add(colorClass);
  }

  // Initial display
  if (id === 'metric-deals') {
    el.textContent = '0';
  } else {
    el.textContent = formatCurrency(0);
  }
}

// ── Count-Up Animations ──────────────────────────────────────
function startCountUpAnimations() {
  document.querySelectorAll('[data-target]').forEach(el => {
    const target = parseFloat(el.getAttribute('data-target')) || 0;
    const format = el.getAttribute('data-format') || 'currency';
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / COUNTUP_DURATION, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      if (format === 'number') {
        el.textContent = Math.round(current).toString();
      } else {
        el.textContent = formatCurrency(current);
      }

      if (progress < 1) {
        const id = requestAnimationFrame(tick);
        animationFrames.push(id);
      }
    }

    const id = requestAnimationFrame(tick);
    animationFrames.push(id);
  });
}

// ── Activity Icons ───────────────────────────────────────────
function activityIcon(type) {
  switch (type) {
    case 'content':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
        <rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
      </svg>`;
    case 'deal':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/>
        <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
      </svg>`;
    case 'transaction':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
      </svg>`;
    default:
      return '';
  }
}

// ── Helpers ──────────────────────────────────────────────────

function sumByType(transactions, type) {
  return transactions
    .filter(t => t.type === type)
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(n);
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return 'just now';

  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;

  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;

  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  }

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target - now) / (24 * 60 * 60 * 1000)));
}

function isRecentlyCreated(createdAt, updatedAt) {
  if (!createdAt || !updatedAt) return false;
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  // If created and updated are within 2 seconds, treat as "new"
  return Math.abs(updated - created) < 2000;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
