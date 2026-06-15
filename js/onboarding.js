/* First-run onboarding — a calm three-step welcome shown once.
   Names the workspace, captures what the studio makes, and points at the
   two power features (⌘K and the Resizer). Persisted with a localStorage
   flag so it never nags again; resetting the demo data leaves it dismissed. */

import { getPrefs, savePrefs } from './store.js';
import { toast } from './toast.js';
import { esc } from './ui.js';

const KEY = 'svnos-onboarded-v1';
let root = null;
let step = 0;
let prefs = {};

const STEPS = 3;

export async function maybeOnboard() {
  try { if (localStorage.getItem(KEY)) return; } catch { return; }
  try { prefs = await getPrefs(); } catch { prefs = {}; }
  build();
  step = 0;
  render();
  show();
}

function stepHtml() {
  if (step === 0) {
    return `
      <p class="kicker">Welcome</p>
      <h2 class="ob-title">Set up your<br/>workspace<span class="title-dot">.</span></h2>
      <p class="ob-sub">SVN OS is the calm command center for your whole media operation — pipeline, calendar, deals, and delivery in one place.</p>
      <div class="field"><label>Workspace name</label>
        <input id="ob-name" autocomplete="off" placeholder="Your studio's name" value="${esc(prefs.business_name || '')}" /></div>`;
  }
  if (step === 1) {
    return `
      <p class="kicker">Step 2</p>
      <h2 class="ob-title">What do you<br/>make<span class="title-dot">.</span></h2>
      <p class="ob-sub">A line for context — it shows on invoices and your client portal later.</p>
      <div class="field"><label>What your studio does</label>
        <input id="ob-type" autocomplete="off" placeholder="e.g. Brand films &amp; social content" value="${esc(prefs.business_type || '')}" /></div>`;
  }
  return `
    <p class="kicker">You're set</p>
    <h2 class="ob-title">Two things to<br/>try first<span class="title-dot">.</span></h2>
    <ul class="ob-tips">
      <li><span class="ob-key"><kbd>⌘</kbd><kbd>K</kbd></span><span>Jump anywhere or create a project, deal, or invoice in a keystroke.</span></li>
      <li><span class="ob-key"><kbd>↦</kbd></span><span>Open the <b>Resizer</b> — turn one master asset into every platform size, zipped.</span></li>
      <li><span class="ob-key"><kbd>★</kbd></span><span>Everything here is demo data. Explore freely; reset anytime.</span></li>
    </ul>`;
}

function render() {
  const body = root.querySelector('#ob-body');
  body.innerHTML = stepHtml();
  body.querySelector('input')?.focus();

  root.querySelector('#ob-dots').innerHTML =
    Array.from({ length: STEPS }, (_, i) => `<span class="ob-dot${i === step ? ' is-on' : ''}"></span>`).join('');

  root.querySelector('#ob-back').hidden = step === 0;
  root.querySelector('#ob-next').textContent = step === STEPS - 1 ? 'Get started' : 'Continue';
}

function collect() {
  const name = root.querySelector('#ob-name');
  const type = root.querySelector('#ob-type');
  if (name) prefs.business_name = name.value.trim();
  if (type) prefs.business_type = type.value.trim();
}

async function finish() {
  collect();
  try {
    await savePrefs({ business_name: prefs.business_name || '', business_type: prefs.business_type || '' });
    if (prefs.business_name) {
      window.dispatchEvent(new CustomEvent('svnos:workspace'));
    }
  } catch (err) { console.warn('onboarding save failed', err); }
  done();
  toast('Welcome to SVN OS.', 'success');
}

function done() {
  try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* private mode */ }
  close();
}

function build() {
  root = document.createElement('div');
  root.className = 'ob-root';
  root.hidden = true;
  root.innerHTML = `
    <div class="ob-backdrop"></div>
    <div class="ob-panel" role="dialog" aria-modal="true" aria-label="Welcome to SVN OS">
      <div class="ob-body" id="ob-body"></div>
      <footer class="ob-foot">
        <button type="button" class="linklike" id="ob-skip">Skip</button>
        <span class="ob-dots" id="ob-dots"></span>
        <span class="ob-nav">
          <button type="button" class="btn" id="ob-back" hidden>Back</button>
          <button type="button" class="btn btn-primary" id="ob-next">Continue</button>
        </span>
      </footer>
    </div>`;
  document.body.appendChild(root);

  root.querySelector('#ob-skip').addEventListener('click', done);
  root.querySelector('#ob-back').addEventListener('click', () => { collect(); step = Math.max(0, step - 1); render(); });
  root.querySelector('#ob-next').addEventListener('click', () => {
    collect();
    if (step < STEPS - 1) { step++; render(); } else finish();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); root.querySelector('#ob-next').click(); }
  });
}

function show() {
  root.hidden = false;
  document.body.classList.add('ob-active');
  void root.offsetWidth;
  root.classList.add('is-open');
}

function close() {
  if (!root) return;
  root.classList.remove('is-open');
  document.body.classList.remove('ob-active');
  setTimeout(() => { if (root) { root.remove(); root = null; } }, 220);
}
