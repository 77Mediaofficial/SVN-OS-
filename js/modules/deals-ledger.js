/* Deals & Ledger — sponsorship CRM and money in/out, side by side.
   Deals: lead → negotiating → signed → delivered → paid.
   Ledger: income/expense rows, recurring support, CSV export. */

import { deals, transactions } from '../store.js';
import { initInvoice, openInvoice } from './invoice.js';
import { toast } from '../toast.js';
import {
  esc, money, fmtDate, relDay, todayKey, formData, parseTags,
  bindDialog, confirmAction, statMoney, runCountUps,
} from '../ui.js';
import {
  DEAL_STATUSES, DEAL_STATUS_BY_KEY, dealTone,
  TXN_CATEGORIES, CATEGORY_BY_KEY, RECURRENCE, optionsHtml,
} from '../domain.js';

const OPEN_STATUSES = new Set(['lead', 'negotiating']);
const WORKING_STATUSES = new Set(['signed', 'delivered']);
const STATUS_RANK = { lead: 1, negotiating: 0, signed: 2, delivered: 3, paid: 4, lost: 5 };

let dealRows = [];
let txnRows = [];
let activeTab = 'deals';
let editingDealId = null;
let editingTxnId = null;
let statusFilter = 'all';

export async function init() {
  document.getElementById('df-status').innerHTML = optionsHtml(DEAL_STATUSES, 'lead');
  document.getElementById('tf-category').innerHTML = optionsHtml(TXN_CATEGORIES, 'sponsorship');
  document.getElementById('tf-recurrence').innerHTML = optionsHtml(RECURRENCE, 'none');
  bindDialog(document.getElementById('deal-modal'));
  bindDialog(document.getElementById('txn-modal'));
  initInvoice();

  [dealRows, txnRows] = await Promise.all([deals.list(), transactions.list()]);
  renderDeals();
  renderLedger();
  syncTab();

  document.getElementById('tab-deals').addEventListener('click', () => { activeTab = 'deals'; syncTab(); });
  document.getElementById('tab-ledger').addEventListener('click', () => { activeTab = 'ledger'; syncTab(); });

  document.getElementById('dl-new').addEventListener('click', () => {
    if (activeTab === 'deals') openDealModal(null);
    else openTxnModal(null);
  });
  document.getElementById('deals-empty-cta').addEventListener('click', () => openDealModal(null));
  document.getElementById('ledger-empty-cta').addEventListener('click', () => openTxnModal(null));
  document.getElementById('export-csv').addEventListener('click', exportCsv);

  document.getElementById('deal-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-status]');
    if (!chip) return;
    statusFilter = chip.dataset.status;
    renderDeals();
  });
  document.getElementById('deals-body').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openDealModal(tr.dataset.id);
  });
  document.getElementById('ledger-body').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openTxnModal(tr.dataset.id);
  });

  document.getElementById('deal-form').addEventListener('submit', onDealSubmit);
  document.getElementById('df-delete').addEventListener('click', onDealDelete);
  document.getElementById('df-invoice').addEventListener('click', () => {
    const row = dealRows.find((r) => r.id === editingDealId);
    if (!row) return;
    document.getElementById('deal-modal').close();
    openInvoice(row).catch((err) => { console.error(err); toast('Could not open the invoice.', 'error'); });
  });
  document.getElementById('txn-form').addEventListener('submit', onTxnSubmit);
  document.getElementById('tf-delete').addEventListener('click', onTxnDelete);

  document.getElementById('tf-recurrence').addEventListener('change', (e) => {
    const end = document.getElementById('tf-rec-end');
    end.disabled = e.target.value === 'none';
    if (end.disabled) end.value = '';
  });
}

/* ── Tabs ────────────────────────────────────────────────── */

function syncTab() {
  const isDeals = activeTab === 'deals';
  document.getElementById('tab-deals').setAttribute('aria-selected', String(isDeals));
  document.getElementById('tab-ledger').setAttribute('aria-selected', String(!isDeals));
  document.getElementById('deals-section').hidden = !isDeals;
  document.getElementById('ledger-section').hidden = isDeals;
  document.getElementById('dl-new').textContent = isDeals ? 'New deal' : 'Add transaction';
  document.getElementById('export-csv').hidden = isDeals;
}

/* ── Deals ───────────────────────────────────────────────── */

function statHtml(label, num, foot) {
  return `
    <div class="stat">
      <div class="stat-label">${label}</div>
      <div class="stat-num">${num}</div>
      <div class="stat-foot">${foot}</div>
    </div>`;
}

