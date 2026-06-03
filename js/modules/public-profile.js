import { db } from '../supabase.js';

export async function init(params) {
  const username = (params?.username || '').toLowerCase();
  const container = document.getElementById('pp-content');
  if (!container) return;

  // Hide the app shell's main nav while viewing a public profile so it
  // really feels like a shareable page. The router's outlet still works,
  // so we just toggle a body class.
  document.body.classList.add('public-view');

  let profile = null;
  try {
    const { data, error } = await db
      .from('profiles')
      .select('id, username, full_name, avatar_url, bio, website')
      .ilike('username', username)
      .not('username', 'is', null)
      .maybeSingle();

    if (error) throw error;
    profile = data;
  } catch {
    profile = null;
  }

  if (!profile) {
    container.innerHTML = `
      <div class="pp-not-found">
        <h2>Profile not found</h2>
        <p>No SVN OS creator with that handle.</p>
      </div>
    `;
    document.title = 'Not found — SVN OS';
    return cleanup;
  }

  // Fetch a couple of public-safe stats. RLS will only return rows the
  // viewer is allowed to see — for anonymous viewers, that's nothing,
  // so these counts are best-effort and degrade to 0.
  let postedCount = 0;
  let dealsCount = 0;
  try {
    const [postedRes, dealsRes] = await Promise.all([
      db.from('content_projects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('status', 'posted'),
      db.from('brand_deals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('status', 'completed'),
    ]);
    postedCount = postedRes.count || 0;
    dealsCount = dealsRes.count || 0;
  } catch {
    // Silently swallow — counts default to 0
  }

  const memberSince = (() => {
    // Profile created_at isn't selected publicly; we'll estimate from
    // the auth user record if available, but for now just hide if not.
    return null;
  })();

  const initials = (profile.full_name || profile.username || '?')
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('') || '?';

  const websiteHost = (() => {
    if (!profile.website) return null;
    try {
      const u = new URL(profile.website.startsWith('http') ? profile.website : `https://${profile.website}`);
      return { href: u.href, label: u.hostname.replace(/^www\./, '') };
    } catch {
      return null;
    }
  })();

  document.title = `${profile.full_name || profile.username} — SVN OS`;

  container.innerHTML = `
    <div class="pp-card">
      <div class="pp-avatar" id="pp-avatar"></div>
      <h1 class="pp-name"></h1>
      <div class="pp-handle"></div>
      <div class="pp-bio"></div>
      <div id="pp-website-wrap"></div>
      <div class="pp-stats">
        <div class="pp-stat">
          <div class="pp-stat-value">${postedCount}</div>
          <div class="pp-stat-label">Posted</div>
        </div>
        <div class="pp-stat">
          <div class="pp-stat-value">${dealsCount}</div>
          <div class="pp-stat-label">Completed deals</div>
        </div>
        <div class="pp-stat">
          <div class="pp-stat-value">SVN</div>
          <div class="pp-stat-label">Creator</div>
        </div>
      </div>
    </div>
    <div class="pp-footer">
      Built on <a href="/" data-route="/">SVN OS</a>
    </div>
  `;

  // Populate with createTextNode to stay XSS-safe.
  const avatarEl = container.querySelector('#pp-avatar');
  if (profile.avatar_url) {
    const img = document.createElement('img');
    img.src = profile.avatar_url;
    img.alt = '';
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = initials;
  }
  container.querySelector('.pp-name').textContent = profile.full_name || profile.username;
  container.querySelector('.pp-handle').textContent = `@${profile.username}`;
  const bioEl = container.querySelector('.pp-bio');
  if (profile.bio) {
    bioEl.textContent = profile.bio;
  } else {
    bioEl.remove();
  }
  const wrap = container.querySelector('#pp-website-wrap');
  if (websiteHost) {
    const a = document.createElement('a');
    a.className = 'pp-website';
    a.href = websiteHost.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = websiteHost.label;
    wrap.appendChild(a);
  }

  return cleanup;
}

function cleanup() {
  document.body.classList.remove('public-view');
  document.title = 'SVN OS — Creator Dashboard';
}
