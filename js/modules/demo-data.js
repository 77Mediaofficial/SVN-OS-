import { db, getCurrentUser } from '../supabase.js';

const DEMO_MARKER = '[demo]';

const DEMO_CONTENT = [
  { title: 'Year in Review 2026', status: 'idea', platform: 'youtube', description: 'Top moments and biggest wins from the year', notes: 'Open with a montage of best clips', tags: ['evergreen', 'series'] },
  { title: 'Morning Routine Reset', status: 'scripting', platform: 'tiktok', description: '60-second guide to a focused morning', tags: ['shorts', 'lifestyle'] },
  { title: 'Studio Tour Walkthrough', status: 'production', platform: 'youtube', description: 'Full tour of the new workspace', tags: ['behind-the-scenes'] },
  { title: 'Lighting Setup Guide', status: 'ready', platform: 'instagram', description: 'Carousel post breaking down the 3-point setup', tags: ['tutorial'] },
  { title: 'Productivity Stack 2026', status: 'posted', platform: 'youtube', description: 'Tools and apps I use daily', tags: ['tutorial', 'evergreen'] },
  { title: 'Behind the Scenes', status: 'idea', platform: 'twitter', description: 'Thread on the editing process', tags: ['thread'] },
];

const DEMO_DEALS = [
  { brand_name: 'Aperture Optics', contact_name: 'Mia Chen', contact_email: 'mia@aperture.example', status: 'signed', value: 4500, deliverables: '1x dedicated video, 2x story posts', deadline_days: 21, tags: ['exclusive', 'q2-2026'] },
  { brand_name: 'Nordic Coffee Co.', contact_name: 'Erik Sondheim', contact_email: 'erik@nordic.example', status: 'negotiating', value: 2200, deliverables: 'Integration in main video', deadline_days: 12, tags: ['recurring'] },
  { brand_name: 'Folio Notebooks', contact_name: 'Priya Rao', contact_email: 'priya@folio.example', status: 'in_progress', value: 1800, deliverables: 'Unboxing + review', deadline_days: 5, tags: ['short-term'] },
  { brand_name: 'Stratus Cloud', contact_name: 'Jordan Kim', contact_email: 'jordan@stratus.example', status: 'lead', value: 6000, deliverables: 'TBD', deadline_days: 45, tags: ['inbound'] },
  { brand_name: 'Loop Headphones', contact_name: 'Sam Patel', contact_email: 'sam@loop.example', status: 'completed', value: 3200, deliverables: 'Dedicated review video', deadline_days: -10, tags: ['repeat-client'] },
];

const DEMO_TRANSACTIONS = [
  { type: 'income', category: 'sponsorship', amount: 4500, description: 'Aperture Optics — Q2 deliverable', days_ago: 3, link_brand: 'Aperture Optics' },
  { type: 'income', category: 'ad_revenue', amount: 1240.55, description: 'YouTube AdSense payout', days_ago: 8 },
  { type: 'income', category: 'merch', amount: 312.40, description: 'Merch store — March', days_ago: 14 },
  { type: 'income', category: 'sponsorship', amount: 3200, description: 'Loop Headphones — final payment', days_ago: 22, link_brand: 'Loop Headphones' },
  { type: 'expense', category: 'software', amount: 49, description: 'Editing suite — monthly', days_ago: 5 },
  { type: 'expense', category: 'equipment', amount: 280, description: 'New microphone windscreen', days_ago: 11 },
  { type: 'expense', category: 'contractor', amount: 600, description: 'Thumbnail designer — 4 thumbnails', days_ago: 18 },
  { type: 'expense', category: 'travel', amount: 145.20, description: 'Coffee shop co-working', days_ago: 26 },
];

function isoDateOffset(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function isoTimestampOffset(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

export async function hasAnyUserData() {
  const [c, d, t] = await Promise.all([
    db.from('content_projects').select('id', { count: 'exact', head: true }),
    db.from('brand_deals').select('id', { count: 'exact', head: true }),
    db.from('transactions').select('id', { count: 'exact', head: true }),
  ]);
  return (c.count || 0) + (d.count || 0) + (t.count || 0) > 0;
}

export async function seedDemoData() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not signed in');

  const contentRows = DEMO_CONTENT.map((c, i) => ({
    user_id: user.id,
    title: c.title,
    description: c.description,
    status: c.status,
    platform: c.platform,
    notes: `${DEMO_MARKER} ${c.notes || ''}`.trim(),
    scheduled_at: c.status === 'ready' || c.status === 'idea'
      ? isoTimestampOffset(7 + i * 2)
      : null,
    published_at: c.status === 'posted' ? isoTimestampOffset(-10) : null,
    tags: c.tags || [],
  }));

  const { error: contentErr } = await db.from('content_projects').insert(contentRows);
  if (contentErr) throw contentErr;

  const dealRows = DEMO_DEALS.map((d) => ({
    user_id: user.id,
    brand_name: d.brand_name,
    contact_name: d.contact_name,
    contact_email: d.contact_email,
    status: d.status,
    value: d.value,
    currency: 'USD',
    deliverables: d.deliverables,
    deadline: isoDateOffset(d.deadline_days),
    notes: DEMO_MARKER,
    tags: d.tags || [],
  }));

  const { data: insertedDeals, error: dealErr } = await db
    .from('brand_deals')
    .insert(dealRows)
    .select('id, brand_name');
  if (dealErr) throw dealErr;

  const dealIdByBrand = Object.fromEntries((insertedDeals || []).map(d => [d.brand_name, d.id]));

  const txRows = DEMO_TRANSACTIONS.map((t) => ({
    user_id: user.id,
    type: t.type,
    category: t.category,
    amount: t.amount,
    currency: 'USD',
    description: `${DEMO_MARKER} ${t.description}`,
    date: isoDateOffset(-t.days_ago),
    deal_id: t.link_brand ? (dealIdByBrand[t.link_brand] || null) : null,
  }));

  const { error: txErr } = await db.from('transactions').insert(txRows);
  if (txErr) throw txErr;

  return {
    content: contentRows.length,
    deals: dealRows.length,
    transactions: txRows.length,
  };
}

export async function clearDemoData() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not signed in');

  const [txRes, dealRes, contentRes] = await Promise.all([
    db.from('transactions').delete().like('description', `${DEMO_MARKER}%`),
    db.from('brand_deals').delete().eq('notes', DEMO_MARKER),
    db.from('content_projects').delete().like('notes', `${DEMO_MARKER}%`),
  ]);

  if (txRes.error) throw txRes.error;
  if (dealRes.error) throw dealRes.error;
  if (contentRes.error) throw contentRes.error;
}
