/* Settings — profile, appearance, privacy & account.
   Appearance changes apply instantly (device-level); profile saves
   to the profiles table (or the demo profile) and refreshes the
   sidebar identity. */

import { getProfile, updateProfile, getPrefs, savePrefs, team, clients } from '../store.js';
import { getAppearance, setAppearance } from '../appearance.js';
import { openPrivacySheet } from '../applock.js';
import { signOut } from '../auth.js';
import { DEMO_MODE } from '../supabase.js';
import { formData, initials } from '../ui.js';
import { toast } from '../toast.js';
import { PLANS, PLAN_BY_ID, ROLE_BY_KEY, CLIENT_STATUS_BY_KEY } from '../domain.js';

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
   Read-only roster for now; invite / add are dormant until the
   workspace backend (Supabase) is wired, mirroring billing. */
async function initWorkspace() {
  const teamWrap = document.getElementById('team-list');
  const clientWrap = document.getElementById('client-list');

  if (teamWrap) {
    const members = await team.list().catch(() => []);
    teamWrap.innerHTML = members.map(personRow).join('') || emptyRow('No teammates yet.');
  }
  if (clientWrap) {
    const list = await clients.list().catch(() => []);
    clientWrap.innerHTML = list.map(clientRow).join('') || emptyRow('No clients yet.');
  }

  document.getElementById('team-invite')?.addEventListener('click', () => {
    toast(DEMO_MODE ? 'Invites go out once the workspace backend is connected.' : 'Invitation sent.', 'success');
  });
  document.getElementById('client-add')?.addEventListener('click', () => {
    toast(DEMO_MODE ? 'Client management lands with the workspace backend.' : 'Client added.', 'success');
  });
}

function personRow(m) {
  const role = ROLE_BY_KEY[m.role];
  return (
    '<div class="person">' +
      `<span class="person-av">${initials(m.name)}</span>` +
      `<span class="person-id"><span class="person-name">${m.name}</span>` +
      `<span class="person-sub">${m.email || ''}</span></span>` +
      `<span class="pill tone-${role?.tone || 'dim'}">${role?.label || m.role}</span>` +
    '</div>'
  );
}

function clientRow(c) {
  const st = CLIENT_STATUS_BY_KEY[c.status];
  return (
    '<div class="person">' +
      `<span class="person-av person-av-sq">${initials(c.name)}</span>` +
      `<span class="person-id"><span class="person-name">${c.name}</span>` +
      `<span class="person-sub">${c.contact || 'No contact yet'}</span></span>` +
      `<span class="pill tone-${st?.tone || 'dim'}">${st?.label || c.status}</span>` +
    '</div>'
  );
}

function emptyRow(msg) {
  return `<p class="people-empty">${msg}</p>`;
}
