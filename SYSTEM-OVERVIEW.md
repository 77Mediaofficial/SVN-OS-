# SVN OS — System Overview

> **Status verified 2026-07-01.** Living document — update on each material change to the build or backend status.
> Separates what is **implemented and running**, **implemented but not yet deployed**, and **not yet implemented**, so a maintainer can see the real state without inferring it.
>
> **🟢 KEYSTONE SHIPPED 2026-07-01.** SVN OS is live on a dedicated backend. `main` @ `b420475` deployed to `svn-os.vercel.app`; the app is out of demo mode and persisting to a dedicated London Supabase project. See §1 and the go-live record at the bottom.

## 1. Implemented & Running (live in production)

- **Client-side application (complete):** 9 modules — Content Engine, Calendar, Dashboard, Deals/Ledger, Invoicing, Analytics, Resizer (images/stills), Studio (SOW, milestone billing, client portal, review rooms, gear register), Settings.
- **Cross-cutting systems:** command palette / Cmd+K, keyboard shortcuts, first-run onboarding, toasts/undo, App Lock + PIN, appearance engine, workspace/roles/activity-log, live client/team CRUD.
- **Dedicated backend (LIVE):** Supabase project `SVN OS — App` (`daqeghxsuvufqubsbmnv`, London / eu-west-2). Schema + Studio tables + advisor hardening applied (`sql/schema.sql` → `002_studio_tables.sql` → `003_harden_rls.sql`): **11 tables, RLS enabled on all**. Security advisors **0 findings**; performance advisors **0 warnings**.
- **Guest/live three-state runtime (LIVE):** signed-out visitors land guest-first on demo data (no login wall, zero DB calls); real sign-ins persist to Supabase under RLS; offline outbox replays queued writes. Verified in the **production browser** (`DEMO_MODE=false`, guest render, SW `v21` active) and by anon live-wire (RLS returns 0 rows, no error).
- **Credentials wired:** `js/supabase.js` holds the live URL + public anon key (public by design; RLS is the gate). `DEMO_MODE` is off in production.
- **Edge/security controls (live & verified):** CSP with `style-src 'self'` (no unsafe-inline), HSTS + security headers, self-hosted fonts, pinned Supabase CDN dep, WCAG 2.2 AA pass.
- **Marketing funnel (live):** public pricing front door + `/early-access` waitlist writing to the shared Supabase `waitlist` table (anon-insert).

## 2. Proven at the DB/runtime layer — full end-user journey still pending

*These are verified as far as headless tooling honestly can; the parts needing a real inbox / dashboard config are flagged as the owner's step.*

- **Cross-user RLS isolation** — proven on a data-bearing table: owner sees own row, another user sees 0, anon sees 0 (via real JWT-claim impersonation). A real-session write (GoTrue `signInWithPassword` → RLS-gated insert) persisted across reload.
- **NOT yet exercised (owner ✋ step):** the real signup → confirmation-email delivery → redirect → first login → HIBP journey. Gated on the Site URL config below.

## 3. Not Yet Implemented (Pending)

**Auth hardening:**

- **Site URL / redirect allowlist** — ⚠️ **PENDING (owner dashboard step) — the one hard gate before real signups.** Set Site URL + redirect allowlist to `https://svn-os.vercel.app` in Supabase → Auth → URL Configuration, or confirmation/reset emails will not resolve.
- **Leaked-password (HIBP) protection** — off by default on the new project; enable in Auth → Providers → Email (optional, recommended pre-launch).
- **MFA** — not configured.
- **Email-confirmation policy** — set to **required** (chosen at go-live).

**Commercial integrations (roadmap P2 →):**

- **Billing (Stripe)** — not integrated; tiers (£19 / £49 / £129) are display-only. **Next up (P2).**
- **Transactional email (Resend)** — not integrated (P3).
- **File storage** — not integrated; blocks real uploads + video (P3).
- **Video** — Resizer is images/stills only (Phase 2); review rooms use a sample cut.
- **Social publishing (OAuth)** — platform fields are scheduling metadata only; no posting (P4 — the Connectors backend).
- **Legal / onboarding** — Privacy / ToS / DPA (P5).

---

## Production Readiness Risks

