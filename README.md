# SVN OS — Creator Operating System

One quiet place to run a creative business: content pipeline, posting calendar,
brand deals, and income ledger. No tab-juggling, no clunky SaaS chrome.

**Stack:** vanilla JS (ES modules, no bundler) · Supabase (Postgres + Auth + RLS) · Vercel · PWA

## Running locally

```bash
node scripts/dev-server.mjs     # http://localhost:4173
```

(Any static server with an SPA fallback to `index.html` works; the bundled
script needs nothing but Node. Note: `npx serve -s` won't work as-is — its
clean-URLs redirect breaks the router's page-fragment fetches.)

Out of the box the app runs in **demo mode** — a seeded sample business stored in
`localStorage` — so every screen is explorable before any backend exists.
A brass pill in the sidebar reminds you it's demo data. Reset it from the
console with `svnos.resetDemo()`.

## Connecting Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the whole of [`sql/schema.sql`](sql/schema.sql), run it.
   (Creates `profiles`, `content_projects`, `brand_deals`, `transactions`,
   enums, RLS policies, `updated_at` triggers, and the auto-profile-on-signup trigger.)
3. Copy your **Project URL** and **anon public key** (Settings → API) into
   [`js/supabase.js`](js/supabase.js).
4. Reload. Demo mode switches off automatically and the auth gate appears.

## Deploying to Vercel

```bash
npm i -g vercel   # if needed
vercel --prod
```

`vercel.json` already handles SPA rewrites (deep links like `/calendar` resolve
to `index.html`) and cache headers. The service worker only registers on
non-localhost hosts, so local development never fights a stale cache.

## Deploy checklist

| # | Step | Status |
|---|------|--------|
| 1 | Run `sql/schema.sql` in Supabase SQL Editor | ☐ |
| 2 | Paste Supabase credentials into `js/supabase.js` | ☐ |
| 3 | `vercel --prod` | ☐ |
| 4 | Create a GitHub repo and push (source control) | ☐ |
| 5 | Sign up in the deployed app, confirm RLS by checking another account sees nothing | ☐ |

## Security & privacy

The data boundary is **Supabase auth + Postgres row-level security**: every
table enforces `auth.uid() = user_id` for read and write, length-checked
columns resist junk-data abuse, and the only public surface is profiles that
have explicitly set a username. On top of that:

- **App Lock** — gate the UI behind the device's screen lock (Face ID /
  fingerprint / Windows Hello via WebAuthn platform authenticators) or a PIN
  stored only as PBKDF2-SHA-256 (210k iterations, per-device salt). Auto-locks
  after 5 minutes idle or 30 seconds backgrounded; the app blurs instantly in
  the app switcher, iOS-style. It's a per-device privacy screen — forgetting
  the PIN never loses data (erase the device, sign back in).
- **Privacy sheet** (shield icon, sidebar) — one place to enable the lock,
  **export everything as JSON**, or **erase this device** (local data, drafts,
  caches, session).
- **No third parties** — fonts are self-hosted, the single CDN dependency
  (supabase-js) is version-pinned, and there are no analytics or trackers.
  In demo mode the app makes zero network requests beyond its own files.
- **Hard headers** (`vercel.json`, mirrored by the dev server): a strict
  Content-Security-Policy, `frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy: no-referrer`, HSTS, COOP, and a deny-by-default
  Permissions-Policy.
- **XSS hygiene** — all user content rendered through one escaper; toasts are
  text-only; the service worker caches same-origin GETs only (API responses
  are never cached).

## Project structure

```
index.html              app shell: sidebar nav, auth gate, modals, toast root
css/main.css            design system (cinematic editorial dark)
js/
  app.js                boot: routes, auth gating, service worker
  router.js             History-API SPA router (fragments + lazy modules)
  supabase.js           connection utility + DEMO_MODE switch
  store.js              data layer: Supabase repos / localStorage demo seed
  auth.js               email+password auth, auth gate form
  applock.js            App Lock (WebAuthn/PIN) + privacy sheet
  domain.js             stages, platforms, statuses, categories
  drag.js               pointer drag & drop (kanban + calendar)
  toast.js, ui.js       notifications, formatting, dialogs
  modules/              one file per route
pages/                  HTML fragments per route
sql/schema.sql          run-once database schema
sw.js, manifest.json    PWA: shell precache, installability
vercel.json             SPA rewrites + cache headers
```

## What's here vs. the full build-progress vision

Recreated so far: the four core modules (Dashboard, Content Engine kanban with
drag, Calendar with drag-to-reschedule, Deals & Ledger with recurring
transactions and CSV export), **Analytics** (monthly money chart, category mix,
content output, win rate, 3/6/12-month ranges), **goals & business settings**
(monthly targets with progress, feeding the dashboard), **client invoicing**
(print-ready PDF from any deal, auto-numbered, editable line items), the
**paid-deal → ledger automation**, auth + RLS schema with `user_preferences`,
App Lock + privacy sheet, PWA shell, demo seeder, responsive layout.

Phase 2 parity candidates from the original progress report: command palette
(Cmd+K), notifications centre, offline write queue, public profiles
(`/u/:username`), custom stage labels, invoice history, content templates,
AI idea generator + deadline-reminder edge functions, Capacitor native build,
unit tests.
