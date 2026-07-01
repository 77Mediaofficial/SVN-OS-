/* Data access layer.
   Every module talks to these repos, never to Supabase directly.
   - Real mode: Supabase Postgres behind RLS (user_id scoping).
   - Demo mode: localStorage with seeded sample data, so the whole app
     is explorable before credentials are wired in js/supabase.js. */

import { supabase, DEMO_MODE } from './supabase.js';
import { dayKey, todayKey } from './ui.js';
import { toast } from './toast.js';
import { enqueue, isOnline, setReplayHandler } from './outbox.js';

const LS_KEY = 'svnos-demo-v2';

let userId = null;
// `live` gates the data layer: true ONLY when real credentials are wired AND a real user
// is signed in. Guest ('guest') and no-creds demo both stay false → localStorage. This is
// what keeps the public site a frictionless showcase after credentials are pasted in.
let live = false;
export function setUserId(id) {
  userId = id;
  live = !DEMO_MODE && !!id && id !== 'guest';
}

/* ── Demo database ───────────────────────────────────────── */

let demoDb = null;

function demo() {
  if (demoDb) return demoDb;
  let raw = null;
  try { raw = localStorage.getItem(LS_KEY); demoDb = raw ? JSON.parse(raw) : null; }
  catch { demoDb = null; }
  if (!demoDb || !demoDb.projects) {
    // Preserve unparseable / old-schema data instead of silently overwriting it.
    if (raw) { try { localStorage.setItem(`${LS_KEY}-corrupt`, raw); } catch { /* ignore */ } }
    demoDb = seedDemo();
    persistDemoSafe();
  }
  // Backfill collections added after a dataset was first seeded.
  let patched = false;
  if (!demoDb.team) { demoDb.team = seedTeam(); patched = true; }
  if (!demoDb.clients) { demoDb.clients = seedClients(); patched = true; }
  if (!demoDb.gear) { demoDb.gear = seedGear(); patched = true; }
  if (!demoDb.sow_items || !demoDb.milestones || !demoDb.reviews) {
    const studio = seedStudio(demoDb.clients || []);
    if (!demoDb.sow_items) demoDb.sow_items = studio.sow_items;
    if (!demoDb.milestones) demoDb.milestones = studio.milestones;
    if (!demoDb.reviews) demoDb.reviews = studio.reviews;
    patched = true;
  }
  if (patched) persistDemoSafe();
  return demoDb;
}

let storageWarned = false;
function warnStorageOnce() {
  if (storageWarned) return;
  storageWarned = true;
  toast('Storage is full — changes won’t be saved.', 'error');
}

// 1B: persistDemo now THROWS on a quota / write-block so a write can roll back and
// report the failure instead of silently "succeeding". Non-critical callers (seeding,
// backfill, fire-and-forget writes) use persistDemoSafe, which degrades quietly —
// they have nothing to undo and must never break boot.
function persistDemo() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(demoDb));
  } catch (err) {
    console.warn('Could not persist demo state:', err);
    throw err;
  }
}

