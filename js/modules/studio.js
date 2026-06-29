/* Studio — the client-delivery backbone (the Studio & Agency pillars).
   One surface that turns a deal into delivered, paid work:
   • Scope & change orders — a living statement of work per client
   • Milestones — payment-gated delivery (files release once paid)
   • Review room — frame-accurate, timecoded notes on a cut
   • Gear — equipment & liability register
   Plus a white-label client portal preview. Everything persists through the
   same repos as the rest of the app (demo: localStorage). */

import { sowItems, milestones, gear, reviews, clients, getPrefs } from '../store.js';
import { money, esc, relDay, initials, fmtDate, applyVars } from '../ui.js';
import { toast } from '../toast.js';
import { openDrawer, closeDrawer } from '../drawer.js';
import { initTabUnderline } from '../tabs.js';
import {
  MILESTONE_STATUSES, MILESTONE_STATUS_BY_KEY,
  GEAR_STATUSES, GEAR_STATUS_BY_KEY, GEAR_NEXT_STATUS,
  GEAR_CATEGORIES, GEAR_CATEGORY_BY_KEY, optionsHtml,
} from '../domain.js';

const state = { clientId: null, tab: 'scope', brand: 'Your studio' };
const cache = { clients: [], sow: [], ms: [], gear: [], reviews: [] };
let portalRoot = null;   // the open client-portal overlay, if any — for teardown on nav

const tc = (s) => {
  const r = Math.max(0, Math.round(s)); // round to whole seconds first, else 119.6 → "1:60"
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
};

export async function init() {
  const [cl, sow, ms, gr, rv, prefs] = await Promise.all([
    clients.list(), sowItems.list(), milestones.list(), gear.list(), reviews.list(),
    getPrefs().catch(() => ({})),
  ]);
  cache.clients = cl; cache.sow = sow; cache.ms = ms; cache.gear = gr; cache.reviews = rv;
  state.brand = prefs.business_name || 'Your studio';
  state.clientId = cl[0]?.id || null;

  const sel = document.getElementById('st-client');
  sel.innerHTML = cl.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')
    || '<option>No clients yet</option>';
  sel.addEventListener('change', () => { state.clientId = sel.value; renderTab(); });

  document.getElementById('st-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    state.tab = t.dataset.tab;
    document.querySelectorAll('#st-tabs .tab').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
    renderTab();
  });

  document.getElementById('st-portal').addEventListener('click', openPortal);

  initTabUnderline(document.getElementById('st-tabs').parentElement);
  renderTab();

  // Navigating away with the client-portal preview open would orphan a
  // body-level overlay + a document keydown listener and leave scroll locked.
  return () => { if (portalRoot) closePortal(portalRoot); };
}

async function reload(kind) {
  if (kind === 'sow') cache.sow = await sowItems.list();
  else if (kind === 'ms') cache.ms = await milestones.list();
  else if (kind === 'gear') cache.gear = await gear.list();
  else if (kind === 'reviews') cache.reviews = await reviews.list();
  renderTab();
}

function renderTab() {
  const panel = document.getElementById('st-panel');
  const needsClient = state.tab === 'scope' || state.tab === 'milestones';
  document.getElementById('st-client-wrap').hidden = !needsClient;
  if (needsClient && !state.clientId) {
    panel.innerHTML = `<div class="panel"><div class="empty">`
      + `<p class="empty-title">No clients yet</p>`
      + `<p class="empty-sub">Add your first client to start scoping and billing their work.</p>`
      + `<a href="/settings" data-link class="btn btn-primary">Add a client</a>`
      + `</div></div>`;
    return;
  }
  if (state.tab === 'scope') renderScope(panel);
  else if (state.tab === 'milestones') renderMilestones(panel);
  else if (state.tab === 'review') renderReview(panel);
  else renderGear(panel);
}

const emptyPanel = (t, s) => `<div class="panel"><div class="empty"><p class="empty-title">${t}</p><p class="empty-sub">${s}</p></div></div>`;
const clientName = () => cache.clients.find((c) => c.id === state.clientId)?.name || 'Client';

/* ── Scope & change orders ───────────────────────────────── */

