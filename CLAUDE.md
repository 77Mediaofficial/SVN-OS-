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
- `init()` may return a cleanup function; the router calls it before loading the next route

### Supabase Client
- `js/supabase.js` is a singleton — all modules import `db` from here
- Supabase JS v2 is loaded via CDN `<script>` tag (not npm)
- The global `supabase.createClient()` is used since there's no bundler
- **Credentials are placeholder values** — must be replaced with real project URL and anon key
- Exports: `db`, `getCurrentUser()`, `signIn()`, `signUp()`, `signOut()`, `isAuthenticated()`

### Authentication
- `js/auth.js` provides `requireAuth()`, `onAuthStateChange()`, `signOut()`, and an auth modal
- All routes require authentication — unauthenticated users see the auth modal automatically
- `requireAuth()` accepts `{ voluntary: true }` to show a close button on the modal
- Auth state updates the nav sidebar user display (name, email, avatar initial) in `index.html`
- Sign-in, sign-up, and sign-out all show toast feedback
- Supabase handles sessions via cookies/localStorage automatically

### Toast Notification System
- `js/toast.js` exports `showToast(message, type)` where type is `'success'` | `'error'` | `'info'` | `'warning'`
- Self-contained: injects its own CSS on first call, no external stylesheet needed
- Fixed bottom-right position, auto-dismiss after 4 seconds, click to dismiss early
- Progress bar animates down during the toast lifetime
- Max 4 toasts visible at once; oldest is dismissed when the limit is exceeded
- All CRUD operations across the app show toast feedback on success and error
- Uses `createTextNode()` for message content (XSS-safe)

