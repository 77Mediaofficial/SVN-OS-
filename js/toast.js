/* ============================================================
   SVN OS — Toast Notification System
   Lightweight, dark-mode toast notifications
   ============================================================ */

let styleInjected = false;
const TOAST_LIMIT = 4;
const TOAST_DURATION = 4000;

const typeColors = {
  success: 'var(--color-success, #34d399)',
  error:   'var(--color-danger, #f87171)',
  info:    'var(--color-info, #60a5fa)',
  warning: 'var(--color-warning, #fbbf24)',
};

function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .svn-toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      display: flex;
      flex-direction: column-reverse;
      gap: 10px;
      z-index: 9999;
      pointer-events: none;
    }

    .svn-toast {
      pointer-events: auto;
      position: relative;
      min-width: 280px;
      max-width: 400px;
      padding: 14px 18px;
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      border-left: 3px solid var(--toast-color);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 0.82rem;
      color: #f0f0f0;
      line-height: 1.5;
      cursor: pointer;
      overflow: hidden;
      transform: translateX(120%);
      opacity: 0;
      transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
                  opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .svn-toast.svn-toast--visible {
      transform: translateX(0);
      opacity: 1;
    }

    .svn-toast.svn-toast--dismiss {
      transform: translateX(120%);
      opacity: 0;
    }

    .svn-toast-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      background: var(--toast-color);
      opacity: 0.6;
      border-radius: 0 0 0 8px;
      animation: svn-toast-progress var(--toast-duration) linear forwards;
    }

    @keyframes svn-toast-progress {
      from { width: 100%; }
      to   { width: 0%; }
    }

    @media (max-width: 480px) {
      .svn-toast-container {
        left: 16px;
        right: 16px;
        bottom: 16px;
      }

      .svn-toast {
        min-width: unset;
        max-width: unset;
        width: 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

function getContainer() {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.error('[SVN OS] Toast anchor #toast-container not found in the DOM. Toasts cannot be displayed.');
    return null;
  }
  // The anchor is a bare <div> in index.html; ensure it carries the
  // positioning class the injected styles depend on.
  container.classList.add('svn-toast-container');
  return container;
}

function dismissToast(el) {
  if (el.dataset.dismissed === 'true') return;
  el.dataset.dismissed = 'true';

  clearTimeout(Number(el.dataset.timerId));
  el.classList.remove('svn-toast--visible');
  el.classList.add('svn-toast--dismiss');

  el.addEventListener('transitionend', () => el.remove(), { once: true });
  // Fallback removal in case transitionend doesn't fire
  setTimeout(() => { if (el.parentNode) el.remove(); }, 400);
}

function enforceLimit(container) {
  const toasts = container.querySelectorAll('.svn-toast');
  if (toasts.length >= TOAST_LIMIT) {
    // Remove oldest (first in DOM, which is visually at the bottom of the stack)
    dismissToast(toasts[0]);
  }
}

/**
 * Show a toast notification.
 * @param {string} message - The message to display.
 * @param {'success'|'error'|'info'|'warning'} type - The toast type.
 */
export function showToast(message, type = 'info') {
  const container = getContainer();
  if (!container) return; // Fail gracefully — error already logged

  injectStyles();
  enforceLimit(container);

  const color = typeColors[type] || typeColors.info;

  const toast = document.createElement('div');
  toast.className = 'svn-toast';
  toast.style.setProperty('--toast-color', color);
  toast.style.setProperty('--toast-duration', `${TOAST_DURATION}ms`);

  const textNode = document.createTextNode(message);
  toast.appendChild(textNode);

  const progress = document.createElement('div');
  progress.className = 'svn-toast-progress';
  toast.appendChild(progress);

  toast.addEventListener('click', () => dismissToast(toast));

  container.appendChild(toast);

  // Trigger entrance animation on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('svn-toast--visible');
    });
  });

  // Auto-dismiss
  const timerId = setTimeout(() => dismissToast(toast), TOAST_DURATION);
  toast.dataset.timerId = String(timerId);
}