function renderScope(panel) {
  const items = cache.sow.filter((s) => s.client_id === state.clientId);
  const scope = items.filter((s) => s.kind === 'scope');
  const changes = items.filter((s) => s.kind === 'change');
  const lineTotal = (s) => (Number(s.qty) || 0) * (Number(s.rate) || 0);
  const scopeTotal = scope.reduce((a, s) => a + lineTotal(s), 0);
  const changeTotal = changes.reduce((a, s) => a + lineTotal(s), 0);

  const row = (s) => `
    <tr>
      <td class="st-line">${esc(s.label)}${s.kind === 'change' ? ' <span class="pill tone-amber pill-xs">Change</span>' : ''}</td>
      <td class="st-num">${s.qty}</td>
      <td class="st-num">${money(s.rate)}</td>
      <td class="st-num">${money(lineTotal(s))}</td>
      <td class="st-act"><button class="iconbtn-sm" data-del="${s.id}" title="Remove" aria-label="Remove line">✕</button></td>
    </tr>`;

  panel.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <p class="st-eyebrow">Statement of work</p>
          <h2 class="st-title">${esc(clientName())}</h2>
        </div>
        <div class="st-head-actions">
          <button class="btn" data-add="scope">Add line</button>
          <button class="btn" data-add="change">Add change order</button>
        </div>
      </div>
      ${items.length ? `
        <table class="st-table">
          <thead><tr><th>Deliverable</th><th class="st-num">Qty</th><th class="st-num">Rate</th><th class="st-num">Total</th><th></th></tr></thead>
          <tbody>${scope.map(row).join('')}${changes.map(row).join('')}</tbody>
        </table>
        <div class="st-totals">
          <span>Base scope <b>${money(scopeTotal)}</b></span>
          ${changeTotal ? `<span>Change orders <b>${money(changeTotal)}</b></span>` : ''}
          <span class="st-grand">Contract total <b>${money(scopeTotal + changeTotal)}</b></span>
        </div>` : `<div class="empty"><p class="empty-title">No scope yet.</p><p class="empty-sub">Add the deliverables you've agreed — change orders keep scope creep honest.</p></div>`}
    </div>`;

  panel.querySelector('[data-add="scope"]')?.addEventListener('click', () => addSowDrawer('scope'));
  panel.querySelector('[data-add="change"]')?.addEventListener('click', () => addSowDrawer('change'));
  panel.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    await sowItems.remove(b.dataset.del); toast('Line removed.'); reload('sow');
  }));
}

function addSowDrawer(kind) {
  openDrawer({
    eyebrow: kind === 'change' ? 'Change order' : 'Scope line',
    title: clientName(),
    body: `
      <div class="field"><label>Deliverable</label>
        <input id="d-label" autocomplete="off" placeholder="${kind === 'change' ? 'What changed?' : 'What are you delivering?'}" /></div>
      <div class="field-row">
        <div class="field"><label>Quantity</label><input id="d-qty" type="number" min="1" step="1" value="1" /></div>
        <div class="field"><label>Rate (£)</label><input id="d-rate" type="number" min="0" step="50" value="0" /></div>
      </div>`,
    actions: [{ key: 'cancel', label: 'Cancel' }, { key: 'save', label: 'Add', variant: 'primary' }],
    onAction: async (k) => {
      if (k !== 'save') return closeDrawer();
      const label = document.getElementById('d-label').value.trim();
      if (!label) return;
      await sowItems.create({
        client_id: state.clientId, kind, label,
        qty: Number(document.getElementById('d-qty').value) || 1,
        rate: Number(document.getElementById('d-rate').value) || 0,
      });
      closeDrawer(); toast(kind === 'change' ? 'Change order added.' : 'Scope line added.', 'success');
      reload('sow');
    },
  });
}

/* ── Milestones (payment-gated delivery) ─────────────────── */

function renderMilestones(panel) {
  const items = cache.ms.filter((m) => m.client_id === state.clientId);
  const billed = items.reduce((a, m) => a + (Number(m.amount) || 0), 0);
  const paid = items.filter((m) => m.status === 'paid').reduce((a, m) => a + (Number(m.amount) || 0), 0);

  const card = (m) => {
    const st = MILESTONE_STATUS_BY_KEY[m.status];
    const locked = m.status !== 'paid';
    const next = m.status === 'pending' ? { to: 'invoiced', label: 'Send invoice' }
      : m.status === 'invoiced' ? { to: 'paid', label: 'Mark paid' } : null;
    return `
      <div class="st-ms">
        <div class="st-ms-main">
          <div class="st-ms-top">
            <span class="st-ms-name">${esc(m.label)}</span>
            <span class="pill tone-${st.tone}">${st.label}</span>
          </div>
          <div class="st-ms-sub">
            <span class="st-ms-amt">${money(m.amount)}</span>
            <span class="st-ms-due">${m.status === 'paid' ? 'Paid' : 'due ' + fmtDate(m.due)}</span>
            <span class="st-gate ${locked ? 'is-locked' : 'is-open'}">${locked ? '🔒 Files locked until paid' : '✓ Files released'}</span>
          </div>
        </div>
        ${next ? `<button class="btn" data-adv="${m.id}" data-to="${next.to}">${next.label}</button>` : ''}
      </div>`;
  };

  panel.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <p class="st-eyebrow">Milestone billing · payment-gated delivery</p>
          <h2 class="st-title">${esc(clientName())}</h2>
        </div>
        <button class="btn" data-add-ms>Add milestone</button>
      </div>
      ${items.length ? `<div class="st-ms-list">${items.map(card).join('')}</div>
        <div class="st-totals">
          <span>Billed <b>${money(billed)}</b></span>
          <span>Collected <b class="tone-green">${money(paid)}</b></span>
          <span class="st-grand">Outstanding <b>${money(billed - paid)}</b></span>
        </div>` : `<div class="empty"><p class="empty-title">No milestones yet.</p><p class="empty-sub">Break the project into stages — deliverables release as each is paid.</p></div>`}
    </div>`;

  panel.querySelector('[data-add-ms]')?.addEventListener('click', addMilestoneDrawer);
  panel.querySelectorAll('[data-adv]').forEach((b) => b.addEventListener('click', async () => {
    const to = b.dataset.to;
    await milestones.update(b.dataset.adv, { status: to });
    toast(to === 'paid' ? 'Marked paid — deliverables released.' : 'Invoice sent.', 'success');
    reload('ms');
  }));
}