### Command Palette
- `js/command-palette.js` exports `initCommandPalette()`, called once on app startup
- Triggered by `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux)
- Spotlight-style overlay with fuzzy search across navigation routes and actions
- Commands: navigate to Dashboard/Content Engine/Calendar/Deals & Ledger, create new project/deal/transaction, sign out
- Keyboard navigation: Arrow Up/Down to move, Enter to select, Escape to close
- Footer shows keyboard hints (`<kbd>` elements)

### Error Handling
- All Supabase calls are wrapped in `try/catch` blocks
- Errors show toast notifications with the error message
- Failed data loads degrade gracefully with empty state messages (e.g., "No deals found", "No pipeline data yet")
- Form submit buttons are disabled during async operations to prevent double submission
- Optimistic UI updates (e.g., drag-and-drop) revert on server failure

### Security
- Row Level Security (RLS) enabled on all four tables — users only see their own data
- `escapeHtml()` helper used everywhere when rendering user data into the DOM (creates a text node, returns innerHTML)
- Auth modal blocks access to all routes for unauthenticated users
- Vercel security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
- Form inputs use `autocomplete` attributes appropriately; password fields use `autocomplete="new-password"`

### Database Schema (`sql/schema.sql`)
Four tables, all with Row Level Security (users only see their own data):
- `profiles` — extends `auth.users` (fields: `full_name`, `avatar_url`, `bio`, `website`), auto-created via trigger on signup
- `content_projects` — content pipeline (idea → scripting → production → ready → posted → archived)
- `brand_deals` — CRM for sponsorships (lead → negotiating → signed → in_progress → completed → lost)
- `transactions` — income/expense ledger, optionally linked to deals via `deal_id`

Enum types: `content_status`, `content_platform`, `deal_status`, `transaction_type`, `transaction_category`

Database indexes on: `user_id`, `status`, `scheduled_at`, `date`, `type` columns for query performance.

All tables have `updated_at` auto-update triggers.

## Features by Route

### Dashboard (`/`)
- **Revenue metrics** with count-up animations (income, expenses, net) and monthly % comparison badges
- **Revenue goal progress** bar tracking against a configurable target ($10,000 default)
- **30-day sparkline** SVG chart showing daily income trend
- **Active deals metric** with month-over-month comparison
- **Pipeline snapshot** — horizontal bar chart showing project counts by stage (idea, scripting, production, ready)
- **Action items** — list of active projects in early pipeline stages
- **Recent deals** — last 4 deals with status badges and values
- **Platform distribution** — bar chart showing content count per platform
- **Upcoming deadlines** — deals with deadlines in the next 14 days, color-coded by urgency (urgent/soon/normal)
- **Activity feed** — unified timeline of recent content, deal, and transaction changes with SVG icons

### Content Engine (`/content`)
- **Kanban board** with columns for each pipeline stage (idea, scripting, production, ready, posted)
- **Drag-and-drop** with optimistic UI — card moves immediately, reverts on server failure
- **Search and filter** — text search across title/description, platform dropdown filter, debounced input (300ms)
- **Archived toggle** — checkbox to show/hide archived projects in a separate grid
- **Progress indicators** — step indicators on each card showing pipeline position (1-5)
- **Slide-over detail panel** — click a card to see full project details (title, platform, status, description, scheduled/published dates, notes, timestamps) with edit/delete actions
- **Create/edit modal** — form with title, description, platform select, status select, scheduled date, and notes
- **Summary bar** — shows total project count and counts per active status
- **Keyboard shortcuts** — `N` to create new project, `Escape` to close panels/modals
- **Platform badges** — color-coded by platform on each card
- **Separate CSS module** — `css/modules/content-engine.css` for kanban-specific styles

### Calendar (`/calendar`)
- **Monthly grid** with previous/next month navigation and "Today" button
- **Week numbers** column (ISO week) displayed alongside each row
- **Platform filter chips** — clickable chip bar to filter content by platform, with "All" default
- **Content count badge** — shows total scheduled items for the current month (filtered)
- **Content pills** — colored by platform, up to 3 per day cell with "+N more" overflow indicator
- **Day detail overlay** — click a day cell to see all scheduled content with platform, status, description, notes, and time
- **Platform legend** — color-coded platform indicators
- **Keyboard navigation** — Arrow Left/Right to change months, Escape to close day detail
- **Click-through** — pills and detail items navigate to the Content Engine with a toast notification

### Deals & Ledger (`/deals`)
- **Deals table** with columns: brand name, status badge, value, deadline, actions (edit/delete)
- **Deal status filter** — button bar to filter by status (all, lead, negotiating, signed, in_progress, completed, lost)
- **Deal create/edit modal** — form with brand name, contact name/email, status, value, deadline, deliverables, notes
- **Transactions table** with columns: date, description, category, type badge (income/expense), amount (color-coded), actions
- **Transaction create/edit modal** — form with type, category, amount, description, date, linked deal select
- **Financial summary** — total income, total expenses, and net (color-coded positive/negative)
- **Deal select in transactions** — dropdown populated from current deals to link transactions to deals
- **AbortController cleanup** — all event listeners use signal-based cleanup on route change

### Settings (`/settings`)
- **Profile editing** — avatar display (image or initials), full name, bio, website, email (read-only)
- **Profile save** updates both the `profiles` table and `auth.user_metadata` so the nav sidebar reflects changes
- **Appearance controls**:
  - **Font size** — select dropdown (small 13px / default 15px / large 17px), persisted in localStorage as `svn-os-font-size`, applied via `document.documentElement.style.fontSize`
  - **Compact mode** — toggle switch, persisted in localStorage as `svn-os-compact-mode`, toggles `body.compact-mode` class
  - Preferences are applied immediately on page load via `applySavedPreferences()` before any async work
- **Password change** — current password, new password (min 6 chars), confirm new password with validation
- **Sign out** — with confirmation dialog
- **Delete account** — button present but shows a "contact support" toast (not yet implemented)
- **Keyboard shortcuts reference** — lists all app shortcuts with `<kbd>` styled key indicators
- **Version display** — shows "SVN OS v1.0"

## File Structure

```
index.html                    App shell (nav sidebar + router outlet + startup script)
vercel.json                   Vercel SPA rewrites + security headers
css/
  main.css                    Design system (tokens, components, responsive)
  modules/
    content-engine.css        Kanban board, cards, slide-over, drag-and-drop styles
