/* ============================================================
   SVN OS — Landing page (signed-out marketing view)
   Public route. CTAs open the auth modal. If the visitor is
   already signed in, bounce them straight to the dashboard.
   ============================================================ */

import { requireAuth } from '/js/auth.js';
import { getCurrentUser } from '/js/supabase.js';
import { navigate } from '/js/router.js';

export async function init() {
  document.body.classList.add('landing-view');

  // If already authenticated, don't show the marketing page.
  const user = await getCurrentUser();
  if (user) {
    navigate('/');
    return cleanup;
  }

  const openAuth = (e) => {
    if (e) e.preventDefault();
    // Voluntary so the modal shows a close button.
    requireAuth({ voluntary: true });
  };

  ['lp-get-started', 'lp-get-started-2', 'lp-sign-in'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', openAuth);
  });

  return cleanup;
}

function cleanup() {
  document.body.classList.remove('landing-view');
}