function addMilestoneDrawer() {
  openDrawer({
    eyebrow: 'New milestone', title: clientName(),
    body: `
      <div class="field"><label>Milestone</label>
        <input id="m-label" autocomplete="off" placeholder="e.g. Rough-cut delivery" /></div>
      <div class="field-row">
        <div class="field"><label>Amount (£)</label><input id="m-amt" type="number" min="0" step="50" value="0" /></div>
        <div class="field"><label>Due</label><input id="m-due" type="date" /></div>
      </div>
      <div class="field"><label>Status</label>
        <select id="m-status">${optionsHtml(MILESTONE_STATUSES.map((s) => ({ key: s.key, label: s.label })), 'pending')}</select></div>`,
    actions: [{ key: 'cancel', label: 'Cancel' }, { key: 'save', label: 'Add', variant: 'primary' }],
    onAction: async (k) => {
      if (k !== 'save') return closeDrawer();
      const label = document.getElementById('m-label').value.trim();
      if (!label) return;
      await milestones.create({
        client_id: state.clientId, label,
        amount: Number(document.getElementById('m-amt').value) || 0,
        due: document.getElementById('m-due').value || null,
        status: document.getElementById('m-status').value,
      });
      closeDrawer(); toast('Milestone added.', 'success'); reload('ms');
    },
  });
}

/* ── Review room (frame-accurate notes) ──────────────────── */

