/* ============================================================
   SVN OS — Install Prompt
   Captures the beforeinstallprompt event (Chromium) and shows a
   tasteful install banner. On iOS Safari, which has no install
   event, shows an "Add to Home Screen" hint instead.
   ============================================================ */

const DISMISS_KEY = 'svn-os-install-dismissed';
const DISMISS_DAYS = 21; // re-ask after this many days

let deferredPrompt = null;
let bannerEl = null;
let styleInjected = false;

export function initInstallPrompt() {
  // Already installed (running standalone)? Never show.
  if (isStandalone()) return;
  if (isDismissedRecently()) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner({ ios: false });
  });

  window.addEventListener('appinstalled', () => {
    dismissBanner();
    deferredPrompt = null;
    try { localStorage.removeItem(DISMISS_KEY); } catch {}
  });

  // iOS Safari: no beforeinstallprompt. Offer the manual hint after a beat.
  if (isIOS() && isSafari()) {
    setTimeout(() => {
      if (!isStandalone() && !isDismissedRecently()) showBanner({ ios: true });
    }, 4000);
  }
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isSafari() {
  return /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
}

function isDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!isFinite(ts)) return false;
    const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    return ageDays < DISMISS_DAYS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
}

function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .install-banner {
      position: fixed;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%) translateY(8px);
      width: min(440px, calc(100vw - 24px));
      background: #151515;
      border: 1px solid #2a2a2a;
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
      padding: 16px 18px;
      z-index: 9500;
      display: flex;
      align-items: center;
      gap: 14px;
      opacity: 0;
      transition: opacity 220ms ease, transform 220ms cubic-bezier(0.4,0,0.2,1);
    }
    .install-banner.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
    .install-icon {
      width: 42px; height: 42px; flex-shrink: 0;
      border-radius: 10px;
      background: linear-gradient(145deg, #1e1e1e, #111);
      border: 1px solid #2a2a2a;
      display: flex; align-items: center; justify-content: center;
      color: #fff;
    }
    .install-body { flex: 1; min-width: 0; }
    .install-title { font-size: 0.88rem; font-weight: 600; color: #f0f0f0; }
    .install-text { font-size: 0.74rem; color: #888; margin-top: 2px; line-height: 1.4; }
    .install-actions { display: flex; gap: 8px; flex-shrink: 0; }
    .install-btn {
      font-size: 0.78rem; font-weight: 500;
      padding: 8px 14px; border-radius: 8px; cursor: pointer;
      border: 1px solid transparent; transition: background 150ms ease, color 150ms ease;
      white-space: nowrap;
    }
    .install-btn-primary { background: #fff; color: #0a0a0a; }
    .install-btn-primary:hover { background: #e0e0e0; }
    .install-btn-ghost { background: transparent; color: #888; border-color: #2a2a2a; }
    .install-btn-ghost:hover { color: #fff; border-color: #444; }
    .install-dismiss {
      background: none; border: none; color: #555; cursor: pointer;
      font-size: 1.1rem; line-height: 1; padding: 2px 4px; flex-shrink: 0;
      transition: color 150ms ease;
    }
    .install-dismiss:hover { color: #fff; }
    @media (max-width: 480px) {
      .install-banner { flex-wrap: wrap; bottom: 12px; }
      .install-actions { width: 100%; }
      .install-btn { flex: 1; text-align: center; }
    }
  `;
  document.head.appendChild(style);
}

function showBanner({ ios }) {
  if (bannerEl) return;
  injectStyles();

  bannerEl = document.createElement('div');
  bannerEl.className = 'install-banner';
  bannerEl.setAttribute('role', 'dialog');
  bannerEl.setAttribute('aria-label', 'Install SVN OS');

  const icon = `
    <div class="install-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/>
      </svg>
    </div>`;

  if (ios) {
    bannerEl.innerHTML = `
      ${icon}
      <div class="install-body">
        <div class="install-title">Install SVN OS</div>
        <div class="install-text">Tap the Share icon, then "Add to Home Screen" for the full-screen app.</div>
      </div>
      <button class="install-dismiss" id="install-x" aria-label="Dismiss">&times;</button>
    `;
  } else {
    bannerEl.innerHTML = `
      ${icon}
      <div class="install-body">
        <div class="install-title">Install SVN OS</div>
        <div class="install-text">Add it to your device for a faster, full-screen experience.</div>
      </div>
      <div class="install-actions">
        <button class="install-btn install-btn-ghost" id="install-later">Not now</button>
        <button class="install-btn install-btn-primary" id="install-go">Install</button>
      </div>
    `;
  }

  document.body.appendChild(bannerEl);
  requestAnimationFrame(() => bannerEl && bannerEl.classList.add('visible'));

  bannerEl.querySelector('#install-x')?.addEventListener('click', () => {
    markDismissed();
    dismissBanner();
  });
  bannerEl.querySelector('#install-later')?.addEventListener('click', () => {
    markDismissed();
    dismissBanner();
  });
  bannerEl.querySelector('#install-go')?.addEventListener('click', async () => {
    if (!deferredPrompt) { dismissBanner(); return; }
    dismissBanner();
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {}
    deferredPrompt = null;
  });
}

function dismissBanner() {
  if (!bannerEl) return;
  bannerEl.classList.remove('visible');
  const el = bannerEl;
  bannerEl = null;
  setTimeout(() => { if (el.parentNode) el.remove(); }, 240);
}