function renderDeals() {
  const open = dealRows.filter((d) => OPEN_STATUSES.has(d.status));
  const working = dealRows.filter((d) => WORKING_STATUSES.has(d.status));
  const year = todayKey().slice(0, 4);
  const paidThisYear = dealRows.filter((d) =>
    d.status === 'paid' && String(d.updated_at ?? '').startsWith(year));

  const sum = (list) => list.reduce((s, d) => s + Number(d.value), 0);

  const dealStatsEl = document.getElementById('deal-stats');
  dealStatsEl.innerHTML =
    statHtml('In conversation', statMoney(sum(open)), `${open.length} lead${open.length === 1 ? '' : 's'} & negotiations`) +
    statHtml('Committed', statMoney(sum(working)), `${working.length} signed or delivered`) +
    statHtml('Paid this year', statMoney(sum(paidThisYear)), `${paidThisYear.length} deal${paidThisYear.length === 1 ? '' : 's'} closed`);
  runCountUps(dealStatsEl);

  renderDealFilters();

  const sorted = [...dealRows].sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    if (a.deadline && b.deadline) return a.deadline < b.deadline ? -1 : 1;
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
  const display = statusFilter === 'all'
    ? sorted
    : sorted.filter((d) => d.status === statusFilter);

  const body = document.getElementById('deals-body');
  if (dealRows.length && !display.length) {
    body.innerHTML = `<tr><td colspan="6" class="tone-dim" style="text-align:center;padding:28px">No ${DEAL_STATUS_BY_KEY[statusFilter]?.label.toLowerCase() ?? ''} deals.</td></tr>`;
    document.getElementById('deals-empty').hidden = true;
    return;
  }
  body.innerHTML = display.map((d) => {
    const status = DEAL_STATUS_BY_KEY[d.status];
    const isClosed = d.status === 'paid' || d.status === 'lost';
    const rel = isClosed
      ? { label: d.deadline ? fmtDate(d.deadline) : '—', tone: 'dim' }
      : relDay(d.deadline);
    const tags = (d.tags || []).slice(0, 3).map((t) => `<span class="tagchip">${esc(t)}</span>`).join(' ');
    return `
      <tr class="rowlink" data-id="${esc(d.id)}" tabindex="0">
        <td><div class="cell-main">${esc(d.brand_name)}</div></td>
        <td><span class="pill tone-${dealTone(d.status)}">${status.label}</span></td>
        <td class="num">${money(d.value)}</td>
        <td><span class="tone-${rel.tone}">${rel.label}</span></td>
        <td class="hide-sm">
          ${d.contact_name ? `<div class="cell-main">${esc(d.contact_name)}</div>` : '<span class="tone-dim">—</span>'}
          ${d.contact_email ? `<div class="cell-sub">${esc(d.contact_email)}</div>` : ''}
        </td>
        <td class="hide-sm">${tags || '<span class="tone-dim">—</span>'}</td>
      </tr>`;
  }).join('');

  document.getElementById('deals-empty').hidden = dealRows.length > 0;
}

function renderDealFilters() {
  const counts = dealRows.reduce((acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; }, {});
  if (statusFilter !== 'all' && !counts[statusFilter]) statusFilter = 'all';
  const chips = [
    { key: 'all', label: 'All', n: dealRows.length },
    ...DEAL_STATUSES.filter((s) => counts[s.key]).map((s) => ({ key: s.key, label: s.label, n: counts[s.key] })),
  ];
  document.getElementById('deal-filters').innerHTML = chips.map((c) =>
    `<button type="button" class="chip ${c.key === statusFilter ? 'is-active' : ''}" data-status="${c.key}">${c.label}<span class="chip-n">${c.n}</span></button>`
  ).join('');
}

function openDealModal(id) {
  const modal = document.getElementById('deal-modal');
  const form = document.getElementById('deal-form');
  const row = id ? dealRows.find((r) => r.id === id) : null;
  editingDealId = row?.id ?? null;

  form.reset();
  document.getElementById('deal-modal-title').textContent = row ? 'Edit deal' : 'New deal';
  document.getElementById('df-save').textContent = row ? 'Save changes' : 'Add deal';
  document.getElementById('df-delete').hidden = !row;
  document.getElementById('df-invoice').hidden = !row;

  if (row) {
    form.brand_name.value = row.brand_name;
    form.status.value = row.status;
    form.value.value = row.value || '';
    form.deadline.value = row.deadline || '';
    form.tags.value = (row.tags || []).join(', ');
    form.contact_name.value = row.contact_name || '';
    form.contact_email.value = row.contact_email || '';
    form.notes.value = row.notes || '';
  }

  modal.showModal();
}

