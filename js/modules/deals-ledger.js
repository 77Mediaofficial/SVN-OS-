import { db, getCurrentUser } from '../supabase.js';
import { showToast } from '../toast.js';

/* ── State ────────────────────────────────────────────────── */
let deals = [];
let transactions = [];
let currentDealFilter = 'all';
let currentDealSearch = '';
let currentTxnSearch = '';
let currentTxnCategory = 'all';
let abortController = null;

/* ── Debounce Utility ────────────────────────────────────── */
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/* ── Init ─────────────────────────────────────────────────── */
export async function init() {
  abortController = new AbortController();
  const signal = abortController.signal;

  bindDealEvents(signal);
  bindTxnEvents(signal);
  bindFilterEvents(signal);
  bindSearchEvents(signal);

  await Promise.all([loadDeals(), loadTransactions()]);

  // Return cleanup function for the router
  return () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };
}

/* ── Helpers ──────────────────────────────────────────────── */
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(n);
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCategory(cat) {
  if (!cat) return '';
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatStatus(status) {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function roundCents(value) {
  return Math.round(value * 100) / 100;
}

/* ── DEALS: Load & Render ─────────────────────────────────── */
async function loadDeals() {
  const tbody = document.getElementById('deals-tbody');
  if (!tbody) return;

  try {
    const { data, error } = await db
      .from('brand_deals')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    deals = data || [];
  } catch (err) {
    deals = [];
    showToast(err.message || 'Failed to load deals', 'error');
  }

  renderDeals();
}

function renderDeals() {
  const tbody = document.getElementById('deals-tbody');
  if (!tbody) return;

  let filtered = currentDealFilter === 'all'
    ? deals
    : deals.filter(d => d.status === currentDealFilter);

  // Apply search filter
  if (currentDealSearch) {
    const query = currentDealSearch.toLowerCase();
    filtered = filtered.filter(d =>
      (d.brand_name || '').toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No deals found. Click "New Deal" to get started.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => `
    <tr data-deal-id="${d.id}">
      <td>${escapeHtml(d.brand_name)}</td>
      <td><span class="deal-badge badge-${d.status}">${formatStatus(d.status)}</span></td>
      <td class="col-value">${d.value ? formatCurrency(d.value) : '--'}</td>
      <td class="col-date">${formatDate(d.deadline)}</td>
      <td class="col-actions">
        <button class="dl-row-btn deal-edit-btn" data-id="${d.id}">Edit</button>
        <button class="dl-row-btn danger deal-delete-btn" data-id="${d.id}">Delete</button>
      </td>
    </tr>
  `).join('');
}

/* ── DEALS: Create / Update ───────────────────────────────── */
async function saveDeal(formData) {
  const user = await getCurrentUser();
  if (!user) return;

  const id = formData.id;
  const payload = {
    brand_name: formData.brand_name,
    contact_name: formData.contact_name || null,
    contact_email: formData.contact_email || null,
    status: formData.status,
    value: formData.value ? roundCents(parseFloat(formData.value)) : null,
    deliverables: formData.deliverables || null,
    deadline: formData.deadline || null,
    notes: formData.notes || null,
  };

  let error;
  if (id) {
    ({ error } = await db.from('brand_deals').update(payload).eq('id', id));
  } else {
    payload.user_id = user.id;
    ({ error } = await db.from('brand_deals').insert(payload));
  }

  if (error) throw error;
  await loadDeals();

  showToast(id ? 'Deal updated' : 'Deal created successfully', 'success');
}

async function deleteDeal(id) {
  const { error } = await db.from('brand_deals').delete().eq('id', id);
  if (error) throw error;
  await Promise.all([loadDeals(), loadTransactions()]);
  showToast('Deal deleted', 'info');
}

/* ── TRANSACTIONS: Load & Render ──────────────────────────── */
async function loadTransactions() {
  const tbody = document.getElementById('txn-tbody');
  if (!tbody) return;

  try {
    const { data, error } = await db
      .from('transactions')
      .select('*, brand_deals(brand_name)')
      .order('date', { ascending: false });

    if (error) throw error;
    transactions = data || [];
  } catch (err) {
    transactions = [];
    showToast(err.message || 'Failed to load transactions', 'error');
  }

  renderTransactions();
  renderSummary();
}

function renderTransactions() {
  const tbody = document.getElementById('txn-tbody');
  if (!tbody) return;

  let filtered = transactions;

  // Apply category filter
  if (currentTxnCategory !== 'all') {
    filtered = filtered.filter(t => t.category === currentTxnCategory);
  }

  // Apply search filter
  if (currentTxnSearch) {
    const query = currentTxnSearch.toLowerCase();
    filtered = filtered.filter(t =>
      (t.description || '').toLowerCase().includes(query) ||
      (t.category || '').toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No transactions yet. Click "New Transaction" to add one.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const typeClass = t.type === 'income' ? 'badge-income' : 'badge-expense';
    const amountColor = t.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)';
    const sign = t.type === 'income' ? '+' : '-';

    return `
      <tr data-txn-id="${t.id}">
        <td class="col-date">${formatDate(t.date)}</td>
        <td>${escapeHtml(t.description) || '<span style="color:var(--color-text-muted)">No description</span>'}</td>
        <td>${formatCategory(t.category)}</td>
        <td><span class="type-badge ${typeClass}">${t.type}</span></td>
        <td class="col-amount" style="color:${amountColor}">${sign}${formatCurrency(Math.abs(t.amount))}</td>
        <td class="col-actions">
          <button class="dl-row-btn txn-edit-btn" data-id="${t.id}">Edit</button>
          <button class="dl-row-btn danger txn-delete-btn" data-id="${t.id}">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderSummary() {
  const incomeEl = document.getElementById('ledger-income');
  const expenseEl = document.getElementById('ledger-expenses');
  const netEl = document.getElementById('ledger-net');
  if (!incomeEl || !expenseEl || !netEl) return;

  const income = roundCents(
    transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  );

  const expenses = roundCents(
    transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  );

  const net = roundCents(income - expenses);

  incomeEl.textContent = formatCurrency(income);
  expenseEl.textContent = formatCurrency(expenses);
  netEl.textContent = formatCurrency(net);

  netEl.classList.remove('positive', 'negative');
  if (net > 0) netEl.classList.add('positive');
  else if (net < 0) netEl.classList.add('negative');
}

/* ── TRANSACTIONS: Create / Update ────────────────────────── */
async function saveTransaction(formData) {
  const user = await getCurrentUser();
  if (!user) return;

  const id = formData.id;
  const payload = {
    type: formData.type,
    category: formData.category,
    amount: roundCents(parseFloat(formData.amount)),
    description: formData.description || null,
    date: formData.date,
    deal_id: formData.deal_id || null,
  };

  let error;
  if (id) {
    ({ error } = await db.from('transactions').update(payload).eq('id', id));
  } else {
    payload.user_id = user.id;
    ({ error } = await db.from('transactions').insert(payload));
  }

  if (error) throw error;
  await loadTransactions();

  showToast(id ? 'Transaction updated' : 'Transaction logged', 'success');
}

async function deleteTransaction(id) {
  const { error } = await db.from('transactions').delete().eq('id', id);
  if (error) throw error;
  await loadTransactions();
  showToast('Transaction deleted', 'info');
}

/* ── Modal Helpers ────────────────────────────────────────── */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'none';
}

function resetDealForm() {
  document.getElementById('deal-id').value = '';
  document.getElementById('deal-form').reset();
  document.getElementById('deal-error').textContent = '';
  document.getElementById('deal-modal-title').textContent = 'New Deal';
  document.getElementById('deal-modal-subtitle').textContent = 'Add a brand partnership';
  document.getElementById('deal-submit').textContent = 'Save Deal';
}

function populateDealForm(deal) {
  document.getElementById('deal-id').value = deal.id;
  document.getElementById('deal-brand-name').value = deal.brand_name || '';
  document.getElementById('deal-contact-name').value = deal.contact_name || '';
  document.getElementById('deal-contact-email').value = deal.contact_email || '';
  document.getElementById('deal-status').value = deal.status || 'lead';
  document.getElementById('deal-value').value = deal.value || '';
  document.getElementById('deal-deadline').value = deal.deadline || '';
  document.getElementById('deal-deliverables').value = deal.deliverables || '';
  document.getElementById('deal-notes').value = deal.notes || '';
  document.getElementById('deal-error').textContent = '';
  document.getElementById('deal-modal-title').textContent = 'Edit Deal';
  document.getElementById('deal-modal-subtitle').textContent = escapeHtml(deal.brand_name);
  document.getElementById('deal-submit').textContent = 'Update Deal';
}

function resetTxnForm() {
  document.getElementById('txn-id').value = '';
  document.getElementById('txn-form').reset();
  document.getElementById('txn-date').value = todayISO();
  document.getElementById('txn-error').textContent = '';
  document.getElementById('txn-modal-title').textContent = 'New Transaction';
  document.getElementById('txn-modal-subtitle').textContent = 'Record income or expense';
  document.getElementById('txn-submit').textContent = 'Save Transaction';
  populateDealSelect('');
}

function populateTxnForm(txn) {
  document.getElementById('txn-id').value = txn.id;
  document.getElementById('txn-type').value = txn.type || 'income';
  document.getElementById('txn-category').value = txn.category || 'other';
  document.getElementById('txn-amount').value = txn.amount || '';
  document.getElementById('txn-date').value = txn.date || todayISO();
  document.getElementById('txn-description').value = txn.description || '';
  document.getElementById('txn-error').textContent = '';
  document.getElementById('txn-modal-title').textContent = 'Edit Transaction';
  document.getElementById('txn-modal-subtitle').textContent = 'Update transaction details';
  document.getElementById('txn-submit').textContent = 'Update Transaction';
  populateDealSelect(txn.deal_id || '');
}

function populateDealSelect(selectedDealId) {
  const select = document.getElementById('txn-deal');
  if (!select) return;

  const options = ['<option value="">None</option>'];
  deals.forEach(d => {
    const selected = d.id === selectedDealId ? ' selected' : '';
    options.push(`<option value="${d.id}"${selected}>${escapeHtml(d.brand_name)}</option>`);
  });
  select.innerHTML = options.join('');
}

/* ── Search Binding ──────────────────────────────────────── */
function bindSearchEvents(signal) {
  // Deal search — debounced
  const dealSearchInput = document.getElementById('deal-search');
  if (dealSearchInput) {
    const debouncedDealSearch = debounce((value) => {
      currentDealSearch = value;
      renderDeals();
    }, 300);

    dealSearchInput.addEventListener('input', (e) => {
      debouncedDealSearch(e.target.value.trim());
    }, { signal });
  }

  // Transaction search — debounced
  const txnSearchInput = document.getElementById('txn-search');
  if (txnSearchInput) {
    const debouncedTxnSearch = debounce((value) => {
      currentTxnSearch = value;
      renderTransactions();
    }, 300);

    txnSearchInput.addEventListener('input', (e) => {
      debouncedTxnSearch(e.target.value.trim());
    }, { signal });
  }

  // Transaction category filter
  const txnCategoryFilter = document.getElementById('txn-category-filter');
  if (txnCategoryFilter) {
    txnCategoryFilter.addEventListener('change', (e) => {
      currentTxnCategory = e.target.value;
      renderTransactions();
    }, { signal });
  }
}

/* ── Event Binding ────────────────────────────────────────── */
function bindFilterEvents(signal) {
  const filterBar = document.getElementById('deal-filters');
  if (!filterBar) return;

  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.dl-filter-btn');
    if (!btn) return;

    filterBar.querySelectorAll('.dl-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDealFilter = btn.getAttribute('data-status');
    renderDeals();
  }, { signal });
}

function bindDealEvents(signal) {
  // New Deal button
  const newDealBtn = document.getElementById('btn-new-deal');
  if (newDealBtn) {
    newDealBtn.addEventListener('click', () => {
      resetDealForm();
      openModal('deal-modal');
    }, { signal });
  }

  // Cancel button
  const cancelBtn = document.getElementById('deal-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeModal('deal-modal');
    }, { signal });
  }

  // Modal overlay click to close
  const modal = document.getElementById('deal-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal('deal-modal');
    }, { signal });
  }

  // Form submit
  const form = document.getElementById('deal-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('deal-error');
      const submitBtn = document.getElementById('deal-submit');
      errorEl.textContent = '';
      submitBtn.disabled = true;

      try {
        await saveDeal({
          id: document.getElementById('deal-id').value || null,
          brand_name: document.getElementById('deal-brand-name').value.trim(),
          contact_name: document.getElementById('deal-contact-name').value.trim(),
          contact_email: document.getElementById('deal-contact-email').value.trim(),
          status: document.getElementById('deal-status').value,
          value: document.getElementById('deal-value').value,
          deliverables: document.getElementById('deal-deliverables').value.trim(),
          deadline: document.getElementById('deal-deadline').value,
          notes: document.getElementById('deal-notes').value.trim(),
        });
        closeModal('deal-modal');
      } catch (err) {
        errorEl.style.color = 'var(--color-danger)';
        errorEl.textContent = err.message || 'Failed to save deal.';
        showToast(err.message || 'Failed to save deal', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    }, { signal });
  }

  // Edit / Delete (delegated on tbody)
  const tbody = document.getElementById('deals-tbody');
  if (tbody) {
    tbody.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.deal-edit-btn');
      const deleteBtn = e.target.closest('.deal-delete-btn');

      if (editBtn) {
        const deal = deals.find(d => d.id === editBtn.dataset.id);
        if (deal) {
          populateDealForm(deal);
          openModal('deal-modal');
        }
      }

      if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        const deal = deals.find(d => d.id === id);
        const confirmed = confirm(`Delete deal with ${deal ? deal.brand_name : 'this brand'}? This cannot be undone.`);
        if (confirmed) {
          try {
            await deleteDeal(id);
          } catch (err) {
            showToast(err.message || 'Failed to delete deal', 'error');
          }
        }
      }
    }, { signal });
  }
}

function bindTxnEvents(signal) {
  // New Transaction button
  const newTxnBtn = document.getElementById('btn-new-txn');
  if (newTxnBtn) {
    newTxnBtn.addEventListener('click', () => {
      resetTxnForm();
      openModal('txn-modal');
    }, { signal });
  }

  // Cancel button
  const cancelBtn = document.getElementById('txn-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeModal('txn-modal');
    }, { signal });
  }

  // Modal overlay click to close
  const modal = document.getElementById('txn-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal('txn-modal');
    }, { signal });
  }

  // Form submit
  const form = document.getElementById('txn-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('txn-error');
      const submitBtn = document.getElementById('txn-submit');
      errorEl.textContent = '';
      submitBtn.disabled = true;

      try {
        await saveTransaction({
          id: document.getElementById('txn-id').value || null,
          type: document.getElementById('txn-type').value,
          category: document.getElementById('txn-category').value,
          amount: document.getElementById('txn-amount').value,
          description: document.getElementById('txn-description').value.trim(),
          date: document.getElementById('txn-date').value,
          deal_id: document.getElementById('txn-deal').value || null,
        });
        closeModal('txn-modal');
      } catch (err) {
        errorEl.style.color = 'var(--color-danger)';
        errorEl.textContent = err.message || 'Failed to save transaction.';
        showToast(err.message || 'Failed to save transaction', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    }, { signal });
  }

  // Edit / Delete (delegated on tbody)
  const tbody = document.getElementById('txn-tbody');
  if (tbody) {
    tbody.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.txn-edit-btn');
      const deleteBtn = e.target.closest('.txn-delete-btn');

      if (editBtn) {
        const txn = transactions.find(t => t.id === editBtn.dataset.id);
        if (txn) {
          populateTxnForm(txn);
          openModal('txn-modal');
        }
      }

      if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        const confirmed = confirm('Delete this transaction? This cannot be undone.');
        if (confirmed) {
          try {
            await deleteTransaction(id);
          } catch (err) {
            showToast(err.message || 'Failed to delete transaction', 'error');
          }
        }
      }
    }, { signal });
  }
}
