# CLAUDE.md — SVN OS (Creator Dashboard)

## Project Overview

SVN OS is a centralized web application for digital creators to manage their entire business lifecycle: content pipelines, posting schedules, brand deals, and financial tracking. The aesthetic is cinematic, dark-mode, high-contrast minimalism — not a standard SaaS dashboard.

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (ES modules, no bundler)
- **Backend/Auth/DB:** Supabase (PostgreSQL + Auth + RLS)
- **Deployment:** Vercel (static site with SPA rewrites)
- **No frameworks, no build step.** Files are served as-is.

## Architecture

### SPA Routing
- `index.html` is the app shell (nav sidebar + `<main id="app-outlet">`)
- `js/router.js` uses the History API to intercept `[data-route]` clicks
- Route changes fetch HTML partials from `pages/*.html` and inject into the outlet
- Each route lazy-loads its JS module from `js/modules/*.js` via dynamic `import()`
- Modules export an `init()` function called after the HTML partial is injected

### Supabase Client
- `js/supabase.js` is a singleton — all modules import `db` from here
- Supabase JS v2 is loaded via CDN `<script>` tag (not npm)
- The global `supabase.createClient()` is used since there's no bundler
- **Credentials are placeholder values** — must be replaced with real project URL and anon key

### Authentication
- `js/auth.js` provides `requireAuth()`, `onAuthStateChange()`, and an auth modal
- Auth state updates the nav sidebar user display in `index.html`
- Supabase handles sessions via cookies/localStorage automatically

### Database Schema (`sql/schema.sql`)
Four tables, all with Row Level Security (users only see their own data):
- `profiles` — extends `auth.users`, auto-created via trigger on signup
- `content_projects` — content pipeline (idea → scripting → production → ready → posted)
- `brand_deals` — CRM for sponsorships (lead → negotiating → signed → completed)
- `transactions` — income/expense ledger, optionally linked to deals via `deal_id`

Enum types: `content_status`, `content_platform`, `deal_status`, `transaction_type`, `transaction_category`

All tables have `updated_at` auto-update triggers.

## File Structure

```
index.html              App shell (nav + router outlet)
vercel.json             Vercel SPA rewrites + security headers
css/main.css            Design system (tokens, components, responsive)
js/
  supabase.js           Supabase client singleton (db export)
  router.js             History API SPA router
  auth.js               Auth modal, session guards
  modules/
    dashboard.js        Dashboard: revenue metrics, pipeline, deals
    content-engine.js   Content Engine (placeholder)
    calendar.js         Posting Calendar (placeholder)
    deals-ledger.js     Deals & Ledger (placeholder)
pages/
  dashboard.html        Dashboard view partial
  content-engine.html   Content Engine view partial
  calendar.html         Calendar view partial
  deals-ledger.html     Deals & Ledger view partial
sql/
  schema.sql            Full PostgreSQL schema for Supabase
```

## Development

### Run Locally
```bash
npx serve .
```
Then open http://localhost:3000

### Key Patterns
- All JS uses ES modules (`import`/`export`) with `<script type="module">`
- CSS uses custom properties (CSS variables) defined in `:root` in `css/main.css`
- HTML partials in `pages/` are fragments (no `<html>`, `<head>`, or `<body>` tags)
- Navigation uses `data-route` attributes, not `<a href>` — the router intercepts clicks
- XSS prevention: use `escapeHtml()` (creates a text node) when rendering user data

### Adding a New Route
1. Create `pages/new-page.html` (HTML partial)
2. Create `js/modules/new-page.js` with `export async function init() { ... }`
3. Add the route to the `routes` object in `js/router.js`
4. Add a `<a class="nav-link" data-route="/new-path">` entry in `index.html`

### Adding a New Database Table
1. Add the SQL to `sql/schema.sql`
2. Always enable RLS and add per-user policies (`auth.uid() = user_id`)
3. Add an `updated_at` trigger using the existing `update_updated_at()` function
4. Run the new SQL in Supabase SQL Editor

## Design System

- **Color scheme:** Near-black backgrounds (#0a0a0a, #111, #1a1a1a), white text, subtle borders
- **Typography:** Inter (sans), JetBrains Mono (mono), font-weight 300 for headlines
- **Components:** `.card`, `.btn`, `.btn-primary`, `.btn-ghost`, `.metric-card`, `.badge-*`, `.modal-overlay`
- **Responsive:** Sidebar collapses to hamburger menu below 768px; grid stacks below 1024px
- **No emoji in UI.** Keep the aesthetic stark and professional.

## Common Pitfalls
- Don't import from npm — there's no bundler. Use CDN scripts or inline ES modules.
- The Supabase client uses the global `supabase` object from the CDN script, not an npm import.
- HTML partials must not contain `<html>`, `<head>`, or `<body>` — they're injected into `#app-outlet`.
- All Supabase queries are scoped by RLS — no need to filter by `user_id` in client code, but the `user_id` column must be set on inserts.
