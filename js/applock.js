/* App Lock + Privacy & Security sheet.

   Lock methods:
   - 'webauthn': the device's screen lock (Face ID / fingerprint /
     Windows Hello) via a platform authenticator. Unlocking requires
     user verification by the OS.
   - 'pin': 4–8 digits, stored only as PBKDF2-SHA-256 (210k iterations,
     random salt). The PIN itself never leaves the device.

   The lock is a privacy screen for the device in hand — the real data
   boundary is Supabase auth + row-level security. Forgetting the
   PIN therefore never loses data: the escape hatch wipes this device
   and signs out, and the account password gets back in.

   Auto-locks after IDLE_MS without input or HIDDEN_MS in the
   background; the app blurs the moment it's backgrounded (app-switcher
   privacy, like iOS). */

import { supabase, DEMO_MODE } from './supabase.js';
import { projects, deals, transactions, getProfile } from './store.js';
import { toast } from './toast.js';
import { bindDialog, confirmAction, todayKey } from './ui.js';

const LS_KEY = 'svnos-lock-v1';
const IDLE_MS = 5 * 60 * 1000;
const HIDDEN_MS = 30 * 1000;
const PBKDF2_ITERATIONS = 210000;

let cfg = loadCfg();
let locked = false;
let idleTimer = null;
let hiddenAt = 0;

function loadCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEY));
    if (!c || typeof c !== 'object') return null;
    // Only honour a structurally-complete config. A corrupt/partial one would
    // show the lock screen but make every unlock attempt throw — a hard brick.
    if (c.method === 'pin' && c.salt && c.hash) return c;
    if (c.method === 'webauthn' && c.credId) return c;
    return null;
  } catch { return null; }
}
function saveCfg(next) {
  cfg = next;
  if (next) localStorage.setItem(LS_KEY, JSON.stringify(next));
  else localStorage.removeItem(LS_KEY);
}

/* ── Crypto helpers ──────────────────────────────────────── */

const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array((String(hex).match(/.{2}/g) || []).map((h) => parseInt(h, 16)));
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function hashPin(pin, saltHex) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS },
    key, 256);
  return toHex(new Uint8Array(bits));
}

async function biometricAvailable() {
  try {
    return !!window.PublicKeyCredential &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

async function registerBiometric() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'SVN OS', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'svn-os-lock',
        displayName: 'SVN OS App Lock',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  });
  return toB64(new Uint8Array(cred.rawId));
}

async function verifyBiometric() {
  await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: fromB64(cfg.credId) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
}

/* ── Lock / unlock ───────────────────────────────────────── */

export const isLockEnabled = () => !!cfg;

function lock() {
  if (!cfg || locked) return;
  locked = true;
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  document.body.classList.add('locked');

  const screen = document.getElementById('lock-screen');
  const bioBtn = document.getElementById('lock-bio-btn');
  const pinForm = document.getElementById('lock-pin-form');
  document.getElementById('lock-error').hidden = true;
  document.getElementById('lock-sub').textContent =
    cfg.method === 'pin' ? 'Enter your PIN.' : 'Unlock with your device screen lock.';
  bioBtn.hidden = cfg.method !== 'webauthn';
  pinForm.hidden = cfg.method !== 'pin';
  screen.hidden = false;

  if (cfg.method === 'pin') document.getElementById('lock-pin').focus();
  else bioBtn.focus();
}

function unlock() {
  locked = false;
  document.getElementById('lock-screen').hidden = true;
  document.getElementById('lock-pin').value = '';
  document.body.classList.remove('locked');
  pokeIdle();
}

function lockError(message) {
  const el = document.getElementById('lock-error');
  el.textContent = message;
  el.hidden = false;
}

/* ── Auto-lock ───────────────────────────────────────────── */

function pokeIdle() {
  if (!cfg || locked) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lock, IDLE_MS);
}

function onVisibility() {
  if (!cfg) return;
  if (document.hidden) {
    hiddenAt = Date.now();
    document.body.classList.add('shielded'); // instant privacy blur
  } else {
    document.body.classList.remove('shielded');
    if (!locked && Date.now() - hiddenAt > HIDDEN_MS) lock();
  }
}

/* ── Setup flow ──────────────────────────────────────────── */

async function enableLock() {
  const modal = document.getElementById('lock-setup-modal');
  const pinFields = document.getElementById('lock-pin-fields');
  const bioBtn = document.getElementById('lock-use-bio');
  const pinBtn = document.getElementById('lock-use-pin');
  const errEl = document.getElementById('lock-setup-error');

  errEl.hidden = true;
  pinFields.hidden = true;
  document.getElementById('setup-pin').value = '';
  document.getElementById('setup-pin2').value = '';

  const hasBio = await biometricAvailable();
  bioBtn.hidden = !hasBio;
  if (!hasBio) {
    pinFields.hidden = false;
    pinBtn.textContent = 'Set PIN';
    document.getElementById('lock-setup-sub').textContent =
      'No device screen lock available here — set a PIN instead.';
  } else {
    pinBtn.textContent = 'Use a PIN';
    document.getElementById('lock-setup-sub').textContent =
      "Use your device's screen lock — Face ID, fingerprint, Windows Hello — or set a PIN.";
  }
  modal.showModal();
}

