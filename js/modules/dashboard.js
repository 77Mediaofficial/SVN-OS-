import { db } from '../supabase.js';

export async function init() {
  await Promise.all([
    loadRevenueMetrics(),
    loadActionItems(),
    loadPipelineSnapshot(),
    loadRecentDeals()
  ]);

  startCountUpAnimations();
}

async function loadRevenueMetrics() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

  try {
    const { data: transactions } = await db
      .from('transactions')
      .select('amount, type')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);

    if (!transactions) return;

    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    setMetric('metric-revenue', income);
    setMetric('metric-expenses', expenses);
    setMetric('metric-net', income - expenses);
  } catch {
    setMetric('metric-revenue', 0);
    setMetric('metric-expenses', 0);
    setMetric('metric-net', 0);
  }
}

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
      container.innerHTML = '<li class="empty-state">No active projects. Start creating!</li>';
      return;
    }

    container.innerHTML = projects.map(p => `
      <li class="action-item">
        <span class="action-badge badge-${p.status}">${p.status}</span>
        <div class="action-detail">
          <strong>${escapeHtml(p.title)}</strong>
          <span class="action-meta">${p.platform || 'No platform'} · Updated ${relativeTime(p.updated_at)}</span>
        </div>
      </li>
    `).join('');
  } catch {
    container.innerHTML = '<li class="empty-state">Connect Supabase to see your projects.</li>';
  }
}

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
  }
}

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
        <span class="deal-badge badge-${d.status}">${d.status}</span>
        <div class="deal-value">${d.value ? formatCurrency(d.value) : '—'}</div>
      </li>
    `).join('');
  } catch {
    container.innerHTML = '<li class="empty-state">Connect Supabase to see deals.</li>';
  }
}

function setMetric(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.setAttribute('data-target', value);
    el.textContent = formatCurrency(0);
  }
}

function startCountUpAnimations() {
  document.querySelectorAll('[data-target]').forEach(el => {
    const target = parseFloat(el.getAttribute('data-target')) || 0;
    const duration = 1200;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = formatCurrency(target * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  });
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
