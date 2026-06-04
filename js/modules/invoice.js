/* ============================================================
   SVN OS — Invoice generator
   Builds a clean, print-ready invoice from a deal and the user's
   business identity, opens it in a new window, and triggers the
   browser's print dialog (Save as PDF). No external dependencies.
   ============================================================ */

import { db, getCurrentUser } from '/js/supabase.js';
import { showToast } from '/js/toast.js';
import { loadPreferences, getBusinessName } from '/js/preferences.js';

/**
 * Generate and open an invoice for a deal.
 * @param {object} deal - a brand_deals row
 */
export async function generateInvoice(deal) {
  if (!deal) return;
  try {
    await loadPreferences();
    const user = await getCurrentUser();

    // Pull profile for sender details (name, website).
    let profile = null;
    if (user) {
      const { data } = await db
        .from('profiles')
        .select('full_name, website, username')
        .eq('id', user.id)
        .maybeSingle();
      profile = data;
    }

    const businessName = getBusinessName()
      || profile?.full_name
      || user?.user_metadata?.full_name
      || 'Your Business';

    const html = buildInvoiceHtml({ deal, businessName, profile, user });

    const win = window.open('', '_blank');
    if (!win) {
      showToast('Allow pop-ups to generate the invoice', 'error');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (err) {
    showToast(err.message || 'Failed to generate invoice', 'error');
  }
}

function buildInvoiceHtml({ deal, businessName, profile, user }) {
  const today = new Date();
  const invoiceNo = buildInvoiceNumber(deal, today);
  const dueDate = deal.deadline
    ? new Date(deal.deadline + 'T00:00:00')
    : new Date(today.getTime() + 14 * 86400000);

  const amount = Number(deal.value) || 0;
  // Treat the deal value as the line-item subtotal.
  const lineItems = deriveLineItems(deal, amount);
  const subtotal = lineItems.reduce((s, li) => s + li.amount, 0);

  const senderEmail = user?.email || '';
  const senderSite = profile?.website || '';

  const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const rows = lineItems.map(li => `
    <tr>
      <td class="desc">${esc(li.description)}</td>
      <td class="num">${li.qty}</td>
      <td class="num">${fmt(li.rate)}</td>
      <td class="num">${fmt(li.amount)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice ${esc(invoiceNo)} — ${esc(businessName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    color: #111; background: #fff; padding: 48px 56px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; }
  .brand { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
  .brand-sub { color: #666; font-size: 0.82rem; margin-top: 4px; }
  .inv-meta { text-align: right; font-size: 0.82rem; color: #444; }
  .inv-meta .label { color: #999; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.66rem; }
  .inv-title { font-size: 2rem; font-weight: 300; letter-spacing: 0.1em; text-transform: uppercase; color: #111; margin-bottom: 8px; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 40px; gap: 40px; }
  .party { flex: 1; }
  .party .label { color: #999; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.66rem; margin-bottom: 8px; }
  .party .name { font-size: 1rem; font-weight: 600; margin-bottom: 2px; }
  .party .line { font-size: 0.84rem; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  thead th {
    text-align: left; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: #999; padding: 10px 12px; border-bottom: 2px solid #111;
  }
  thead th.num { text-align: right; }
  tbody td { padding: 14px 12px; border-bottom: 1px solid #eee; font-size: 0.9rem; vertical-align: top; }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody td.desc { color: #222; }
  .totals { margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 0.9rem; }
  .totals .row.grand {
    border-top: 2px solid #111; margin-top: 6px; padding-top: 14px;
    font-size: 1.1rem; font-weight: 700;
  }
  .notes { margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee; }
  .notes .label { color: #999; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.66rem; margin-bottom: 8px; }
  .notes p { font-size: 0.84rem; color: #555; line-height: 1.6; white-space: pre-wrap; }
  .foot { margin-top: 56px; text-align: center; color: #aaa; font-size: 0.72rem; }
  .actions { margin-bottom: 28px; display: flex; gap: 10px; }
  .actions button {
    font: inherit; font-size: 0.85rem; padding: 10px 18px; border-radius: 7px;
    border: 1px solid #111; background: #111; color: #fff; cursor: pointer;
  }
  .actions button.ghost { background: #fff; color: #111; }
  @media print { .actions { display: none; } body { padding: 24px 32px; } }
</style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Print / Save as PDF</button>
    <button class="ghost" onclick="window.close()">Close</button>
  </div>

  <div class="top">
    <div>
      <div class="brand">${esc(businessName)}</div>
      ${senderSite ? `<div class="brand-sub">${esc(senderSite)}</div>` : ''}
      ${senderEmail ? `<div class="brand-sub">${esc(senderEmail)}</div>` : ''}
    </div>
    <div class="inv-meta">
      <div class="inv-title">Invoice</div>
      <div><span class="label">No.</span> ${esc(invoiceNo)}</div>
      <div><span class="label">Issued</span> ${fmtDate(today)}</div>
      <div><span class="label">Due</span> ${fmtDate(dueDate)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="label">Billed to</div>
      <div class="name">${esc(deal.brand_name || 'Client')}</div>
      ${deal.contact_name ? `<div class="line">${esc(deal.contact_name)}</div>` : ''}
      ${deal.contact_email ? `<div class="line">${esc(deal.contact_email)}</div>` : ''}
    </div>
    <div class="party">
      <div class="label">From</div>
      <div class="name">${esc(businessName)}</div>
      ${senderEmail ? `<div class="line">${esc(senderEmail)}</div>` : ''}
      ${senderSite ? `<div class="line">${esc(senderSite)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Rate</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    <div class="row"><span>Tax</span><span>${fmt(0)}</span></div>
    <div class="row grand"><span>Total due</span><span>${fmt(subtotal)}</span></div>
  </div>

  ${deal.notes ? `<div class="notes"><div class="label">Notes</div><p>${esc(deal.notes)}</p></div>` : ''}

  <div class="foot">Generated by SVN OS · ${fmtDate(today)}</div>
</body>
</html>`;
}

/** Build line items from a deal — split deliverables into rows if present. */
function deriveLineItems(deal, amount) {
  const lines = (deal.deliverables || '')
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [{
      description: deal.deliverables?.trim() || `Services — ${deal.brand_name || 'engagement'}`,
      qty: 1,
      rate: amount,
      amount: amount,
    }];
  }

  // Distribute the deal value evenly across deliverables, with the
  // remainder going on the first line so the total stays exact.
  const per = Math.floor((amount / lines.length) * 100) / 100;
  let allocated = 0;
  return lines.map((desc, i) => {
    let lineAmt;
    if (i === lines.length - 1) {
      lineAmt = Math.round((amount - allocated) * 100) / 100;
    } else {
      lineAmt = per;
      allocated += per;
    }
    return { description: desc, qty: 1, rate: lineAmt, amount: lineAmt };
  });
}

function buildInvoiceNumber(deal, date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const shortId = String(deal.id || '').replace(/-/g, '').slice(0, 4).toUpperCase() || '0001';
  return `INV-${y}${m}-${shortId}`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