async function onUseBiometric() {
  const errEl = document.getElementById('lock-setup-error');
  try {
    const credId = await registerBiometric();
    saveCfg({ method: 'webauthn', credId, created: todayKey() });
    document.getElementById('lock-setup-modal').close();
    syncPrivacySheet();
    toast('App Lock enabled — device screen lock.', 'success');
  } catch (err) {
    console.warn('webauthn setup failed', err);
    errEl.textContent = 'Device lock setup was cancelled or unavailable. Try a PIN.';
    errEl.hidden = false;
  }
}

async function onUsePin() {
  const pinFields = document.getElementById('lock-pin-fields');
  if (pinFields.hidden) {
    pinFields.hidden = false;
    document.getElementById('lock-use-pin').textContent = 'Set PIN';
    document.getElementById('setup-pin').focus();
    return;
  }
  const errEl = document.getElementById('lock-setup-error');
  const pin = document.getElementById('setup-pin').value.trim();
  const pin2 = document.getElementById('setup-pin2').value.trim();
  if (!/^\d{4,8}$/.test(pin)) {
    errEl.textContent = 'PIN must be 4–8 digits.';
    errEl.hidden = false;
    return;
  }
  if (pin !== pin2) {
    errEl.textContent = "PINs don't match.";
    errEl.hidden = false;
    return;
  }
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPin(pin, salt);
  saveCfg({ method: 'pin', salt, hash, created: todayKey() });
  document.getElementById('lock-setup-modal').close();
  syncPrivacySheet();
  toast('App Lock enabled — PIN.', 'success');
}

async function disableLock() {
  const ok = await confirmAction('Disable App Lock on this device?', { confirmLabel: 'Disable' });
  if (!ok) return;
  saveCfg(null);
  syncPrivacySheet();
  toast('App Lock disabled.');
}

/* ── Privacy sheet ───────────────────────────────────────── */

function syncPrivacySheet() {
  const btn = document.getElementById('priv-lock-btn');
  const sub = document.getElementById('priv-lock-sub');
  if (cfg) {
    btn.textContent = 'Disable';
    sub.textContent = cfg.method === 'webauthn'
      ? 'On — device screen lock. Auto-locks after 5 minutes idle or 30 seconds in the background.'
      : 'On — PIN. Auto-locks after 5 minutes idle or 30 seconds in the background.';
  } else {
    btn.textContent = 'Enable';
    sub.textContent = "Gate the app behind your device's screen lock or a PIN. Auto-locks after 5 minutes idle or 30 seconds in the background.";
  }
}

export function openPrivacySheet() {
  syncPrivacySheet();
  document.getElementById('privacy-modal').showModal();
}

async function exportAllData() {
  const btn = document.getElementById('priv-export-btn');
  btn.disabled = true;
  try {
    const [profile, projectRows, dealRows, txnRows] = await Promise.all([
      getProfile().catch(() => null),
      projects.list(), deals.list(), transactions.list(),
    ]);
    const payload = {
      app: 'svn-os',
      exported_at: new Date().toISOString(),
      mode: DEMO_MODE ? 'demo' : 'live',
      profile,
      content_projects: projectRows,
      brand_deals: dealRows,
      transactions: txnRows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `svn-os-export-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Data exported.', 'success');
  } catch (err) {
    console.error(err);
    toast('Export failed.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function eraseLocalData(skipConfirm = false) {
  if (!skipConfirm) {
    const ok = await confirmAction(
      'Erase all local data on this device and sign out? Synced data stays safe in your account.',
      { confirmLabel: 'Erase' });
    if (!ok) return;
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    // Unregister the service worker too — otherwise a stale precached build can
    // keep serving old code after an "erase".
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (!DEMO_MODE && supabase) await supabase.auth.signOut();
  } finally {
    location.reload();
  }
}

/* ── Wiring ──────────────────────────────────────────────── */

export function initAppLock() {
  bindDialog(document.getElementById('privacy-modal'));
  bindDialog(document.getElementById('lock-setup-modal'));

  document.getElementById('priv-lock-btn').addEventListener('click', () => {
    if (cfg) disableLock();
    else { document.getElementById('privacy-modal').close(); enableLock(); }
  });
  document.getElementById('priv-export-btn').addEventListener('click', exportAllData);
  document.getElementById('priv-erase-btn').addEventListener('click', () => eraseLocalData());

  document.getElementById('lock-use-bio').addEventListener('click', onUseBiometric);
  document.getElementById('lock-use-pin').addEventListener('click', onUsePin);

  document.getElementById('lock-bio-btn').addEventListener('click', async () => {
    try { await verifyBiometric(); unlock(); }
    catch { lockError('Verification failed — try again.'); }
  });

  document.getElementById('lock-pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('lock-pin').value.trim();
    if (!pin) return;
    const hash = await hashPin(pin, cfg.salt);
    if (hash === cfg.hash) unlock();
    else { lockError('Wrong PIN.'); document.getElementById('lock-pin').select(); }
  });

  document.getElementById('lock-escape').addEventListener('click', () => {
    // Native confirm: must work even while the app is locked.
    if (window.confirm('Erase all local data on this device and sign out?')) {
      eraseLocalData(true);
    }
  });

  window.addEventListener('pointerdown', pokeIdle, { passive: true });
  window.addEventListener('keydown', pokeIdle);
  document.addEventListener('visibilitychange', onVisibility);

  if (cfg) lock(); // cold-start lock, iOS-style
  else pokeIdle();
}
