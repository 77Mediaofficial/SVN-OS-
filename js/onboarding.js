/* ============================================================
   SVN OS — Modular Activation (First-Run Onboarding)
   A calm, three-step initialization sequence shown once on first
   boot. Instead of exposing the whole platform at once, it activates
   the essentials, frames the advanced modules as things to unlock
   later, and lets the user start with a sample workspace or a blank
   one. Keeps the command-centre aesthetic; no gimmicks.
   ============================================================ */

import { seedDemoData } from '/js/modules/demo-data.js';
import { navigate } from '/js/router.js';
import { showToast } from '/js/toast.js';

const ACTIVATED_KEY = 'svn-os-activated';

export function isActivated() {
  try { return localStorage.getItem(ACTIVATED_KEY) === '1'; } catch { return true; }
}

function markActivated() {
  try { localStorage.setItem(ACTIVATED_KEY, '1'); } catch {}
}

/**
 * Show the activation flow if the workspace has never been initialized.
 * `onSeeded` is called after a sample workspace is loaded so the caller
 * can refresh its data. Returns true if the flow was shown.
 */
export function maybeStartOnboarding({ onSeeded } = {}) {
  if (isActivated()) return false;
  injectStyles();
  renderStep(0, { onSeeded });
  return true;
}

/* ── Step content ─────────────────────────────────────────── */
const STEPS = [
  {
    eyebrow: 'Initializing workspace',
    title: 'Welcome to your command centre',
    body: 'SVN OS runs the business side of creative work — your projects, your schedule, your clients, and your money — in one calm, private workspace. Let’s switch on the essentials.',
    primary: 'Begin setup',
    secondary: 'Skip',
  },
  {
    eyebrow: 'Core modules · online',
    title: 'The essentials are active',
    body: 'These two run from day one. Everything else stays out of your way until you want it.',
    modules: [
      { name: 'Client & Deal Intake', desc: 'Track every client and deal from first contact to paid.', on: true },
      { name: 'Project Staging', desc: 'Move work through clear stages — from idea to delivered.', on: true },
    ],
    locked: [
      { name: 'Idea Generation', desc: 'Unlocks in the Content Engine when you’re ready.' },
      { name: 'Automated Invoicing', desc: 'Unlocks the moment you log your first deal.' },
    ],
    primary: 'Continue',
    secondary: 'Back',
  },
  {
    eyebrow: 'Final step',
    title: 'How would you like to start?',
    body: 'Explore with a sample workspace you can clear any time, or begin with a clean slate.',
    choices: [
      { id: 'sample', label: 'Load a sample workspace', desc: 'See SVN OS in motion with example projects, deals, and transactions.', primary: true },
      { id: 'blank', label: 'Start from scratch', desc: 'An empty workspace, ready for your first project.', primary: false },
    ],
  },
];

/* ── Render ───────────────────────────────────────────────── */
let overlay = null;

function renderStep(index, ctx) {
  const step = STEPS[index];
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'onb-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Workspace setup');
    document.body.appendChild(overlay);
  }

  const dots = STEPS.map((_, i) =>
    `<span class="onb-dot${i === index ? ' active' : ''}${i < index ? ' done' : ''}"></span>`
  ).join('');

  let inner = '';
  if (step.modules) {
    const mods = step.modules.map(m => `
      <div class="onb-module on">
        <div class="onb-module-dot"></div>
        <div><div class="onb-module-name">${m.name}</div><div class="onb-module-desc">${m.desc}</div></div>
        <span class="onb-module-state">On</span>
      </div>`).join('');
    const locked = step.locked.map(m => `
      <div class="onb-module locked">
        <div class="onb-module-dot"></div>
        <div><div class="onb-module-name">${m.name}</div><div class="onb-module-desc">${m.desc}</div></div>
        <span class="onb-module-state">Unlocks later</span>
      </div>`).join('');
    inner = `<div class="onb-modules">${mods}${locked}</div>`;
  } else if (step.choices) {
    inner = `<div class="onb-choices">` + step.choices.map(c => `
      <button type="button" class="onb-choice${c.primary ? ' primary' : ''}" data-choice="${c.id}">
        <div class="onb-choice-label">${c.label}</div>
        <div class="onb-choice-desc">${c.desc}</div>
      </button>`).join('') + `</div>`;
  }

  const actions = step.choices ? '' : `
    <div class="onb-actions">
      ${step.secondary ? `<button type="button" class="btn btn-ghost" data-onb="secondary">${step.secondary}</button>` : '<span></span>'}
      <button type="button" class="btn btn-primary" data-onb="primary">${step.primary}</button>
    </div>`;

  overlay.innerHTML = `
    <div class="onb-card">
      <div class="onb-eyebrow">${step.eyebrow}</div>
      <h2 class="onb-title">${step.title}</h2>
      <p class="onb-body">${step.body}</p>
      ${inner}
      ${actions}
      <div class="onb-dots">${dots}</div>
    </div>`;

  // Wire actions
  overlay.querySelector('[data-onb="primary"]')?.addEventListener('click', () => {
    renderStep(index + 1, ctx);
  });
  overlay.querySelector('[data-onb="secondary"]')?.addEventListener('click', () => {
    if (index === 0) finish(ctx, null);           // Skip
    else renderStep(index - 1, ctx);              // Back
  });
  overlay.querySelectorAll('[data-choice]').forEach(btn => {
    btn.addEventListener('click', () => finish(ctx, btn.dataset.choice, btn));
  });

  requestAnimationFrame(() => overlay.classList.add('show'));
}