async function onDealSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  if (!form.brand_name.value.trim()) { form.brand_name.focus(); return; }

  const prevStatus = editingDealId
    ? dealRows.find((r) => r.id === editingDealId)?.status
    : null;
  const raw = formData(form);
  const values = {
    brand_name: raw.brand_name,
    status: raw.status,
    value: Number(raw.value) || 0,
    deadline: raw.deadline || null,
    tags: parseTags(raw.tags),
    contact_name: raw.contact_name || '',
    contact_email: raw.contact_email || '',
    notes: raw.notes || '',
  };

  try {
    let saved;
    if (editingDealId) {
      saved = await deals.update(editingDealId, values);
      dealRows = dealRows.map((r) => (r.id === editingDealId ? saved : r));
      toast('Deal updated.', 'success');
    } else {
      saved = await deals.create(values);
      dealRows.unshift(saved);
      toast('Deal added.', 'success');
    }
    document.getElementById('deal-modal').close();
    renderDeals();
    if (saved.status === 'paid' && prevStatus !== 'paid') await offerPaymentLog(saved);
  } catch (err) {
    console.error(err);
    toast('Could not save the deal.', 'error');
  }
}

/* When a deal lands on "paid", keep the ledger honest:
   offer to log the income transaction right away. */
async function offerPaymentLog(deal) {
  const amount = Number(deal.value) || 0;
  if (amount <= 0) return;
  const ok = await confirmAction(
    `Log ${money(amount)} from ${deal.brand_name} as income in the ledger?`,
    { confirmLabel: 'Log income' });
  if (!ok) return;
  try {
    const txn = await transactions.create({
      type: 'income',
      category: 'sponsorship',
      description: `${deal.brand_name} — sponsorship payment`,
      amount,
      occurred_at: todayKey(),
      recurrence: 'none',
      recurrence_end: null,
      parent_transaction_id: null,
      deal_id: deal.id,
    });
    txnRows.unshift(txn);
    renderLedger();
    toast('Payment logged in the ledger.', 'success');
  } catch (err) {
    console.error(err);
    toast('Could not log the payment.', 'error');
  }
}

async function onDealDelete() {
  if (!editingDealId) return;
  const row = dealRows.find((r) => r.id === editingDealId);
  const ok = await confirmAction(`Delete the ${row?.brand_name ?? ''} deal? Linked transactions stay in the ledger.`);
  if (!ok) return;

  try {
    await deals.remove(editingDealId);
    dealRows = dealRows.filter((r) => r.id !== editingDealId);
    document.getElementById('deal-modal').close();
    renderDeals();
    renderLedger(); // deal names in the ledger column may change
    toast('Deal deleted.');
  } catch (err) {
    console.error(err);
    toast('Could not delete the deal.', 'error');
  }
}

/* ── Ledger ──────────────────────────────────────────────── */

function renderLedger() {
  const month = todayKey().slice(0, 7);
  const inMonth = txnRows.filter((t) => String(t.occurred_at).startsWith(month));
  const income = inMonth.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const costs = inMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const net = income - costs;

  const ledgerStatsEl = document.getElementById('ledger-stats');
  ledgerStatsEl.innerHTML =
    statHtml('Income this month', statMoney(income), `${inMonth.filter((t) => t.type === 'income').length} payments in`) +
    statHtml('Expenses this month', statMoney(costs), `${inMonth.filter((t) => t.type === 'expense').length} payments out`) +
    `<div class="stat">
       <div class="stat-label">Net</div>
       <div class="stat-num ${net >= 0 ? 'is-pos' : 'is-neg'}">${statMoney(net)}</div>
       <div class="stat-foot">${net >= 0 ? 'in the black' : 'spending exceeds income'}</div>
     </div>`;
  runCountUps(ledgerStatsEl);

  const dealName = (id) => dealRows.find((d) => d.id === id)?.brand_name;

  const sorted = [...txnRows].sort((a, b) =>
    a.occurred_at === b.occurred_at
      ? new Date(b.created_at) - new Date(a.created_at)
      : (a.occurred_at < b.occurred_at ? 1 : -1));

  document.getElementById('ledger-body').innerHTML = sorted.map((t) => {
    const isIncome = t.type === 'income';
    const recurring = t.recurrence && t.recurrence !== 'none';
    const linked = t.deal_id ? dealName(t.deal_id) : null;
    return `
      <tr class="rowlink" data-id="${esc(t.id)}" tabindex="0">
        <td class="tone-dim" style="white-space:nowrap">${fmtDate(t.occurred_at)}</td>
        <td>
          <div class="cell-main">${esc(t.description)}${recurring ? `<span class="rec-badge">↻ ${t.recurrence}</span>` : ''}${t.parent_transaction_id ? '<span class="rec-badge" title="Generated by a recurring transaction">↻</span>' : ''}</div>
        </td>
        <td class="hide-sm"><span class="pill">${CATEGORY_BY_KEY[t.category]?.label ?? t.category}</span></td>
        <td class="hide-sm">${linked ? esc(linked) : '<span class="tone-dim">—</span>'}</td>
        <td class="num ${isIncome ? 'amount-pos' : 'amount-neg'}">${isIncome ? '+' : '−'}${money(t.amount, { exact: true })}</td>
      </tr>`;
  }).join('');

  document.getElementById('ledger-empty').hidden = txnRows.length > 0;
}