function persistDemoSafe() {
  try { persistDemo(); } catch { warnStorageOnce(); }
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
    tags: [], scheduled_at: null, published_at: null, owner: null,
    created_at: stamp(offset), updated_at: stamp(offset), ...fields,
  });
  const projects = [
    P(-2,  { title: 'Aurora Audio — flagship brand film', status: 'idea', platform: 'youtube', owner: 'Marcus', tags: ['client', 'brand-film'] }),
    P(-1,  { title: 'Lumen Lighting — product launch series', status: 'idea', platform: 'instagram', owner: 'Sarah', tags: ['client', 'launch'] }),
    P(-6,  { title: 'Atlas Travel Gear — hero campaign film', status: 'scripting', platform: 'youtube', scheduled_at: iso(9, 17), owner: 'Marcus', tags: ['client', 'campaign'] }),
    P(-4,  { title: 'Kestrel Coffee — retainer · July drop', status: 'scripting', platform: 'instagram', scheduled_at: iso(12, 8), owner: 'Sarah', tags: ['retainer'] }),
    P(-9,  { title: 'Forma Furniture — 6× product films', status: 'production', platform: 'youtube', scheduled_at: iso(4, 17), owner: 'Theo', tags: ['client', 'product'] }),
    P(-3,  { title: 'Northbound Apparel — SS campaign reel', status: 'production', platform: 'instagram', scheduled_at: iso(2, 12), owner: 'Theo', tags: ['client', 'fashion'] }),
    P(-8,  { title: 'Aurora Audio — 30s paid-social cut', status: 'ready', platform: 'instagram', scheduled_at: iso(1, 17), owner: 'Sarah', tags: ['client', 'social'] }),
    P(-5,  { title: 'Lumen Lighting — launch showreel', status: 'ready', platform: 'youtube', scheduled_at: iso(0, 18), owner: 'Theo', tags: ['client', 'showreel'] }),
    P(-20, { title: 'Kestrel Coffee — brand documentary', status: 'published', platform: 'youtube', scheduled_at: iso(-6, 17), published_at: iso(-6, 17), owner: 'Marcus', tags: ['client'] }),
    P(-30, { title: 'Atlas Travel Gear — launch teaser', status: 'published', platform: 'instagram', scheduled_at: iso(-16, 17), published_at: iso(-16, 17), owner: 'Theo', tags: ['client'] }),
  ];

  const D = (offset, fields) => ({
    id: uuid(), user_id: 'demo-user', contact_name: '', contact_email: '',
    notes: '', tags: [], deadline: null,
    created_at: stamp(offset), updated_at: stamp(offset), ...fields,
  });
  const deals = [
    D(-3,  { brand_name: 'Aurora Audio', status: 'lead', value: 14000, deadline: day(21), contact_name: 'Mia Chen', contact_email: 'mia@auroraaudio.co', tags: ['brand-film'] }),
    D(-1,  { brand_name: 'Northbound Apparel', status: 'lead', value: 9500, deadline: day(30), tags: ['fashion'] }),
    D(-12, { brand_name: 'Lumen Lighting Co.', status: 'negotiating', value: 22000, deadline: day(4), contact_name: 'Theo Marsh', contact_email: 'theo@lumen.co', tags: ['launch'] }),
    D(-18, { brand_name: 'Atlas Travel Gear', status: 'signed', value: 28000, deadline: day(-1), contact_name: 'Priya Nair', contact_email: 'priya@atlastravel.com', tags: ['campaign'] }),
    D(-26, { brand_name: 'Forma Furniture', status: 'delivered', value: 19500, deadline: day(-3), contact_name: 'Jon Ellis', contact_email: 'jon@forma.studio' }),
    D(-50, { brand_name: 'Kestrel Coffee', status: 'paid', value: 16000, deadline: day(-20), contact_name: 'Sam Reid', contact_email: 'sam@kestrel.coffee', tags: ['retainer'] }),
  ];
  const dealId = (name) => deals.find((d) => d.brand_name === name)?.id ?? null;

  const T = (offset, fields) => ({
    id: uuid(), user_id: 'demo-user', description: '', category: 'other',
    occurred_at: day(offset), recurrence: 'none', recurrence_end: null,
    parent_transaction_id: null, deal_id: null,
    created_at: stamp(offset), updated_at: stamp(offset), ...fields,
  });
  const adsense = T(-60, { type: 'income', category: 'platform_revenue', description: 'Channel management — brand partner', amount: 3200, recurrence: 'monthly' });
  const adobe = T(-40, { type: 'expense', category: 'software', description: 'Adobe CC (5 seats) + Frame.io + DaVinci', amount: 620, recurrence: 'monthly' });
  const transactions = [
    adsense,
    adobe,
    // This month — agency scale (£52k income / ~£12k costs)
    T(-2,  { type: 'income', category: 'services', description: 'Atlas Travel Gear — brand film, final balance', amount: 18500, deal_id: dealId('Atlas Travel Gear') }),
    T(-5,  { type: 'income', category: 'sponsorship', description: 'Lumen Lighting Co. — Q2 campaign films', amount: 12500, deal_id: dealId('Lumen Lighting Co.') }),
    T(-9,  { type: 'income', category: 'services', description: 'Kestrel Coffee — content retainer (June)', amount: 6500, deal_id: dealId('Kestrel Coffee') }),
    T(-14, { type: 'income', category: 'services', description: 'Forma Furniture — product launch series', amount: 10500, deal_id: dealId('Forma Furniture') }),
    T(-20, { type: 'income', category: 'platform_revenue', description: 'Channel management + ad share', amount: 4000 }),
    T(-3,  { type: 'expense', category: 'contractors', description: 'Freelance colourist — Atlas grade', amount: 2400 }),
    T(-7,  { type: 'expense', category: 'contractors', description: 'Second shooter + gaffer — Forma shoot', amount: 3200 }),
    T(-15, { type: 'expense', category: 'equipment', description: 'Sony FX6 — second body (deposit)', amount: 3200 }),
    T(-18, { type: 'expense', category: 'travel', description: 'Location + crew travel — Forma', amount: 1650 }),
    T(-22, { type: 'expense', category: 'marketing', description: 'Paid social — showreel boost', amount: 980 }),
    // Prior month — for the analytics trend line
    T(-38, { type: 'income', category: 'services', description: 'Northbound Apparel — SS campaign', amount: 14000 }),
    T(-44, { type: 'income', category: 'sponsorship', description: 'Retainer + brand films (May)', amount: 21000 }),
  ];

  const clients = seedClients();
  const studio = seedStudio(clients);
  return {
    profile: { id: 'demo-user', username: 'demo', full_name: 'Demo Creator' },
    prefs: seedPrefs(),
    projects, deals, transactions,
    team: seedTeam(), clients,
    sow_items: studio.sow_items, milestones: studio.milestones,
    gear: seedGear(), reviews: studio.reviews,
  };
}

