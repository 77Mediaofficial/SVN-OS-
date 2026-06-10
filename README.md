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

Recreated in this pass: the four core modules (Dashboard, Content Engine kanban
with drag, Calendar with drag-to-reschedule, Deals & Ledger with recurring
transactions and CSV export), auth + RLS schema, PWA shell, demo seeder,
empty states, skeletons, responsive layout.

Phase 2 parity candidates from the original progress report: command palette
(Cmd+K), notifications centre, offline write queue, public profiles
(`/u/:username`), goals & analytics pages, settings with custom stage labels,
invoicing (PDF), content templates, AI idea generator + deadline-reminder edge
functions, Capacitor native build, unit tests.
