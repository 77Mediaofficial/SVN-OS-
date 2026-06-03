import { db } from '../supabase.js';

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows, columns) {
  const header = columns.map(c => csvEscape(c.label)).join(',');
  const body = rows.map(row =>
    columns.map(c => csvEscape(typeof c.value === 'function' ? c.value(row) : row[c.value])).join(',')
  );
  return [header, ...body].join('\n');
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

export async function exportTransactionsCsv() {
  const { data, error } = await db
    .from('transactions')
    .select('date, type, category, amount, currency, description, deal_id, created_at')
    .order('date', { ascending: false });
  if (error) throw error;

  const csv = rowsToCsv(data || [], [
    { label: 'Date', value: 'date' },
    { label: 'Type', value: 'type' },
    { label: 'Category', value: 'category' },
    { label: 'Amount', value: 'amount' },
    { label: 'Currency', value: 'currency' },
    { label: 'Description', value: 'description' },
    { label: 'Linked Deal ID', value: 'deal_id' },
    { label: 'Created At', value: 'created_at' },
  ]);

  downloadCsv(`svn-os-transactions-${dateStamp()}.csv`, csv);
  return (data || []).length;
}

export async function exportDealsCsv() {
  const { data, error } = await db
    .from('brand_deals')
    .select('brand_name, contact_name, contact_email, status, value, currency, deliverables, deadline, notes, tags, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const csv = rowsToCsv(data || [], [
    { label: 'Brand', value: 'brand_name' },
    { label: 'Contact Name', value: 'contact_name' },
    { label: 'Contact Email', value: 'contact_email' },
    { label: 'Status', value: 'status' },
    { label: 'Value', value: 'value' },
    { label: 'Currency', value: 'currency' },
    { label: 'Deliverables', value: 'deliverables' },
    { label: 'Deadline', value: 'deadline' },
    { label: 'Notes', value: 'notes' },
    { label: 'Tags', value: (row) => Array.isArray(row.tags) ? row.tags.join('|') : '' },
    { label: 'Created At', value: 'created_at' },
  ]);

  downloadCsv(`svn-os-deals-${dateStamp()}.csv`, csv);
  return (data || []).length;
}

export async function exportContentCsv() {
  const { data, error } = await db
    .from('content_projects')
    .select('title, status, platform, description, scheduled_at, published_at, notes, tags, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const csv = rowsToCsv(data || [], [
    { label: 'Title', value: 'title' },
    { label: 'Status', value: 'status' },
    { label: 'Platform', value: 'platform' },
    { label: 'Description', value: 'description' },
    { label: 'Scheduled At', value: 'scheduled_at' },
    { label: 'Published At', value: 'published_at' },
    { label: 'Notes', value: 'notes' },
    { label: 'Tags', value: (row) => Array.isArray(row.tags) ? row.tags.join('|') : '' },
    { label: 'Created At', value: 'created_at' },
    { label: 'Updated At', value: 'updated_at' },
  ]);

  downloadCsv(`svn-os-content-${dateStamp()}.csv`, csv);
  return (data || []).length;
}