function seedPrefs() {
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);
  return {
    business_name: 'Northlight Studio',
    business_type: 'Media production agency',
    invoice_details: 'Northlight Studio\n7 Garrick Yard, London EC1\nPayments: Starling •• 1234 · sort 00-00-00\nTerms: Net 14',
    invoice_seq: 42,
    goal_monthly_revenue: 55000,
    goal_monthly_posts: 12,
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
    M('Jordan Cole',  'owner',     'jordan@northlight.studio', 140),
    M('Marcus Vale',  'producer',  'marcus@northlight.studio',  95),
    M('Sarah Quinn',  'editor',    'sarah@northlight.studio',   68),
    M('Theo Lane',    'colourist', 'theo@northlight.studio',    50),
    M('Nadia Okafor', 'finance',   'nadia@northlight.studio',   24),
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

/* ── Studio: SOW / change orders, milestones, review room ─────
   The Studio & Agency pillars. Scope and milestones hang off a client;
   milestones gate delivery (files release on payment). Review comments
   pin to a timecode on a demo asset. Real mode → sow_items / milestones /
   review_comments tables. */

function seedStudio(clients) {
  const at = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const due = (d) => dayKey(new Date(Date.now() + d * 86400000));
  const cid = (i) => clients[i]?.id || 'demo-client';

  const S = (client_id, kind, label, qty, rate, d) =>
    ({ id: uuid(), user_id: 'demo-user', client_id, kind, label, qty, rate, created_at: at(d) });
  const sow_items = [
    S(cid(0), 'scope',  'Creative direction & pre-production',    1, 3500, 30),
    S(cid(0), 'scope',  'Principal photography (2-day shoot)',    2, 4500, 30),
    S(cid(0), 'scope',  'Edit, grade & sound — 3 review rounds',  1, 6500, 30),
    S(cid(0), 'change', 'Added 3× 30s cut-downs for paid social', 1, 2200, 8),
    S(cid(1), 'scope',  'Brand film + 20 finished stills',        1, 12000, 22),
    S(cid(1), 'scope',  'Studio hire & lighting package',         1, 3000, 22),
  ];

  const M = (client_id, label, amount, d, status) =>
    ({ id: uuid(), user_id: 'demo-user', client_id, label, amount, due: due(d), status, created_at: at(40) });
  const milestones = [
    M(cid(0), '40% production deposit',     8500, -12, 'paid'),
    M(cid(0), 'Rough-cut delivery',         6500, 3,   'invoiced'),
    M(cid(0), 'Final delivery & handover',  6200, 14,  'pending'),
    M(cid(1), 'Shoot deposit',              7500, -4,  'paid'),
    M(cid(1), 'Final gallery delivery',     7500, 9,   'pending'),
  ];

  const RC = (t, author, body, d, resolved = false) =>
    ({ id: uuid(), user_id: 'demo-user', asset: 'Aurora Audio — flagship brand film', duration_sec: 78, t_sec: t, author, body, resolved, created_at: at(d) });
  const reviews = [
    RC(4,  'Marcus Vale', 'Logo hold runs a beat long — trim ~10 frames.', 2),
    RC(22, 'Sarah Quinn', 'Lower-third reads “Aurura” — should be “Aurora”.', 2),
    RC(48, 'Theo Lane',   'Land the music swell on the hero shot here.', 1, true),
    RC(70, 'Marcus Vale', 'CTA card needs the new web address.', 1),
  ];

  return { sow_items, milestones, reviews };
}

function seedGear() {
  const at = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const G = (name, category, value, status, insured, assignee, d) =>
    ({ id: uuid(), user_id: 'demo-user', name, category, value, status, insured, assignee: assignee || null, created_at: at(d) });
  return [
    G('Sony FX6',           'camera',   6200, 'out',         true,  'Theo Lane', 120),
    G('Sigma 24-70 f2.8',   'lens',      949, 'available',   true,  null, 110),
    G('Aputure 600d Pro',   'lighting', 1100, 'out',         true,  'Marcus Vale', 90),
    G('Sennheiser MKH-416', 'audio',     820, 'available',   true,  null, 70),
    G('DJI RS 4 gimbal',    'grip',      480, 'maintenance', false, null, 40),
    G('MacBook Pro M3 Max', 'computer', 3500, 'available',   true,  null, 30),
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
      if (!live) return [...demo()[demoKey]];
      const { data, error } = await supabase
        .from(table).select('*')
        .order(orderBy, { ascending });
      if (error) throw error;
      return data;
    },

    async create(values) {
      if (!live) {
        const now = new Date().toISOString();
        const row = { id: uuid(), user_id: 'demo-user', created_at: now, updated_at: now, ...values };
        demo()[demoKey].unshift(row);
        persistDemoSafe();
        return row;
      }
      // Offline → queue the write with a stable client id and return optimistically;
      // online errors (RLS, constraints) still surface by throwing.
      if (!isOnline()) {
        const now = new Date().toISOString();
        const row = { id: uuid(), user_id: userId, created_at: now, updated_at: now, ...values };
        enqueue({ table, kind: 'create', values: { ...values, id: row.id, user_id: userId } });
        return row;
      }
      const { data, error } = await supabase
        .from(table).insert({ ...values, user_id: userId })
        .select().single();
      if (error) throw error;
      return data;
    },

    async createMany(list) {
      if (!list.length) return [];
      if (!live) {
        const now = new Date().toISOString();
        const rows = list.map((values) => ({ id: uuid(), user_id: 'demo-user', created_at: now, updated_at: now, ...values }));
        demo()[demoKey].unshift(...rows);
        persistDemoSafe(); // one write for the whole batch
        return rows;
      }
      const { data, error } = await supabase
        .from(table).insert(list.map((v) => ({ ...v, user_id: userId })))
        .select();
      if (error) throw error;
      return data;
    },

    async update(id, patch) {
      if (!live) {
        const row = demo()[demoKey].find((r) => r.id === id);
        if (!row) throw new Error('Row not found');
        const prev = { ...row };                        // snapshot for rollback
        Object.assign(row, patch, { updated_at: new Date().toISOString() });
        try {
          persistDemo();                                // 1B: throws if storage is full
        } catch (err) {
          Object.assign(row, prev);                     // keep in-memory state consistent with disk
          throw err;                                    // → optimistic() rolls the UI back + surfaces it
        }
        return row;
      }
      if (!isOnline()) {
        enqueue({ table, kind: 'update', id, patch });
        return { id, ...patch, updated_at: new Date().toISOString() };
      }
      const { data, error } = await supabase
        .from(table).update(patch).eq('id', id)
        .select().single();
      if (error) throw error;
      return data;
    },

    async remove(id) {
      if (!live) {
        const rows = demo()[demoKey];
        const idx = rows.findIndex((r) => r.id === id);
        if (idx >= 0) rows.splice(idx, 1);
        persistDemoSafe();
        return;
      }
      if (!isOnline()) { enqueue({ table, kind: 'remove', id }); return; }
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
export const sowItems = makeRepo('sow_items', 'sow_items', { orderBy: 'created_at', ascending: true });
export const milestones = makeRepo('milestones', 'milestones', { orderBy: 'created_at', ascending: true });
export const gear = makeRepo('gear', 'gear', { orderBy: 'created_at', ascending: true });
export const reviews = makeRepo('review_comments', 'reviews', { orderBy: 'created_at', ascending: true });

// Offline outbox: when connectivity returns, replay queued live-mode writes with RAW
// Supabase calls (NOT the repo wrappers) so a replay can never re-enqueue itself.
setReplayHandler(async (op) => {
  if (!supabase) return;
  if (op.kind === 'create') {
    const { error } = await supabase.from(op.table).insert(op.values);
    if (error) throw error;
  } else if (op.kind === 'update') {
    const { error } = await supabase.from(op.table).update(op.patch).eq('id', op.id);
    if (error) throw error;
  } else if (op.kind === 'remove') {
    const { error } = await supabase.from(op.table).delete().eq('id', op.id);
    if (error) throw error;
  }
});

export async function getProfile() {
  if (!live) return { ...demo().profile };
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

export async function updateProfile(patch) {
  if (!live) {
    Object.assign(demo().profile, patch);
    persistDemoSafe();
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
  if (!live) {
    const db = demo();
    if (!db.prefs) { db.prefs = seedPrefs(); persistDemoSafe(); } // older demo datasets
    // Backfill audience history for datasets seeded before it existed.
    if (!Array.isArray(db.prefs.follower_history) || !db.prefs.follower_history.length) {
      db.prefs.follower_history = seedFollowerHistory();
      persistDemoSafe();
    }
    return { ...DEFAULT_PREFS, ...db.prefs };
  }
  const { data, error } = await supabase
    .from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_PREFS, ...(data || {}) };
}

export async function savePrefs(patch) {
  if (!live) {
    const db = demo();
    db.prefs = { ...(db.prefs || seedPrefs()), ...patch };
    persistDemoSafe();
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
  const pending = [];

  for (const parent of all.filter((t) => t.recurrence && t.recurrence !== 'none')) {
    // Newest occurrence so far. Children share the parent's YYYY-MM-DD format,
    // so a lexical max is also the chronological max.
    let latest = parent.occurred_at;
    for (const t of all) {
      if (t.parent_transaction_id === parent.id && t.occurred_at > latest) latest = t.occurred_at;
    }

    // Materialise every due occurrence for THIS parent. Per-parent cap (not a
    // shared budget) so one long-dormant series can't starve the others.
    let next = advance(latest, parent.recurrence);
    let guard = 0;
    while (
      next <= today &&
      (!parent.recurrence_end || next <= parent.recurrence_end) &&
      guard < 60
    ) {
      pending.push({
        type: parent.type,
        category: parent.category,
        description: parent.description,
        amount: parent.amount,
        occurred_at: next,
        recurrence: 'none',
        parent_transaction_id: parent.id,
        deal_id: parent.deal_id ?? null,
      });
      next = advance(next, parent.recurrence);
      guard += 1;
    }
  }

  // One batched write instead of a whole-DB serialize per occurrence.
  return transactions.createMany(pending);
}
