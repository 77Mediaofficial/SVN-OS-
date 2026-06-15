/* Data access layer.
   Every module talks to these repos, never to Supabase directly.
   - Real mode: Supabase Postgres behind RLS (user_id scoping).
   - Demo mode: localStorage with seeded sample data, so the whole app
     is explorable before credentials are wired in js/supabase.js. */

import { supabase, DEMO_MODE } from './supabase.js';
import { dayKey, todayKey } from './ui.js';

const LS_KEY = 'svnos-demo-v1';

let userId = null;
export function setUserId(id) { userId = id; }

/* ── Demo database ───────────────────────────────────────── */

let demoDb = null;

function demo() {
  if (demoDb) return demoDb;
  try { demoDb = JSON.parse(localStorage.getItem(LS_KEY)); } catch { demoDb = null; }
  if (!demoDb || !demoDb.projects) {
    demoDb = seedDemo();
    persistDemo();
  }
  // Backfill collections added after a dataset was first seeded.
  let patched = false;
  if (!demoDb.team) { demoDb.team = seedTeam(); patched = true; }
  if (!demoDb.clients) { demoDb.clients = seedClients(); patched = true; }
  if (patched) persistDemo();
  return demoDb;
}

function persistDemo() {
  localStorage.setItem(LS_KEY, JSON.stringify(demoDb));
}

export function resetDemo() {
  localStorage.removeItem(LS_KEY);
  demoDb = null;
}

const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function seedDemo() {
  const iso = (offsetDays, hour = 10) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const day = (offsetDays) => dayKey(new Date(Date.now() + offsetDays * 86400000));
  const stamp = (offsetDays) => iso(offsetDays, 9);

  const P = (offset, fields) => ({
    id: uuid(), user_id: 'demo-user', description: '', notes: '',
    tags: [], scheduled_at: null, published_at: null,
    created_at: stamp(offset), updated_at: stamp(offset), ...fields,
  });
  const projects = [
    P(-2,  { title: 'Studio tour — what £10k of kit actually buys', status: 'idea', platform: 'youtube', tags: ['studio', 'gear'] }),
    P(-1,  { title: '30 days of daily edits — announcement', status: 'idea', platform: 'tiktok', tags: ['series'] }),
    P(-6,  { title: 'Client story: full rebrand in six weeks', status: 'scripting', platform: 'youtube', scheduled_at: iso(9, 17), tags: ['case-study'] }),
    P(-4,  { title: 'How I price video projects', status: 'scripting', platform: 'podcast', scheduled_at: iso(12, 8) }),
    P(-9,  { title: 'Cinematic b-roll masterclass', status: 'production', platform: 'youtube', scheduled_at: iso(4, 17), tags: ['tutorial'] }),
    P(-3,  { title: 'BTS — charity gala film', status: 'production', platform: 'instagram', scheduled_at: iso(2, 12), tags: ['bts'] }),
    P(-8,  { title: 'Five lighting setups under £200', status: 'ready', platform: 'youtube', scheduled_at: iso(1, 17), tags: ['tutorial', 'gear'] }),
    P(-5,  { title: 'Reel — spring brand campaigns', status: 'ready', platform: 'instagram', scheduled_at: iso(0, 18), tags: ['showreel'] }),
    P(-20, { title: 'Why your edits feel slow', status: 'published', platform: 'youtube', scheduled_at: iso(-6, 17), published_at: iso(-6, 17) }),
    P(-30, { title: 'Colour grading start to finish', status: 'published', platform: 'youtube', scheduled_at: iso(-16, 17), published_at: iso(-16, 17), tags: ['tutorial'] }),
  ];

  const D = (offset, fields) => ({
    id: uuid(), user_id: 'demo-user', contact_name: '', contact_email: '',
    notes: '', tags: [], deadline: null,
    created_at: stamp(offset), updated_at: stamp(offset), ...fields,
  });
  const deals = [
    D(-3,  { brand_name: 'Aurora Audio', status: 'lead', value: 1200, deadline: day(21), contact_name: 'Mia Chen', contact_email: 'mia@auroraaudio.co', tags: ['audio'] }),
    D(-1,  { brand_name: 'Northbound Apparel', status: 'lead', value: 800, deadline: day(30), tags: ['fashion'] }),
    D(-12, { brand_name: 'Lumen Lighting Co.', status: 'negotiating', value: 2400, deadline: day(10), contact_name: 'Theo Marsh', contact_email: 'theo@lumen.co', tags: ['gear'] }),
    D(-18, { brand_name: 'Atlas Travel Gear', status: 'signed', value: 3200, deadline: day(5), contact_name: 'Priya Nair', contact_email: 'priya@atlastravel.com', tags: ['travel'] }),
    D(-26, { brand_name: 'Forma Furniture', status: 'delivered', value: 1800, deadline: day(-2), contact_name: 'Jon Ellis', contact_email: 'jon@forma.studio' }),
    D(-50, { brand_name: 'Kestrel Coffee', status: 'paid', value: 1500, deadline: day(-20), contact_name: 'Sam Reid', contact_email: 'sam@kestrel.coffee', tags: ['fmcg'] }),
  ];
  const dealId = (name) => deals.find((d) => d.brand_name === name).id;

  const T = (offset, fields) => ({
    id: uuid(), user_id: 'demo-user', description: '', category: 'other',
    occurred_at: day(offset), recurrence: 'none', recurrence_end: null,
    parent_transaction_id: null, deal_id: null,
    created_at: stamp(offset), updated_at: stamp(offset), ...fields,
  });
  const adsense = T(-60, { type: 'income', category: 'platform_revenue', description: 'YouTube AdSense payout', amount: 412, recurrence: 'monthly' });
  const adobe = T(-45, { type: 'expense', category: 'software', description: 'Adobe Creative Cloud', amount: 56.98, recurrence: 'monthly' });
  const transactions = [
    adsense,
    T(-30, { type: 'income', category: 'platform_revenue', description: 'YouTube AdSense payout', amount: 398, parent_transaction_id: adsense.id }),
    adobe,
    T(-40, { type: 'income', category: 'sponsorship', description: 'Lumen Lighting — pilot ad read', amount: 400, deal_id: dealId('Lumen Lighting Co.') }),
    T(-33, { type: 'expense', category: 'equipment', description: 'Sigma 24-70 f2.8', amount: 949 }),
    T(-25, { type: 'income', category: 'services', description: 'Wedding film — final balance', amount: 2200 }),
    T(-18, { type: 'income', category: 'sponsorship', description: 'Kestrel Coffee — campaign final payment', amount: 1500, deal_id: dealId('Kestrel Coffee') }),
    T(-12, { type: 'income', category: 'affiliate', description: 'Lens affiliate links', amount: 86 }),
    T(-9,  { type: 'expense', category: 'travel', description: 'Client shoot — fuel + parking', amount: 38.5 }),
    T(-8,  { type: 'income', category: 'sponsorship', description: 'Atlas Travel Gear — 50% upfront', amount: 1600, deal_id: dealId('Atlas Travel Gear') }),
    T(-7,  { type: 'expense', category: 'contractors', description: 'Second shooter — gala film', amount: 250 }),
    T(-4,  { type: 'income', category: 'merchandise', description: 'Preset pack sales', amount: 240 }),
    T(-3,  { type: 'expense', category: 'software', description: 'Frame.io seats', amount: 23 }),
    T(-2,  { type: 'expense', category: 'marketing', description: 'Instagram boost — reel', amount: 40 }),
  ];

  return {
    profile: { id: 'demo-user', username: 'demo', full_name: 'Demo Creator' },
    prefs: seedPrefs(),
    projects, deals, transactions,
    team: seedTeam(), clients: seedClients(),
  };
}