function openTxnModal(id) {
  const modal = document.getElementById('txn-modal');
  const form = document.getElementById('txn-form');
  const row = id ? txnRows.find((r) => r.id === id) : null;
  editingTxnId = row?.id ?? null;

  // (Re)build the deal selector each time — deals may have changed.
  document.getElementById('tf-deal').innerHTML =
    '<option value="">None</option>' +
    dealRows.map((d) => `<option value="${esc(d.id)}">${esc(d.brand_name)}</option>`).join('');

  form.reset();
  document.getElementById('txn-modal-title').textContent = row ? 'Edit transaction' : 'Add transaction';
  document.getElementById('tf-save').textContent = row ? 'Save changes' : 'Add to ledger';
  document.getElementById('tf-delete').hidden = !row;
  document.getElementById('tf-rec-end').disabled = true;

  if (row) {
    form.type.value = row.type;
    form.description.value = row.description;
    form.amount.value = row.amount;
    form.occurred_at.value = row.occurred_at;
    form.category.value = row.category;
    form.deal_id.value = row.deal_id || '';
    form.recurrence.value = row.recurrence || 'none';
    document.getElementById('tf-rec-end').disabled = form.recurrence.value === 'none';
    form.recurrence_end.value = row.recurrence_end || '';
  } else {
    form.occurred_at.value = todayKey();
  }

  modal.showModal();
}

async function onTxnSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  if (!form.description.value.trim()) { form.description.focus(); return; }
  if (!form.amount.value || Number(form.amount.value) < 0) { form.amount.focus(); return; }

  const raw = formData(form);
  const values = {
    type: raw.type,
    description: raw.description,
    amount: Number(raw.amount),
    occurred_at: raw.occurred_at || todayKey(),
    category: raw.category,
    deal_id: raw.deal_id || null,
    recurrence: raw.recurrence || 'none',
    recurrence_end: raw.recurrence === 'none' ? null : (raw.recurrence_end || null),
  };

  try {
    if (editingTxnId) {
      const updated = await transactions.update(editingTxnId, values);
      txnRows = txnRows.map((r) => (r.id === editingTxnId ? updated : r));
      toast('Transaction updated.', 'success');
    } else {
      txnRows.unshift(await transactions.create(values));
      toast('Added to the ledger.', 'success');
    }
    document.getElementById('txn-modal').close();
    renderLedger();
  } catch (err) {
    console.error(err);
    toast('Could not save the transaction.', 'error');
  }
}

async function onTxnDelete() {
  if (!editingTxnId) return;
  const row = txnRows.find((r) => r.id === editingTxnId);
  const recurring = row?.recurrence && row.recurrence !== 'none';
  const ok = await confirmAction(
    recurring
      ? 'Delete this recurring transaction? Future occurrences stop; past ones stay.'
      : 'Delete this transaction?');
  if (!ok) return;

  try {
    await transactions.remove(editingTxnId);
    txnRows = txnRows.filter((r) => r.id !== editingTxnId);
    document.getElementById('txn-modal').close();
    renderLedger();
    toast('Transaction deleted.');
  } catch (err) {
    console.error(err);
    toast('Could not delete the transaction.', 'error');
  }
}

/* ── CSV export ──────────────────────────────────────────── */

function exportCsv() {
  const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const dealName = (id) => dealRows.find((d) => d.id === id)?.brand_name ?? '';

  const lines = [
    ['date', 'type', 'category', 'description', 'amount', 'deal', 'recurrence'].join(','),
    ...[...txnRows]
      .sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : 1))
      .map((t) => [
        quote(t.occurred_at), quote(t.type), quote(t.category),
        quote(t.description), Number(t.amount).toFixed(2),
        quote(dealName(t.deal_id)), quote(t.recurrence ?? 'none'),
      ].join(',')),
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `svn-os-ledger-${todayKey()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Ledger exported.', 'success');
}
