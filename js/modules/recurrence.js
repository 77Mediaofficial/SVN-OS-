import { db } from '../supabase.js';

const MAX_GENERATED_PER_PARENT = 24;

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(str) {
  return new Date(str + 'T00:00:00');
}

function addInterval(date, recurrence) {
  const d = new Date(date.getTime());
  if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
  else if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (recurrence === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d;
}

/**
 * Given the loaded transactions list, find every recurring parent
 * and insert any missing past occurrences up to today (capped at
 * MAX_GENERATED_PER_PARENT per parent).
 *
 * Returns true if any new rows were inserted (caller can re-fetch).
 */
export async function rolloverRecurringTransactions(transactions) {
  const parents = transactions.filter(t =>
    t.recurrence && t.recurrence !== 'none' && !t.parent_transaction_id
  );
  if (parents.length === 0) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rowsToInsert = [];

  for (const parent of parents) {
    const series = transactions.filter(t =>
      t.id === parent.id || t.parent_transaction_id === parent.id
    );

    const latest = series.reduce((max, t) => {
      const d = parseDate(t.date);
      return d > max ? d : max;
    }, parseDate(parent.date));

    const endDate = parent.recurrence_end_date ? parseDate(parent.recurrence_end_date) : null;

    let next = addInterval(latest, parent.recurrence);
    let added = 0;

    while (next <= today && added < MAX_GENERATED_PER_PARENT) {
      if (endDate && next > endDate) break;

      rowsToInsert.push({
        user_id: parent.user_id,
        type: parent.type,
        category: parent.category,
        amount: parent.amount,
        currency: parent.currency || 'USD',
        description: parent.description,
        date: isoDate(next),
        deal_id: parent.deal_id || null,
        recurrence: 'none',
        parent_transaction_id: parent.id,
      });

      next = addInterval(next, parent.recurrence);
      added++;
    }
  }

  if (rowsToInsert.length === 0) return false;

  const { error } = await db.from('transactions').insert(rowsToInsert);
  if (error) {
    // The unique index will reject any duplicates from a concurrent run.
    // Treat that as a no-op rather than surfacing it.
    if (error.code !== '23505') {
      throw error;
    }
  }

  return true;
}

export function describeRecurrence(t) {
  if (!t.recurrence || t.recurrence === 'none') return null;
  if (t.parent_transaction_id) return 'recurring';
  return `every ${t.recurrence.replace('ly', '')}`.replace('every week', 'weekly').replace('every month', 'monthly').replace('every year', 'yearly');
}