function seedPrefs() {
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);
  return {
    business_name: 'Demo Creator Studio',
    business_type: 'Video production',
    invoice_details: 'Studio 7, 100 Example Street\nLondon, United Kingdom\nPayments: Starling •• 1234 · sort 00-00-00\nTerms: Net 14',
    invoice_seq: 6,
    goal_monthly_revenue: 4000,
    goal_monthly_posts: 6,
    follower_history: seedFollowerHistory(),
    plan: 'studio', billing_cycle: 'monthly', plan_status: 'trial',
    trial_ends_at: trialEnds.toISOString(),
  };
}

/* ── Workspace: team & client accounts (demo) ─────────────────
   These make the app read as a multi-seat studio, not a solo tool.
   Real mode would back them with team_members / clients tables. */

function seedTeam() {
  const at = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const M = (name, role, email, d) => ({ id: uuid(), user_id: 'demo-user', name, role, email, created_at: at(d) });
  return [
    M('Demo Creator', 'owner',    'you@svnstudio.co',   120),
    M('Mara Voss',    'producer', 'mara@svnstudio.co',   90),
    M('Theo Lane',    'editor',   'theo@svnstudio.co',   62),
    M('Priya Raman',  'reviewer', 'priya@svnstudio.co',  41),
    M('Sam Okafor',   'finance',  'sam@svnstudio.co',    18),
  ];
}

function seedClients() {
  const at = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const C = (name, status, contact, d) => ({ id: uuid(), user_id: 'demo-user', name, status, contact, created_at: at(d) });
  return [
    C('Aurora Audio',       'active',   'Mia Chen',   80),
    C('Lumen Lighting Co.', 'active',   'Theo Marsh', 70),
    C('Atlas Travel Gear',  'active',   'Priya Nair', 60),
    C('Kestrel Coffee',     'retainer', 'Sam Reid',   50),
    C('Northbound Apparel', 'prospect', null,         10),
  ];
}

/* Six months of audience growth, anchored to the current month so
   the demo always reads as "now". Steady climb, not a straight line. */
function seedFollowerHistory() {
  const base = 8200;
  const growth = [0, 520, 980, 1500, 2180, 2820];
  const now = new Date();
  return growth.map((g, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (growth.length - 1 - i), 1);
    return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, count: base + g };
  });
}