function renderReview(panel) {
  const list = [...cache.reviews].sort((a, b) => a.t_sec - b.t_sec);
  const asset = list[0]?.asset || 'Untitled cut';
  const duration = list[0]?.duration_sec || 60;
  const open = list.filter((c) => !c.resolved).length;

  const ticks = list.map((c) => `
    <button class="st-tick ${c.resolved ? 'is-done' : ''}" data-seek="${c.id}" data-svar="--x:${(c.t_sec / duration) * 100}%" title="${tc(c.t_sec)} — ${esc(c.author)}" aria-label="Note at ${tc(c.t_sec)}"></button>`).join('');

  const comment = (c) => `
    <li class="st-note ${c.resolved ? 'is-done' : ''}" data-id="${c.id}">
      <span class="st-note-tc">${tc(c.t_sec)}</span>
      <span class="st-note-body">
        <span class="st-note-head"><b>${esc(c.author)}</b></span>
        <span class="st-note-text">${esc(c.body)}</span>
      </span>
      <button class="btn btn-xs" data-toggle="${c.id}">${c.resolved ? 'Reopen' : 'Resolve'}</button>
    </li>`;

  panel.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <p class="st-eyebrow">Review room · ${open} open note${open === 1 ? '' : 's'}</p>
          <h2 class="st-title">${esc(asset)}</h2>
        </div>
        <button class="btn" data-add-note>Add note</button>
      </div>
      <div class="st-player">
        <div class="st-scrub" id="st-scrub" title="Click the timeline to comment on a frame">
          <span class="st-scrub-fill"></span>
          ${ticks}
        </div>
        <div class="st-scrub-meta"><span>0:00</span><span>${tc(duration)}</span></div>
      </div>
      <p class="st-note-empty">Timecoded notes on a sample cut — real video upload &amp; playback unlock with live accounts.</p>
      <ul class="st-notes">${list.map(comment).join('') || '<li class="st-note-empty">No notes yet — click the timeline to leave one.</li>'}</ul>
    </div>`;
  applyVars(panel);

  panel.querySelector('#st-scrub').addEventListener('click', (e) => {
    if (e.target.closest('.st-tick')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration));
    addNoteDrawer(asset, duration, Math.round(t));
  });
  panel.querySelectorAll('[data-seek]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const c = list.find((x) => x.id === b.dataset.seek);
    document.querySelector(`.st-note[data-id="${b.dataset.seek}"]`)?.scrollIntoView({ block: 'nearest' });
    if (c) toast(`${tc(c.t_sec)} · ${c.author}`);
  }));
  panel.querySelector('[data-add-note]')?.addEventListener('click', () => addNoteDrawer(asset, duration, 0));
  panel.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    const c = cache.reviews.find((x) => x.id === b.dataset.toggle);
    await reviews.update(b.dataset.toggle, { resolved: !c.resolved });
    reload('reviews');
  }));
}

function addNoteDrawer(asset, duration, t) {
  openDrawer({
    eyebrow: `Note at ${tc(t)}`, title: asset,
    body: `
      <div class="field-row">
        <div class="field"><label>Timecode (sec)</label><input id="n-t" type="number" min="0" max="${duration}" value="${t}" /></div>
        <div class="field"><label>From</label><input id="n-author" autocomplete="off" value="${esc(state.brand.split(' ')[0] || 'You')}" /></div>
      </div>
      <div class="field"><label>Note</label><textarea id="n-body" placeholder="What needs to change at this frame?"></textarea></div>`,
    actions: [{ key: 'cancel', label: 'Cancel' }, { key: 'save', label: 'Post note', variant: 'primary' }],
    onAction: async (k) => {
      if (k !== 'save') return closeDrawer();
      const body = document.getElementById('n-body').value.trim();
      if (!body) return;
      await reviews.create({
        asset, duration_sec: duration,
        t_sec: Number(document.getElementById('n-t').value) || 0,
        author: document.getElementById('n-author').value.trim() || 'You',
        body, resolved: false,
      });
      closeDrawer(); toast('Note posted.', 'success'); reload('reviews');
    },
  });
}

/* ── Gear & liability register ───────────────────────────── */

function renderGear(panel) {
  const items = cache.gear;
  const value = items.reduce((a, g) => a + (Number(g.value) || 0), 0);
  const out = items.filter((g) => g.status === 'out').length;
  const uninsured = items.filter((g) => !g.insured).length;

  const row = (g) => {
    const st = GEAR_STATUS_BY_KEY[g.status];
    const cat = GEAR_CATEGORY_BY_KEY[g.category];
    return `
      <tr>
        <td>
          <span class="st-line">${esc(g.name)}</span>
          <span class="st-gear-sub">${cat?.label || g.category}${g.assignee ? ' · ' + esc(g.assignee) : ''}</span>
        </td>
        <td class="st-num">${money(g.value)}</td>
        <td><button class="pill tone-${st.tone} pill-btn" data-cycle="${g.id}" title="Cycle status">${st.label}</button></td>
        <td><button class="st-shield ${g.insured ? 'is-on' : ''}" data-insure="${g.id}" title="${g.insured ? 'Insured' : 'Not insured'}" aria-label="Toggle insured">${g.insured ? '🛡' : '⚠'}</button></td>
        <td class="st-act"><button class="iconbtn-sm" data-del="${g.id}" title="Remove" aria-label="Remove">✕</button></td>
      </tr>`;
  };

  panel.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <p class="st-eyebrow">Gear & liability register</p>
          <h2 class="st-title">Kit</h2>
        </div>
        <button class="btn" data-add-gear>Add gear</button>
      </div>
      <div class="st-totals st-totals-top">
        <span>Total value <b>${money(value)}</b></span>
        <span>Checked out <b>${out}</b></span>
        <span class="${uninsured ? 'tone-danger' : ''}">Uninsured <b>${uninsured}</b></span>
      </div>
      <table class="st-table">
        <thead><tr><th>Item</th><th class="st-num">Value</th><th>Status</th><th>Cover</th><th></th></tr></thead>
        <tbody>${items.map(row).join('')}</tbody>
      </table>
    </div>`;

  panel.querySelector('[data-add-gear]')?.addEventListener('click', addGearDrawer);
  panel.querySelectorAll('[data-cycle]').forEach((b) => b.addEventListener('click', async () => {
    const g = cache.gear.find((x) => x.id === b.dataset.cycle);
    await gear.update(b.dataset.cycle, { status: GEAR_NEXT_STATUS[g.status] }); reload('gear');
  }));
  panel.querySelectorAll('[data-insure]').forEach((b) => b.addEventListener('click', async () => {
    const g = cache.gear.find((x) => x.id === b.dataset.insure);
    await gear.update(b.dataset.insure, { insured: !g.insured }); reload('gear');
  }));
  panel.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    await gear.remove(b.dataset.del); toast('Item removed.'); reload('gear');
  }));
}

