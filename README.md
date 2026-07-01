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
A pill in the sidebar reminds you it's demo data. Reset it from the
console with `svnos.resetDemo()`.

Once Supabase credentials are wired the app runs in three states: **demo** (no creds),
**guest** (creds set but signed out — the public site still explores the seeded sample on
`localStorage`, never touching the database), and **live** (signed in — every read/write hits
Supabase under RLS). Guests reveal the sign-in gate on demand via the sidebar pill; data only
persists after sign-in.

## Connecting Supabase

**Already wired.** This app runs against a dedicated **London / eu-west-2** Supabase
project (ref `daqeghxsuvufqubsbmnv`); credentials live in [`js/supabase.js`](js/supabase.js)
and `DEMO_MODE` is off. The anon key there is public-safe — RLS is the gate. To stand up a
fresh project from scratch, repeat these steps:

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run, **in order**,
   [`sql/schema.sql`](sql/schema.sql) → [`sql/002_studio_tables.sql`](sql/002_studio_tables.sql)
   → [`sql/003_harden_rls.sql`](sql/003_harden_rls.sql).
   (schema.sql: `profiles`, `content_projects`, `brand_deals`, `transactions`, enums, RLS,
   `updated_at` triggers, auto-profile-on-signup. 002: `team_members`, `clients`, `sow_items`,
   `milestones`, `gear`, `review_comments` — the Studio/workspace tables, owner-scoped by RLS.
   003: advisor hardening — locks down the trigger fn, optimizes the RLS init-plan, indexes FKs.)
3. Copy your **Project URL** and **anon public key** (Settings → API) into
   [`js/supabase.js`](js/supabase.js).
4. In **Authentication → URL Configuration**, set the **Site URL** + redirect allowlist to your
   deployed origin (e.g. `https://svn-os.vercel.app`) so confirmation / reset emails resolve.
5. Reload. Demo mode switches off; signed-out visitors land **guest-first** (the showcase on
   local demo data, no login wall) and reveal the sign-in gate on demand. Real persistence
   begins only after sign-in.

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
| 1 | Run `schema.sql` → `002_studio_tables.sql` → `003_harden_rls.sql` on the London project | ✅ |
| 2 | Credentials wired into `js/supabase.js` (`DEMO_MODE` off) | ✅ |
| 3 | Advisors clean (security 0 findings, perf 0 warnings) + cross-user RLS proven by test | ✅ |
| 4 | Guest + live e2e verified (sign-in → write persists → reload → sign-out → guest) | ✅ |
| 5 | Dashboard → **Auth → URL Configuration**: set Site URL + redirect allowlist to prod origin | ☐ (owner) |
| 6 | Merge `keystone-live-supabase` → `main` → Vercel auto-deploys the live cred-flip | ☐ (sign-off) |

## Security & privacy

The data boundary is **Supabase auth + Postgres row-level security**: every
table enforces `auth.uid() = user_id` for read and write, length-checked
columns resist junk-data abuse, and there is no public read surface — even
`profiles` is owner-only. On top of that:

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
  appearance.js         device display prefs (text size, density)
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
drag, platform filter chips + search, Calendar with drag-to-reschedule, ISO
week numbers and platform filters, Deals & Ledger with status filter chips,
recurring transactions and CSV export), **Analytics** (monthly money chart,
deal conversion funnel, category mix, content output, win rate, 3/6/12-month
ranges, goal progress rings), **Settings** (profile editing, text-size +
compact-density appearance modes, privacy & account), **goals & business
settings** (monthly targets feeding the dashboard), **client invoicing**
(print-ready PDF from any deal, auto-numbered, editable line items), the
**paid-deal → ledger automation**, auth + RLS schema with `user_preferences`,
App Lock + privacy sheet, PWA shell, demo seeder, responsive layout.

Phase 2 parity candidates from the original progress report: command palette
(Cmd+K), notifications centre, offline write queue, public profiles
(`/u/:username`), custom stage labels, invoice history, content templates,
AI idea generator + deadline-reminder edge functions, Capacitor native build,
unit tests.