async function finish(ctx, choice, btn) {
  markActivated();

  if (choice === 'sample') {
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try {
      const counts = await seedDemoData();
      showToast(`Workspace ready — ${counts.content} projects, ${counts.deals} deals loaded`, 'success');
      ctx?.onSeeded?.();
    } catch (err) {
      showToast(err.message || 'Could not load the sample workspace', 'error');
    }
    teardown();
  } else if (choice === 'blank') {
    teardown();
    showToast('Workspace ready. Create your first project to begin.', 'info');
    navigate('/content');
  } else {
    // Skipped
    teardown();
  }
}

function teardown() {
  if (!overlay) return;
  overlay.classList.remove('show');
  const el = overlay;
  overlay = null;
  setTimeout(() => el.remove(), 220);
}

/* ── Styles (self-contained) ──────────────────────────────── */
let styled = false;
function injectStyles() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
    .onb-overlay {
      position: fixed; inset: 0; z-index: 9900;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      background: rgba(5,5,5,0.82);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      opacity: 0; transition: opacity 200ms ease;
    }
    .onb-overlay.show { opacity: 1; }
    .onb-card {
      width: 100%; max-width: 480px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 32px;
      box-shadow: var(--shadow-elevated);
      transform: translateY(8px); transition: transform 220ms cubic-bezier(0.4,0,0.2,1);
    }
    .onb-overlay.show .onb-card { transform: translateY(0); }
    .onb-eyebrow {
      font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 14px;
    }
    .onb-title { font-size: 1.5rem; font-weight: 300; line-height: 1.2; margin-bottom: 12px; }
    .onb-body { font-size: 0.9rem; color: var(--color-text-dim); line-height: 1.6; margin-bottom: 22px; }
    .onb-modules { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
    .onb-module {
      display: flex; align-items: center; gap: 12px;
      padding: 14px; border: 1px solid var(--color-border);
      border-radius: var(--radius-md); background: var(--color-surface-2);
    }
    .onb-module.locked { background: var(--color-bg); border-color: var(--color-border-subtle); opacity: 0.72; }
    .onb-module-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-success); flex-shrink: 0; }
    .onb-module.locked .onb-module-dot { background: var(--color-text-muted); }
    .onb-module-name { font-size: 0.85rem; font-weight: 500; }
    .onb-module-desc { font-size: 0.76rem; color: var(--color-text-muted); margin-top: 2px; }
    .onb-module-state {
      margin-left: auto; font-family: var(--font-mono); font-size: 0.64rem;
      text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-success);
      white-space: nowrap;
    }
    .onb-module.locked .onb-module-state { color: var(--color-text-muted); }
    .onb-choices { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
    .onb-choice {
      text-align: left; padding: 16px;
      border: 1px solid var(--color-border); border-radius: var(--radius-md);
      background: var(--color-surface-2); cursor: pointer;
      transition: border-color var(--transition-fast), transform var(--transition-fast);
    }
    .onb-choice:hover { border-color: #444; transform: translateY(-1px); }
    .onb-choice.primary { border-color: #3a3a3a; background: #161616; }
    .onb-choice.loading { opacity: 0.5; pointer-events: none; }
    .onb-choice-label { font-size: 0.92rem; font-weight: 500; margin-bottom: 4px; }
    .onb-choice-desc { font-size: 0.78rem; color: var(--color-text-dim); line-height: 1.5; }
    .onb-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .onb-actions .btn { min-width: 110px; }
    .onb-dots { display: flex; gap: 6px; justify-content: center; margin-top: 24px; }
    .onb-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-border); transition: background var(--transition-fast); }
    .onb-dot.active { background: var(--color-accent); }
    .onb-dot.done { background: var(--color-text-muted); }
    @media (max-width: 480px) {
      .onb-card { padding: 22px; }
      .onb-title { font-size: 1.25rem; }
    }
  `;
  document.head.appendChild(s);
}