function addGearDrawer() {
  openDrawer({
    eyebrow: 'New gear', title: 'Add to register',
    body: `
      <div class="field"><label>Item</label><input id="g-name" autocomplete="off" placeholder="e.g. Sony FX3" /></div>
      <div class="field-row">
        <div class="field"><label>Category</label><select id="g-cat">${optionsHtml(GEAR_CATEGORIES, 'camera')}</select></div>
        <div class="field"><label>Value (£)</label><input id="g-val" type="number" min="0" step="50" value="0" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Status</label><select id="g-status">${optionsHtml(GEAR_STATUSES.map((s) => ({ key: s.key, label: s.label })), 'available')}</select></div>
        <div class="field"><label>Assigned to</label><input id="g-assignee" autocomplete="off" placeholder="Optional" /></div>
      </div>
      <label class="st-check"><input type="checkbox" id="g-insured" checked /> <span>Covered by insurance</span></label>`,
    actions: [{ key: 'cancel', label: 'Cancel' }, { key: 'save', label: 'Add', variant: 'primary' }],
    onAction: async (k) => {
      if (k !== 'save') return closeDrawer();
      const name = document.getElementById('g-name').value.trim();
      if (!name) return;
      await gear.create({
        name, category: document.getElementById('g-cat').value,
        value: Number(document.getElementById('g-val').value) || 0,
        status: document.getElementById('g-status').value,
        assignee: document.getElementById('g-assignee').value.trim() || null,
        insured: document.getElementById('g-insured').checked,
      });
      closeDrawer(); toast('Gear added.', 'success'); reload('gear');
    },
  });
}

/* ── White-label client portal (read-only preview) ───────── */