js/
  supabase.js                 Supabase client singleton (db, auth helpers)
  router.js                   History API SPA router with cleanup support
  auth.js                     Auth modal, session guards, sign-out with toast
  toast.js                    Toast notification system (showToast export)
  command-palette.js          Cmd+K command palette with fuzzy search
  modules/
    dashboard.js              Dashboard: metrics, sparklines, activity feed, deadlines
    content-engine.js          Content Engine: kanban, drag-and-drop, search, slide-over
    calendar.js               Calendar: monthly grid, platform filters, day detail
    deals-ledger.js           Deals & Ledger: deal/transaction CRUD, filters, summary
    settings.js               Settings: profile, appearance, password, sign out
pages/
  dashboard.html              Dashboard view partial
  content-engine.html         Content Engine view partial (kanban board)
  calendar.html               Calendar view partial (grid + filters)
  deals-ledger.html           Deals & Ledger view partial (tables + modals)
  settings.html               Settings view partial (profile + appearance + account)
sql/
  schema.sql                  Full PostgreSQL schema for Supabase (4 tables + RLS)
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
- Toast integration: call `showToast(message, type)` from `js/toast.js` for all user-facing feedback
- Cleanup pattern: `init()` returns a cleanup function; the router calls it on route change to remove event listeners and timers
- AbortController: `deals-ledger.js` uses `AbortController` + `{ signal }` for bulk event listener cleanup
- Optimistic UI: content engine drag-and-drop updates the UI immediately and reverts on server error
- localStorage keys: `svn-os-font-size` (string: small/default/large), `svn-os-compact-mode` (string: true/false)

### Adding a New Route
1. Create `pages/new-page.html` (HTML partial)
2. Create `js/modules/new-page.js` with `export async function init() { ... }` (optionally return a cleanup function)
3. Add the route to the `routes` object in `js/router.js`
4. Add a `<a class="nav-link" data-route="/new-path">` entry in `index.html`
5. Optionally add the route to the `commands` array in `js/command-palette.js`

### Adding a New Database Table
1. Add the SQL to `sql/schema.sql`
2. Always enable RLS and add per-user policies (`auth.uid() = user_id`)
3. Add an `updated_at` trigger using the existing `update_updated_at()` function
4. Run the new SQL in Supabase SQL Editor

## Design System

- **Color scheme:** Near-black backgrounds (#0a0a0a, #111, #1a1a1a), white text, subtle borders
- **Typography:** Inter (sans), JetBrains Mono (mono), font-weight 300 for headlines
- **Components:** `.card`, `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.metric-card`, `.badge-*`, `.modal-overlay`, `.toggle-switch`
- **Responsive:** Sidebar collapses to hamburger menu below 768px; grid stacks below 1024px
- **Compact mode:** `body.compact-mode` reduces padding and spacing globally
- **Font size override:** Applied via `document.documentElement.style.fontSize` from localStorage
- **No emoji in UI.** Keep the aesthetic stark and professional.

## Common Pitfalls
- Don't import from npm — there's no bundler. Use CDN scripts or inline ES modules.
- The Supabase client uses the global `supabase` object from the CDN script, not an npm import.
- HTML partials must not contain `<html>`, `<head>`, or `<body>` — they're injected into `#app-outlet`.
- All Supabase queries are scoped by RLS — no need to filter by `user_id` in client code, but the `user_id` column must be set on inserts.
- Always wrap Supabase calls in `try/catch` and show toast feedback on both success and failure.
- Always use `escapeHtml()` when injecting user-provided strings into innerHTML. Never use raw string interpolation with user data.
- When adding new commands to the command palette, import `navigate` from `/js/router.js` (absolute path).
- Module cleanup functions must remove any global event listeners (e.g., `document.addEventListener`) to prevent memory leaks across route changes.
- Settings preferences (font size, compact mode) must be applied synchronously on page load — do not gate them behind async auth checks.
