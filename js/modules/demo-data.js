import { db, getCurrentUser } from '../supabase.js';

const DEMO_MARKER = '[demo]';

const DEMO_CONTENT = [
  { title: 'Quarterly brand campaign — concept',  status: 'idea',       platform: 'youtube',   description: 'Master concept deck for the Q2 campaign', notes: 'Open with a montage of best moments', tags: ['campaign', 'q2'] },
  { title: 'Client onboarding film — script',     status: 'scripting',  platform: 'other',     description: 'Voiceover script for the welcome video', tags: ['client-work'] },
  { title: 'Studio tour walkthrough',             status: 'production', platform: 'youtube',   description: 'Behind-the-scenes of the new space', tags: ['brand'] },
  { title: 'Product photography set',             status: 'ready',      platform: 'instagram', description: 'Carousel set for the launch', tags: ['launch'] },
  { title: 'Case study — Acme Studio rebrand',    status: 'posted',     platform: 'blog',      description: 'Long-form case study post', tags: ['portfolio', 'evergreen'] },
  { title: 'Newsletter — Issue #14',              status: 'idea',       platform: 'other',     description: 'Subscriber digest with project highlights', tags: ['newsletter'] },
];

const DEMO_DEALS = [
  { brand_name: 'Aperture Studio',     contact_name: 'Mia Chen',      contact_email: 'mia@aperture.example',  status: 'signed',      value: 4500, deliverables: 'Full campaign — concept, shoot, edit', deadline_days: 21, tags: ['retainer', 'q2'] },
  { brand_name: 'Nordic Coffee Co.',   contact_name: 'Erik Sondheim', contact_email: 'erik@nordic.example',   status: 'negotiating', value: 2200, deliverables: 'Brand video + photo set',             deadline_days: 12, tags: ['recurring'] },
  { brand_name: 'Folio Notebooks',     contact_name: 'Priya Rao',     contact_email: 'priya@folio.example',   status: 'in_progress', value: 1800, deliverables: 'Product launch package',              deadline_days:  5, tags: ['launch'] },
  { brand_name: 'Stratus Consulting',  contact_name: 'Jordan Kim',    contact_email: 'jordan@stratus.example',status: 'lead',        value: 6000, deliverables: 'Scope TBD — kickoff next week',       deadline_days: 45, tags: ['inbound'] },
  { brand_name: 'Loop Audio',          contact_name: 'Sam Patel',     contact_email: 'sam@loop.example',      status: 'completed',   value: 3200, deliverables: 'Brand film, two cut-downs',           deadline_days:-10, tags: ['repeat-client'] },
];

const DEMO_TRANSACTIONS = [
  { type: 'income',  category: 'sponsorship', amount: 4500,    description: 'Aperture Studio — Q2 retainer', days_ago: 3,  link_brand: 'Aperture Studio' },
  { type: 'income',  category: 'freelance',   amount: 1240.55, description: 'Independent freelance project',  days_ago: 8 },
  { type: 'income',  category: 'subscription',amount: 312.40,  description: 'Monthly retainer payment',       days_ago: 14 },
  { type: 'income',  category: 'sponsorship', amount: 3200,    description: 'Loop Audio — final invoice',    days_ago: 22, link_brand: 'Loop Audio' },
  { type: 'expense', category: 'software',    amount: 49,      description: 'Editing suite — monthly',        days_ago: 5 },
  { type: 'expense', category: 'equipment',   amount: 280,     description: 'Lens rental',                    days_ago: 11 },
  { type: 'expense', category: 'contractor',  amount: 600,     description: 'Freelance editor — 1 day',       days_ago: 18 },
  { type: 'expense', category: 'travel',      amount: 145.20,  description: 'Travel to client shoot',         days_ago: 26 },
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
