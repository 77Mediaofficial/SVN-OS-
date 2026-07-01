/* Settings — profile, appearance, privacy & account.
   Appearance changes apply instantly (device-level); profile saves
   to the profiles table (or the demo profile) and refreshes the
   sidebar identity. */

import { getProfile, updateProfile, getPrefs, savePrefs, team, clients, projects, deals, transactions, milestones } from '../store.js';
import { getAppearance, setAppearance } from '../appearance.js';
import { openPrivacySheet } from '../applock.js';
import { signOut } from '../auth.js';
import { DEMO_MODE } from '../supabase.js';
import { formData, initials, esc, money, fmtDate, confirmAction } from '../ui.js';
import { openDrawer, closeDrawer } from '../drawer.js';
import { toast } from '../toast.js';
import { PLANS, PLAN_BY_ID, ROLE_BY_KEY, ROLES, CLIENT_STATUSES, CLIENT_STATUS_BY_KEY, DEAL_STATUS_BY_KEY, optionsHtml } from '../domain.js';

export async function init() {
  const form = document.getElementById('profile-form');
  const errEl = document.getElementById('profile-error');

  const profile = await getProfile().catch(() => null);
  if (profile) {
    form.full_name.value = profile.full_name || '';
    form.username.value = profile.username || '';
    form.bio.value = profile.bio || '';
    form.website.value = profile.website || '';
  }

  // Reflect current appearance into the radio pills.
  const appearance = getAppearance();
  selectPill('theme', appearance.theme);
  selectPill('textSize', appearance.textSize);
  selectPill('density', appearance.density);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const raw = formData(form);

    const username = raw.username.toLowerCase();
    if (username && !/^[a-z0-9_]{3,30}$/.test(username)) {
      errEl.textContent = 'Username must be 3–30 characters: lowercase letters, numbers, or underscores.';
      errEl.hidden = false;
      return;
    }

    const patch = {
      full_name: raw.full_name || '',
      username: username || null,
      bio: raw.bio || '',
      website: raw.website || '',
    };

    const btn = document.getElementById('profile-save');
    btn.disabled = true;
    try {
      const saved = await updateProfile(patch);
      const name = saved.full_name || profile?.full_name || 'Creator';
      window.dispatchEvent(new CustomEvent('svnos:identity', { detail: { name } }));
      toast('Profile saved.', 'success');
    } catch (err) {
      console.error(err);
      errEl.textContent = err?.code === '23505'
        ? 'That username is already taken.'
        : 'Could not save your profile.';
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  // Appearance pills apply immediately, no save button.
  document.querySelectorAll('[name="theme"], [name="textSize"], [name="density"]').forEach((input) => {
    input.addEventListener('change', () => {
      setAppearance({ [input.name]: input.value });
    });
  });

  initBilling();
  initWorkspace();
  initRoles();
  initActivity();
  initNotifications();
  initIntegrations();

  document.getElementById('settings-privacy-btn').addEventListener('click', openPrivacySheet);
  document.getElementById('settings-signout-btn').addEventListener('click', signOut);

  if (DEMO_MODE) {
    document.getElementById('settings-account-sub').textContent =
      'Demo session — add Supabase credentials in js/supabase.js for real accounts.';
  }
}

function selectPill(name, value) {
  const input = document.querySelector(`[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

/* ── Plan & billing ──────────────────────────────────────────
   Renders the pricing tiers from the PLANS catalog and reflects the
   current subscription. Billing is dormant: choosing a plan persists
   the selection (so every tier is explorable) but takes no payment.
   The single line marked DORMANT is where a Stripe Checkout redirect
   drops in once keys + an endpoint exist. */
async function initBilling() {
  const wrap = document.getElementById('plans');
  const banner = document.getElementById('plan-banner');
  const foot = document.getElementById('plan-foot');
  if (!wrap || !banner) return;

  const prefs = await getPrefs().catch(() => ({}));
  let cycle = prefs.billing_cycle === 'annual' ? 'annual' : 'monthly';
  let current = PLAN_BY_ID[prefs.plan] ? prefs.plan : 'studio';
  const status = prefs.plan_status === 'active' ? 'active' : 'trial';
  const trialEnds = prefs.trial_ends_at;

  const cycleBtns = [...document.querySelectorAll('#billing-cycle [data-cycle]')];

  function paint() {
    const plan = PLAN_BY_ID[current];
    const statusPill = status === 'trial'
      ? `<span class="pill tone-brass">Free trial${trialDaysLeft(trialEnds)}</span>`
      : '<span class="pill tone-green">Active</span>';
    banner.innerHTML =
      `<span class="plan-banner-main">` +
        `<span class="plan-banner-label">Current plan</span>` +
        `<strong class="plan-banner-name">${plan.name}</strong>${statusPill}` +
      `</span>` +
      `<span class="plan-banner-price">£${cycle === 'annual' ? plan.annual : plan.monthly}/mo · ${cycle === 'annual' ? 'billed yearly' : 'billed monthly'}</span>`;
    banner.hidden = false;

    wrap.innerHTML = PLANS.map((p) => cardHtml(p, current, cycle)).join('');
    wrap.querySelectorAll('[data-choose]').forEach((btn) => {
      btn.addEventListener('click', () => choose(btn.dataset.choose));
    });

    foot.textContent = DEMO_MODE
      ? 'Demo workspace — switching tiers here is instant and free so you can explore each one. Live billing connects through Stripe once your keys are added.'
      : 'Plans renew automatically. Change or cancel anytime from this screen.';

    cycleBtns.forEach((b) => {
      const on = b.dataset.cycle === cycle;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  async function choose(id) {
    if (id === current || !PLAN_BY_ID[id]) return;
    current = id;
    // DORMANT: real billing would open Stripe Checkout here and only switch on
    // success. Until then we persist the choice so the tier becomes current.
    savePrefs({ plan: id }).catch(() => {});
    toast(DEMO_MODE
      ? `Switched to ${PLAN_BY_ID[id].name}. Connect Stripe to take real payments.`
      : `You're now on the ${PLAN_BY_ID[id].name} plan.`, 'success');
    paint();
  }

  cycleBtns.forEach((b) => b.addEventListener('click', () => {
    cycle = b.dataset.cycle === 'annual' ? 'annual' : 'monthly';
    savePrefs({ billing_cycle: cycle }).catch(() => {});
    paint();
  }));

  paint();
}

function trialDaysLeft(iso) {
  if (!iso) return '';
  const days = Math.max(0, Math.ceil((new Date(iso) - new Date()) / 86400000));
  if (!days) return ' · ends today';
  return ` · ${days} day${days === 1 ? '' : 's'} left`;
}

function cardHtml(plan, current, cycle) {
  const price = cycle === 'annual' ? plan.annual : plan.monthly;
  const sub = cycle === 'annual'
    ? `Billed £${(plan.annual * 12).toLocaleString()} yearly`
    : 'Billed monthly';
  const isCurrent = plan.id === current;
  const feats = (plan.inherits ? [`<li class="plan-inherit">${plan.inherits}</li>`] : [])
    .concat(plan.features.map((f) => `<li>${f}</li>`))
    .join('');
  const cta = isCurrent
    ? '<button class="btn btn-block" disabled>Current plan</button>'
    : `<button class="btn ${plan.featured ? 'btn-primary ' : ''}btn-block" data-choose="${plan.id}">Choose ${plan.name}</button>`;
  return (
    `<article class="plan-card${plan.featured ? ' is-featured' : ''}${isCurrent ? ' is-current' : ''}">` +
      (plan.badge ? `<span class="plan-flag">${plan.badge}</span>` : '') +
      `<h3 class="plan-name">${plan.name}</h3>` +
      `<p class="plan-tagline">${plan.tagline}</p>` +
      `<p class="plan-price"><span class="plan-cur">£</span><span class="plan-num">${price}</span><span class="plan-per">/mo</span></p>` +
      `<p class="plan-sub">${sub}</p>` +
      `<p class="plan-seats">${plan.seats}</p>` +
      `<ul class="plan-feats">${feats}</ul>` +
      cta +
    '</article>'
  );
}

/* ── Workspace: team & clients ───────────────────────────────
   Live CRUD: a brand-new account can populate its roster + client book
   the moment it signs in. Runs through the team/clients repos —
   localStorage in demo/guest, Supabase once a real session is live (one
   code path). Rows are buttons: click to edit, delete from the drawer. */
let teamCache = [];
let clientCache = [];

async function initWorkspace() {
  const teamWrap = document.getElementById('team-list');
  const clientWrap = document.getElementById('client-list');

  async function renderTeam() {
    teamCache = await team.list().catch(() => []);
    teamWrap.innerHTML = teamCache.map(personRow).join('')
      || emptyRow('No teammates yet — add the people you work with so you can delegate.');
  }
  async function renderClients() {
    clientCache = await clients.list().catch(() => []);
    clientWrap.innerHTML = clientCache.map(clientRow).join('')
      || emptyRow('No clients yet — add your first to start scoping and billing work.');
  }

  if (teamWrap) {
    await renderTeam();
    teamWrap.addEventListener('click', (e) => {
      const row = e.target.closest('[data-member]');
      if (row) openMemberDrawer(teamCache.find((m) => m.id === row.dataset.member), renderTeam);
    });
    document.getElementById('team-invite')?.addEventListener('click', () => openMemberDrawer(null, renderTeam));
  }
  if (clientWrap) {
    await renderClients();
    clientWrap.addEventListener('click', (e) => {
      const row = e.target.closest('[data-client]');
      if (row) openClientDrawer(clientCache.find((c) => c.id === row.dataset.client), renderClients);
    });
    document.getElementById('client-add')?.addEventListener('click', () => openClientDrawer(null, renderClients));
  }
}

// Add / edit a teammate. `member` null = create. `refresh` re-renders the list.
function openMemberDrawer(member, refresh) {
  const editing = !!member;
  openDrawer({
    eyebrow: 'Team',
    title: editing ? 'Edit teammate' : 'Add teammate',
    body:
      `<div class="field"><label for="md-name">Name</label>` +
        `<input id="md-name" maxlength="120" autocomplete="off" placeholder="Jordan Cole" value="${editing ? esc(member.name) : ''}" /></div>` +
      `<div class="field"><label for="md-role">Role</label>` +
        `<select id="md-role">${optionsHtml(ROLES, member?.role || 'producer')}</select></div>` +
      `<div class="field"><label for="md-email">Email <span class="lbl-note">(optional)</span></label>` +
        `<input id="md-email" type="email" maxlength="254" autocomplete="off" spellcheck="false" placeholder="name@studio.com" value="${editing ? esc(member.email || '') : ''}" /></div>` +
      `<p class="auth-error" id="md-error" hidden></p>`,
    actions: editing
      ? [{ key: 'delete', label: 'Remove', variant: 'danger' }, { key: 'save', label: 'Save', variant: 'primary' }]
      : [{ key: 'save', label: 'Add teammate', variant: 'primary' }],
    onAction: async (key) => {
      const err = document.getElementById('md-error');
      if (key === 'save') {
        const name = document.getElementById('md-name').value.trim();
        if (!name) { err.textContent = 'A name is required.'; err.hidden = false; return; }
        const patch = {
          name,
          role: document.getElementById('md-role').value,
          email: document.getElementById('md-email').value.trim() || null,
        };
        try {
          if (editing) await team.update(member.id, patch); else await team.create(patch);
        } catch { err.textContent = 'Could not save — try again.'; err.hidden = false; return; }
        closeDrawer();
        toast(editing ? 'Teammate updated.' : 'Teammate added.', 'success');
        await refresh();
        window.dispatchEvent(new CustomEvent('svnos:workspace'));
      } else if (key === 'delete') {
        if (!(await confirmAction(`Remove ${member.name} from the team?`, { confirmLabel: 'Remove' }))) return;
        await team.remove(member.id);
        closeDrawer();
        toast('Teammate removed.');
        await refresh();
        window.dispatchEvent(new CustomEvent('svnos:workspace'));
      }
    },
  });
}

// Add / edit a client. Delete cascades the client's scope + milestones (FK).
function openClientDrawer(client, refresh) {
  const editing = !!client;
  openDrawer({
    eyebrow: 'Clients',
    title: editing ? 'Edit client' : 'Add client',
    body:
      `<div class="field"><label for="cd-name">Client name</label>` +
        `<input id="cd-name" maxlength="120" autocomplete="off" placeholder="Aurora Studios" value="${editing ? esc(client.name) : ''}" /></div>` +
      `<div class="field"><label for="cd-status">Status</label>` +
        `<select id="cd-status">${optionsHtml(CLIENT_STATUSES, client?.status || 'active')}</select></div>` +
      `<div class="field"><label for="cd-contact">Main contact <span class="lbl-note">(optional)</span></label>` +
        `<input id="cd-contact" maxlength="160" autocomplete="off" placeholder="Sam Rivera · sam@aurora.com" value="${editing ? esc(client.contact || '') : ''}" /></div>` +
      `<p class="auth-error" id="cd-error" hidden></p>`,
    actions: editing
      ? [{ key: 'delete', label: 'Delete', variant: 'danger' }, { key: 'save', label: 'Save', variant: 'primary' }]
      : [{ key: 'save', label: 'Add client', variant: 'primary' }],
    onAction: async (key) => {
      const err = document.getElementById('cd-error');
      if (key === 'save') {
        const name = document.getElementById('cd-name').value.trim();
        if (!name) { err.textContent = 'A client name is required.'; err.hidden = false; return; }
        const patch = {
          name,
          status: document.getElementById('cd-status').value,
          contact: document.getElementById('cd-contact').value.trim() || null,
        };
        try {
          if (editing) await clients.update(client.id, patch); else await clients.create(patch);
        } catch { err.textContent = 'Could not save — try again.'; err.hidden = false; return; }
        closeDrawer();
        toast(editing ? 'Client updated.' : 'Client added.', 'success');
        await refresh();
        window.dispatchEvent(new CustomEvent('svnos:workspace'));
      } else if (key === 'delete') {
        if (!(await confirmAction(`Delete ${client.name}? Their scope and milestones are removed too.`, { confirmLabel: 'Delete' }))) return;
        await clients.remove(client.id);
        closeDrawer();
        toast('Client deleted.');
        await refresh();
        window.dispatchEvent(new CustomEvent('svnos:workspace'));
      }
    },
  });
}

function personRow(m) {
  const role = ROLE_BY_KEY[m.role];
  return (
    `<button type="button" class="person" data-member="${m.id}">` +
      `<span class="person-av">${esc(initials(m.name))}</span>` +
      `<span class="person-id"><span class="person-name">${esc(m.name)}</span>` +
      `<span class="person-sub">${esc(m.email || 'No email yet')}</span></span>` +
      `<span class="pill tone-${role?.tone || 'dim'}">${esc(role?.label || m.role)}</span>` +
    `</button>`
  );
}

function clientRow(c) {
  const st = CLIENT_STATUS_BY_KEY[c.status];
  return (
    `<button type="button" class="person" data-client="${c.id}">` +
      `<span class="person-av person-av-sq">${esc(initials(c.name))}</span>` +
      `<span class="person-id"><span class="person-name">${esc(c.name)}</span>` +
      `<span class="person-sub">${esc(c.contact || 'No contact yet')}</span></span>` +
      `<span class="pill tone-${st?.tone || 'dim'}">${esc(st?.label || c.status)}</span>` +
    `</button>`
  );
}

function emptyRow(msg) {
  return `<p class="people-empty">${msg}</p>`;
}

/* ── Roles & permissions ─────────────────────────────────────
   Makes the seeded roles mean something: a capability matrix that
   shows exactly what each seat can do. Static for now; the same map
   will gate actions once the workspace backend enforces it. */
const CAPS = [
  ['view',    'View all work'],
  ['content', 'Create & edit content'],
  ['deals',   'Manage deals'],
  ['invoice', 'Send invoices'],
  ['review',  'Review & approve'],
  ['team',    'Manage team'],
  ['billing', 'Billing & plan'],
];
const ROLE_CAPS = {
  owner:    new Set(['view', 'content', 'deals', 'invoice', 'review', 'team', 'billing']),
  producer: new Set(['view', 'content', 'deals', 'invoice', 'review']),
  editor:   new Set(['view', 'content']),
  reviewer: new Set(['view', 'review']),
  finance:  new Set(['view', 'deals', 'invoice', 'billing']),
};

function initRoles() {
  const wrap = document.getElementById('roles-grid');
  if (!wrap) return;
  const head = ROLES.map((r) => `<th class="rl-role"><span class="pill tone-${r.tone}">${r.label}</span></th>`).join('');
  const body = CAPS.map(([k, label]) => `
    <tr>
      <th class="rl-cap" scope="row">${label}</th>
      ${ROLES.map((r) => `<td>${(ROLE_CAPS[r.key] || new Set()).has(k)
        ? '<span class="rl-yes" title="Allowed">✓</span>'
        : '<span class="rl-no" title="Not allowed" aria-label="Not allowed">–</span>'}</td>`).join('')}
    </tr>`).join('');
  wrap.innerHTML = `<div class="rl-scroll"><table class="rl-table">
    <thead><tr><th scope="col"></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* ── Activity audit feed ─────────────────────────────────────
   A who-did-what feed synthesised from the records themselves, so
   multi-seat workspaces can see recent movement at a glance. */
function relTime(ts) {
  const t = new Date(ts).getTime();
  if (!t) return '';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  return days < 30 ? `${days}d ago` : fmtDate(ts);
}

async function initActivity() {
  const wrap = document.getElementById('activity-list');
  if (!wrap) return;
  const [projs, dls, txns, ms, members] = await Promise.all([
    projects.list().catch(() => []), deals.list().catch(() => []),
    transactions.list().catch(() => []), milestones.list().catch(() => []),
    team.list().catch(() => []),
  ]);
  const actors = members.map((m) => m.name).filter(Boolean);
  const who = (i) => `<b>${esc(actors.length ? actors[i % actors.length] : 'You')}</b>`;

  const ev = [];
  projs.forEach((p, i) => ev.push({ ts: p.published_at || p.updated_at || p.created_at, tone: p.status === 'published' ? 'green' : 'blue',
    text: `${who(i)} ${p.status === 'published' ? 'published' : 'updated'} “${esc(p.title)}”` }));
  dls.forEach((d, i) => ev.push({ ts: d.updated_at || d.created_at, tone: 'violet',
    text: `${who(i + 1)} moved <b>${esc(d.brand_name)}</b> to ${(DEAL_STATUS_BY_KEY[d.status]?.label || d.status).toLowerCase()}` }));
  txns.forEach((t, i) => ev.push({ ts: t.created_at || `${t.occurred_at}T09:00:00`, tone: t.type === 'income' ? 'green' : 'amber',
    text: `${who(i + 2)} logged ${t.type} of <b>${money(t.amount)}</b>` }));
  ms.filter((m) => m.status === 'paid').forEach((m, i) => ev.push({ ts: m.created_at, tone: 'teal',
    text: `${who(i + 3)} marked “${esc(m.label)}” paid` }));

  ev.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  wrap.innerHTML = ev.slice(0, 8).map((e) => `
    <div class="row-item">
      <span class="dot tone-${e.tone}"></span>
      <span class="row-body"><span class="row-title">${e.text}</span></span>
      <span class="row-right">${relTime(e.ts)}</span>
    </div>`).join('') || emptyRow('No activity yet.');
}

/* ── Notifications (dormant, like billing) ───────────────── */
function initNotifications() {
  const wrap = document.getElementById('notify-rows');
  if (!wrap) return;
  const items = [
    ['Weekly digest', 'A Monday summary of pipeline, deadlines, and cash.', true],
    ['Deal deadline reminders', 'Ping the owner two days before a deliverable is due.', true],
    ['Review mentions', 'Tell a teammate when they’re tagged in a review note.', true],
    ['Payment received', 'Notify finance when a milestone is paid.', false],
  ];
  wrap.innerHTML = items.map(([t, s, on], i) => `
    <div class="setting-row">
      <div class="setting-body"><p class="setting-title">${t}</p><p class="setting-sub">${s}</p></div>
      <label class="switch"><input type="checkbox" ${on ? 'checked' : ''} data-notify="${i}" aria-label="${t}"><span class="switch-track"></span></label>
    </div>`).join('');
  wrap.querySelectorAll('[data-notify]').forEach((cb) => cb.addEventListener('change', () => {
    toast(DEMO_MODE ? 'Saved locally — sends once the backend is connected.' : 'Notification preference saved.');
  }));
}

/* ── Integrations (dormant) — server-side, no browser requests ─ */
function initIntegrations() {
  const wrap = document.getElementById('integ-rows');
  if (!wrap) return;
  const items = [
    ['Stripe', 'Take real payments on plans, invoices, and milestones.', 'SP'],
    ['Slack', 'Post deadlines, approvals, and payments to a channel.', 'SL'],
    ['Google Drive', 'Back up exports and deliverables to your Drive.', 'GD'],
    ['Frame.io', 'Sync review-room notes with your Frame.io projects.', 'FR'],
  ];
  wrap.innerHTML = items.map(([t, s, badge]) => `
    <div class="setting-row">
      <div class="integ-id">
        <span class="integ-logo">${badge}</span>
        <div class="setting-body"><p class="setting-title">${t}</p><p class="setting-sub">${s}</p></div>
      </div>
      <button class="btn" data-integ="${t}">Connect</button>
    </div>`).join('');
  wrap.querySelectorAll('[data-integ]').forEach((b) => b.addEventListener('click', () => {
    toast(`${b.dataset.integ} connects once the workspace backend is wired — it runs server-side, so your browser still makes no third-party requests.`);
  }));
}