/* ── Repositories ────────────────────────────────────────── */

function makeRepo(table, demoKey, { orderBy = 'created_at', ascending = false } = {}) {
  return {
    async list() {
      if (DEMO_MODE) return [...demo()[demoKey]];
      const { data, error } = await supabase
        .from(table).select('*')
        .order(orderBy, { ascending });
      if (error) throw error;
      return data;
    },

    async create(values) {
      if (DEMO_MODE) {
        const now = new Date().toISOString();
        const row = { id: uuid(), user_id: 'demo-user', created_at: now, updated_at: now, ...values };
        demo()[demoKey].unshift(row);
        persistDemo();
        return row;
      }
      const { data, error } = await supabase
        .from(table).insert({ ...values, user_id: userId })
        .select().single();
      if (error) throw error;
      return data;
    },

    async update(id, patch) {
      if (DEMO_MODE) {
        const row = demo()[demoKey].find((r) => r.id === id);
        if (!row) throw new Error('Row not found');
        Object.assign(row, patch, { updated_at: new Date().toISOString() });
        persistDemo();
        return row;
      }
      const { data, error } = await supabase
        .from(table).update(patch).eq('id', id)
        .select().single();
      if (error) throw error;
      return data;
    },

    async remove(id) {
      if (DEMO_MODE) {
        const rows = demo()[demoKey];
        const idx = rows.findIndex((r) => r.id === id);
        if (idx >= 0) rows.splice(idx, 1);
        persistDemo();
        return;
      }
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
  };
}

export const projects = makeRepo('content_projects', 'projects');
export const deals = makeRepo('brand_deals', 'deals');
export const transactions = makeRepo('transactions', 'transactions', { orderBy: 'occurred_at' });
export const team = makeRepo('team_members', 'team', { orderBy: 'created_at', ascending: true });
export const clients = makeRepo('clients', 'clients', { orderBy: 'created_at', ascending: true });

export async function getProfile() {
  if (DEMO_MODE) return { ...demo().profile };
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

export async function updateProfile(patch) {
  if (DEMO_MODE) {
    Object.assign(demo().profile, patch);
    persistDemo();
    return { ...demo().profile };
  }
  const { data, error } = await supabase
    .from('profiles').update(patch).eq('id', userId)
    .select().single();
  if (error) throw error;
  return data;
}

/* ── User preferences (business identity, goals, invoicing) ── */

const DEFAULT_PREFS = {
  business_name: '', business_type: '', invoice_details: '',
  invoice_seq: 0, goal_monthly_revenue: null, goal_monthly_posts: null,
  follower_history: [],
  // Subscription state. Billing is dormant: these only drive the plans UI
  // until a Stripe checkout endpoint is wired. Maps cleanly onto the eventual
  // user_preferences columns, so no extra table is needed.
  plan: 'studio', billing_cycle: 'monthly', plan_status: 'trial', trial_ends_at: null,
};

export async function getPrefs() {
  if (DEMO_MODE) {
    const db = demo();
    if (!db.prefs) { db.prefs = seedPrefs(); persistDemo(); } // older demo datasets
    // Backfill audience history for datasets seeded before it existed.
    if (!Array.isArray(db.prefs.follower_history) || !db.prefs.follower_history.length) {
      db.prefs.follower_history = seedFollowerHistory();
      persistDemo();
    }
    return { ...DEFAULT_PREFS, ...db.prefs };
  }
  const { data, error } = await supabase
    .from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_PREFS, ...(data || {}) };
}

export async function savePrefs(patch) {
  if (DEMO_MODE) {
    const db = demo();
    db.prefs = { ...(db.prefs || seedPrefs()), ...patch };
    persistDemo();
    return { ...db.prefs };
  }
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, ...patch })
    .select().single();
  if (error) throw error;
  return data;
}

/* ── Recurring transactions ──────────────────────────────────
   Parents carry recurrence ≠ 'none'; due occurrences are
   materialised as child rows whenever the app boots. */

function advance(dateStr, interval) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(y, m - 1, d);
  if (interval === 'weekly') next.setDate(next.getDate() + 7);
  else if (interval === 'monthly') next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return dayKey(next);
}

export async function expandRecurring() {
  const all = await transactions.list();
  const today = todayKey();
  const created = [];

  for (const parent of all.filter((t) => t.recurrence && t.recurrence !== 'none')) {
    const latest = all
      .filter((t) => t.parent_transaction_id === parent.id)
      .reduce((max, t) => (t.occurred_at > max ? t.occurred_at : max), parent.occurred_at);

    let next = advance(latest, parent.recurrence);
    while (
      next <= today &&
      (!parent.recurrence_end || next <= parent.recurrence_end) &&
      created.length < 36
    ) {
      created.push(await transactions.create({
        type: parent.type,
        category: parent.category,
        description: parent.description,
        amount: parent.amount,
        occurred_at: next,
        recurrence: 'none',
        parent_transaction_id: parent.id,
        deal_id: parent.deal_id ?? null,
      }));
      next = advance(next, parent.recurrence);
    }
  }
  return created;
}
