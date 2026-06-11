/* Invoicing — turn a deal into a print-ready PDF.
   The invoice form prefils from the deal + business settings
   (Analytics → Edit targets), then renders a clean light document
   into a print-only container and opens the browser's print dialog
   ("Save as PDF"). Stateless by design; numbering auto-increments. */

import { getPrefs, savePrefs } from '../store.js';
import { esc, money, todayKey, dayKey, fmtDate, formData, bindDialog } from '../ui.js';
import { toast } from '../toast.js';

let nextSeq = 1;

/* Call once per page mount (the dialog is recreated with the page). */
export function initInvoice() {
  const dialog = document.getElementById('invoice-modal');
  bindDialog(dialog);

  document.getElementById('inv-add-line').addEventListener('click', () => addLine());

  const lines = document.getElementById('inv-lines');
  lines.addEventListener('click', (e) => {
    const btn = e.target.closest('.inv-remove');
    if (btn) { btn.closest('.inv-line').remove(); recomputeTotal(); }
  });
  lines.addEventListener('input', recomputeTotal);

  document.getElementById('invoice-form').addEventListener('submit', onPrint);
}

export async function openInvoice(deal) {
  const prefs = await getPrefs();
  const form = document.getElementById('invoice-form');
  nextSeq = (Number(prefs.invoice_seq) || 0) + 1;

  form.number.value = `INV-${todayKey().slice(0, 4)}-${String(nextSeq).padStart(3, '0')}`;
  form.issued.value = todayKey();
  form.due.value = dayKey(new Date(Date.now() + 14 * 86400000));
  form.from_name.value = prefs.business_name || '';
  form.from_details.value = prefs.invoice_details || '';
  form.to.value = [deal.brand_name, deal.contact_name, deal.contact_email]
    .filter(Boolean).join('\n');
  form.notes.value = 'Payment due within 14 days. Thank you.';

  document.getElementById('inv-lines').innerHTML = '';
  addLine(`${deal.brand_name} — sponsorship deliverables`, Number(deal.value) || '');
  recomputeTotal();

  document.getElementById('invoice-modal').showModal();
}

/* ── Line items ──────────────────────────────────────────── */

function addLine(description = '', amount = '') {
  const row = document.createElement('div');
  row.className = 'inv-line';
  row.innerHTML = `
    <input data-line="desc" placeholder="Description" maxlength="200" />
    <input data-line="amount" type="number" min="0" step="0.01" placeholder="0.00" />
    <button type="button" class="iconbtn inv-remove" aria-label="Remove line">✕</button>`;
  row.querySelector('[data-line="desc"]').value = description;
  row.querySelector('[data-line="amount"]').value = amount;
  document.getElementById('inv-lines').appendChild(row);
}

function getLines() {
  return [...document.querySelectorAll('#inv-lines .inv-line')]
    .map((row) => ({
      description: row.querySelector('[data-line="desc"]').value.trim(),
      amount: Number(row.querySelector('[data-line="amount"]').value) || 0,
    }))
    .filter((l) => l.description || l.amount > 0);
}

function recomputeTotal() {
  const total = getLines().reduce((s, l) => s + l.amount, 0);
  document.getElementById('inv-total').textContent = money(total, { exact: true });
  return total;
}

/* ── Print ───────────────────────────────────────────────── */

function onPrint(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const lines = getLines();
  if (!lines.length) { toast('Add at least one line item.', 'error'); return; }

  const state = { ...formData(form), lines, total: lines.reduce((s, l) => s + l.amount, 0) };
  renderAndPrint(state);

  savePrefs({ invoice_seq: nextSeq }).catch(() => {});
  document.getElementById('invoice-modal').close();
  toast('Invoice opened in the print dialog — choose “Save as PDF”.', 'success');
}

function renderAndPrint(state) {
  document.getElementById('invoice-print')?.remove();

  const el = document.createElement('div');
  el.id = 'invoice-print';
  el.innerHTML = `
    <div class="ip-head">
      <div>
        <div class="ip-title">Invoice</div>
        <div class="ip-from-name">${esc(state.from_name)}</div>
      </div>
      <div class="ip-num">
        No. ${esc(state.number)}<br />
        Issued ${fmtDate(state.issued, { withYear: true })}
        ${state.due ? `<br />Due ${fmtDate(state.due, { withYear: true })}` : ''}
      </div>
    </div>

    <div class="ip-cols">
      <div class="ip-col">
        <div class="ip-label">From</div>${esc(state.from_details)}
      </div>
      <div class="ip-col">
        <div class="ip-label">Bill to</div>${esc(state.to)}
      </div>
    </div>

    <table class="ip-table">
      <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${state.lines.map((l) => `
          <tr>
            <td>${esc(l.description) || '—'}</td>
            <td class="num">${money(l.amount, { exact: true })}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div class="ip-total"><span>Total due</span><span>${money(state.total, { exact: true })}</span></div>
    ${state.notes ? `<div class="ip-foot">${esc(state.notes)}</div>` : ''}`;

  document.body.appendChild(el);
  document.body.classList.add('printing');

  const cleanup = () => {
    document.body.classList.remove('printing');
    el.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 2000); // fallback if afterprint never fires
}