function openPortal() {
  if (!state.clientId) { toast('Add a client first.'); return; }
  const name = clientName();
  const ms = cache.ms.filter((m) => m.client_id === state.clientId);
  const sow = cache.sow.filter((s) => s.client_id === state.clientId);
  const total = sow.reduce((a, s) => a + (Number(s.qty) || 0) * (Number(s.rate) || 0), 0);
  const paid = ms.filter((m) => m.status === 'paid').reduce((a, m) => a + (Number(m.amount) || 0), 0);
  const billed = ms.reduce((a, m) => a + (Number(m.amount) || 0), 0);
  const pct = billed ? Math.round((paid / billed) * 100) : 0;

  const msRow = (m) => {
    const st = MILESTONE_STATUS_BY_KEY[m.status];
    const locked = m.status !== 'paid';
    return `<li class="pt-ms">
      <span class="pt-ms-name">${esc(m.label)}</span>
      <span class="pt-ms-right"><span class="pill tone-${st.tone}">${st.label}</span>
      <span class="pt-deliver">${locked ? 'Awaiting payment' : 'Ready to download'}</span></span>
    </li>`;
  };

  let root = document.createElement('div');
  root.className = 'pt-root';
  portalRoot = root;
  root.innerHTML = `
    <div class="pt-backdrop" data-pt-close></div>
    <div class="pt-frame" role="dialog" aria-modal="true" aria-label="Client portal preview">
      <div class="pt-bar">
        <span class="pt-bar-dot"></span><span class="pt-bar-dot"></span><span class="pt-bar-dot"></span>
        <span class="pt-bar-url">${esc(state.brand.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'studio')}.portal / ${esc(name.toLowerCase().replace(/[^a-z0-9]+/g, ''))}</span>
        <button class="pt-x" data-pt-close aria-label="Close preview">✕</button>
      </div>
      <div class="pt-page">
        <header class="pt-head">
          <span class="pt-brand">${esc(state.brand)}</span>
          <span class="pt-tag">Client portal</span>
        </header>
        <h1 class="pt-h1">Welcome, ${esc(name)}.</h1>
        <p class="pt-sub">Everything we're making for you, in one place.</p>

        <div class="pt-progress">
          <div class="pt-progress-top"><span>Project payment</span><span><b>${money(paid)}</b> of ${money(billed)}</span></div>
          <div class="pt-bar-track"><span class="pt-bar-fill" data-svar="--w:${pct}%"></span></div>
        </div>

        <section class="pt-section">
          <h2 class="pt-h2">Milestones & deliverables</h2>
          <ul class="pt-list">${ms.map(msRow).join('') || '<li class="pt-empty">No milestones yet.</li>'}</ul>
        </section>

        <section class="pt-section">
          <h2 class="pt-h2">Your scope</h2>
          <ul class="pt-scope">${sow.filter((s) => s.kind === 'scope').map((s) => `<li>${esc(s.label)}</li>`).join('') || '<li class="pt-empty">Scope coming soon.</li>'}</ul>
          <p class="pt-total">Contract total <b>${money(total)}</b></p>
        </section>

        <p class="pt-foot">Powered by ${esc(state.brand)} · SVN OS</p>
      </div>
    </div>`;
  applyVars(root);
  document.body.appendChild(root);
  document.body.classList.add('pt-active');
  root.addEventListener('click', (e) => { if (e.target.closest('[data-pt-close]')) closePortal(root); });
  // Keep a handle to the key listener so closePortal removes it on EVERY close
  // path (backdrop / ✕ / Escape), not only the Escape branch — else each
  // click-close orphans a document keydown listener.
  const onKey = (e) => { if (e.key === 'Escape') closePortal(root); };
  document.addEventListener('keydown', onKey);
  root._onKey = onKey;
  void root.offsetWidth;
  root.classList.add('is-open');
}

function closePortal(root) {
  if (root._onKey) { document.removeEventListener('keydown', root._onKey); root._onKey = null; }
  portalRoot = null;
  root.classList.remove('is-open');
  document.body.classList.remove('pt-active');
  setTimeout(() => root.remove(), 220);
}
