import { db } from '../supabase.js';
import { showToast } from '../toast.js';
import { skLine } from '../skeleton.js';

/**
 * Goals — set monthly content and income targets, track progress.
 * Targets are stored client-side in localStorage (per browser, per user
 * via the user's email key). Progress is computed from Supabase data
 * for the current calendar month.
 */

const STORAGE_PREFIX = 'svn-os-goals-';

let cleanupFns = [];

export async function init() {
  const key = await storageKey();
  const goals = loadGoals(key);

  const contentInput = document.getElementById('goal-content-target');
  const incomeInput = document.getElementById('goal-income-target');
  const expenseInput = document.getElementById('goal-expense-cap');
  const dealsInput = document.getElementById('goal-deals-target');
  const saveBtn = document.getElementById('goal-save');

  if (contentInput) contentInput.value = goals.content ?? '';
  if (incomeInput) incomeInput.value = goals.income ?? '';
  if (expenseInput) expenseInput.value = goals.expenseCap ?? '';
  if (dealsInput) dealsInput.value = goals.deals ?? '';

  function onSave() {
    const next = {
      content: numOrNull(contentInput?.value),
      income: numOrNull(incomeInput?.value),
      expenseCap: numOrNull(expenseInput?.value),
      deals: numOrNull(dealsInput?.value),
    };
    saveGoals(key, next);
    showToast('Goals saved', 'success');
    renderProgress(next, lastSnapshot);
  }
  saveBtn?.addEventListener('click', onSave);
  cleanupFns.push(() => saveBtn?.removeEventListener('click', onSave));

  // Update the month label
  const monthLabel = document.getElementById('goals-month-label');
  if (monthLabel) {
    const now = new Date();
    monthLabel.textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  paintGoalsSkeleton();
  await loadAndRenderProgress(goals);

  return cleanup;
}

function paintGoalsSkeleton() {
  const keys = ['content', 'income', 'expense', 'deals'];
  keys.forEach(k => {
    const actual = document.getElementById(`goal-actual-${k}`);
    if (actual) actual.innerHTML = skLine('80px', 24);
  });
  const net = document.getElementById('goals-net');
  if (net) net.innerHTML = skLine('72px', 18);
}

function cleanup() {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
  lastSnapshot = null;
}

function numOrNull(s) {
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? n : null;
}

async function storageKey() {
  try {
    const { data } = await db.auth.getUser();
    const id = data?.user?.id || 'anon';
    return STORAGE_PREFIX + id;
  } catch {
    return STORAGE_PREFIX + 'anon';
  }
}

function loadGoals(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { content: null, income: null, expenseCap: null, deals: null };
    const parsed = JSON.parse(raw);
    return {
      content: parsed.content ?? null,
      income: parsed.income ?? null,
      expenseCap: parsed.expenseCap ?? null,
      deals: parsed.deals ?? null,
    };
  } catch {
    return { content: null, income: null, expenseCap: null, deals: null };
  }
}

function saveGoals(key, goals) {
  try {
    localStorage.setItem(key, JSON.stringify(goals));
  } catch {
    showToast('Could not save — local storage unavailable', 'error');
  }
}

let lastSnapshot = null;

async function loadAndRenderProgress(goals) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const startIso = startOfMonth.toISOString();
  const endIso = endOfMonth.toISOString();
  const startDate = startIso.slice(0, 10);
  const endDate = endIso.slice(0, 10);

  let postedCount = 0;
  let income = 0;
  let expenses = 0;
  let dealsClosed = 0;

  try {
    const [contentRes, txnRes, dealsRes] = await Promise.all([
      db.from('content_projects')
        .select('id, status, published_at, updated_at')
        .gte('updated_at', startIso)
        .lte('updated_at', endIso),
      db.from('transactions')
        .select('amount, type, date')
        .gte('date', startDate)
        .lte('date', endDate),
      db.from('brand_deals')
        .select('id, status, updated_at')
        .gte('updated_at', startIso)
        .lte('updated_at', endIso),
    ]);

    if (contentRes.data) {
      postedCount = contentRes.data.filter(c => c.status === 'posted').length;
    }
    if (txnRes.data) {
      txnRes.data.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') income += amt;
        else if (t.type === 'expense') expenses += amt;
      });
    }
    if (dealsRes.data) {
      dealsClosed = dealsRes.data.filter(d => d.status === 'completed' || d.status === 'signed').length;
    }
  } catch {
    // Leave at zeros — empty state still renders
  }

  lastSnapshot = { postedCount, income, expenses, dealsClosed };
  renderProgress(goals, lastSnapshot);
}

function renderProgress(goals, snap) {
  if (!snap) return;
  const { postedCount, income, expenses, dealsClosed } = snap;

  fillRow('content', postedCount, goals.content, n => `${n} post${n === 1 ? '' : 's'}`);
  fillRow('income', income, goals.income, n => `$${formatNum(n)}`);
  fillRow('expense', expenses, goals.expenseCap, n => `$${formatNum(n)}`, true);
  fillRow('deals', dealsClosed, goals.deals, n => `${n} deal${n === 1 ? '' : 's'}`);

  // Net header
  const netEl = document.getElementById('goals-net');
  if (netEl) {
    const net = income - expenses;
    netEl.textContent = `${net >= 0 ? '+' : '−'}$${formatNum(Math.abs(net))}`;
    netEl.classList.toggle('positive', net >= 0);
    netEl.classList.toggle('negative', net < 0);
  }
}

function fillRow(key, actual, target, fmt, isCap = false) {
  const actualEl = document.getElementById(`goal-actual-${key}`);
  const targetEl = document.getElementById(`goal-target-${key}`);
  const fill = document.getElementById(`goal-fill-${key}`);
  const pct = document.getElementById(`goal-pct-${key}`);
  if (!actualEl || !targetEl || !fill || !pct) return;

  actualEl.textContent = fmt(actual);
  targetEl.textContent = target ? fmt(target) : '— not set';

  if (!target) {
    fill.style.width = '0%';
    pct.textContent = '';
    fill.classList.remove('over', 'complete');
    return;
  }

  const ratio = actual / target;
  const widthPct = Math.min(100, Math.max(0, ratio * 100));
  fill.style.width = `${widthPct}%`;
  pct.textContent = `${Math.round(ratio * 100)}%`;

  fill.classList.remove('over', 'complete');
  if (isCap) {
    // For expense caps, over target is bad.
    if (ratio >= 1) fill.classList.add('over');
  } else {
    if (ratio >= 1) fill.classList.add('complete');
  }
}

function formatNum(n) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