| Area | Current state | Production impact |
|---|---|---|
| Persistence | **Live (Supabase, RLS)** | ✅ Real user data is durable |
| Authentication | **Live** (email/password, sessions) | ✅ Real accounts persist; signup-email journey pending Site URL |
| Site URL / redirect | **Not set** | ⚠️ Confirmation/reset emails won't resolve until set |
| Leaked-password protection | Off by default | Users could set compromised passwords (enable pre-launch) |
| Billing | Not integrated | Cannot charge customers (P2) |
| Storage | Not integrated | No real media uploads (P3) |
| Email | Not integrated (transactional) | No Stripe/onboarding emails (P3) |
| OAuth | Not integrated | No social publishing (P4) |

---

## Keystone Deployment Checklist

**Provision & schema**
- [x] Create dedicated Supabase project (London / eu-west-2) — `daqeghxsuvufqubsbmnv`
- [x] Apply schema + migrations (`schema.sql`, `002_studio_tables.sql`, `003_harden_rls.sql`)
- [x] Set real credentials in `js/supabase.js` (URL + legacy anon JWT); remove demo placeholders
- [x] Merge `keystone-live-supabase` → `main`, deploy to Vercel, bump SW cache (`v21`) so PWA clients get the live build

**Auth hardening**
- [ ] **Configure Site URL + redirect allowlist (`https://svn-os.vercel.app`)** ← owner, required before real signups
- [ ] Enable leaked-password protection (HIBP) — optional, recommended
- [ ] Enable MFA (if required for launch)
- [x] Email-confirmation policy — set to required

**Commercial integrations**
- [ ] Connect Stripe (P2)
- [ ] Connect Resend (P3)
- [ ] Configure Storage buckets + policies (P3)

**Verification & ops**
- [x] Advisors clean (security 0, performance 0 warnings)
- [x] Cross-user RLS isolation proven (DB layer + real-session write)
- [x] Guest + live-wire verified in the production browser
- [ ] Real end-user signup → email confirm → first login (owner ✋, after Site URL)
- [ ] Verify backups, monitoring, and recovery procedures

## Go / No-Go Acceptance Gate

*Acceptance tests, not implementation tasks — the concrete definition of "production ready."*

- [x] Cross-user isolation: A cannot read B's records, B cannot read A's, anon reads nothing
- [x] Waitlist still accepts anonymous inserts (shared project, unaffected)
- [ ] Two **real** accounts via the signup UI (owner ✋, after Site URL)
- [ ] Leaked-password protection rejects a known-compromised password (after HIBP enabled)
- [ ] Stripe webhook end-to-end (P2)
- [ ] Backup and restore procedure
- [ ] Monitoring and alerting

---

## Overall Assessment

- **UI/UX maturity:** High.
- **Client-side feature completeness:** High.
- **Backend:** **Live** — dedicated London Supabase project, 11 tables RLS-on, advisors clean; guest + live-wire verified in production.
- **Security posture:** Strong at the edge/client layer (CSP, headers, App Lock) **and** the data layer (owner-only RLS on every table, hardened trigger fn, optimized init-plan). HIBP off by default (enable pre-launch).
- **Production SaaS readiness:** The keystone is **shipped and verified**. The remaining gate before onboarding real users is the **owner Site URL config**; then P2 Stripe unlocks billing.

---

## Go-live record — 2026-07-01

- **Merge:** `keystone-live-supabase` → `main` (`4a21692`); one trivial `auth.js` conflict resolved by taking the branch superset (Jordan persona + three-state runtime), merged tree byte-identical to the branch.
- **Deploy:** pushed to GitHub `77Mediaofficial/SVN-OS-`; Vercel auto-deployed to `svn-os.vercel.app`.
- **SW cache fix (`b420475`):** the go-live commit changed `js/supabase.js` but not `sw.js`, so returning PWA clients served the stale demo build from the `v20` cache. Bumped `VERSION` → `v21`; new SW installs, precaches the live build, purges the old cache on activate. Verified in the production browser: `v21` active, `DEMO_MODE=false`, guest mode, 0 console errors.
- **Still open (owner):** Supabase Auth → URL Configuration (Site URL + redirect allowlist).
