-- ============================================================
-- SVN OS — advisor hardening (migration 003)
-- Run AFTER sql/schema.sql and sql/002_studio_tables.sql.
-- Clears every Supabase security + performance advisor warning:
--   1. Locks down the auto-profile trigger function (no RPC surface).
--   2. Optimizes RLS so auth.uid() is evaluated once per query, not per row.
--   3. Adds covering indexes for the two client_id foreign keys.
-- This is exactly what is deployed on the live London project
-- (ref daqeghxsuvufqubsbmnv); a from-scratch run of files 1→2→3 reproduces it.
-- ============================================================

-- 1) handle_new_user is a trigger function — it must never be callable as an RPC.
--    Revoking EXECUTE clears the SECURITY DEFINER advisors; the trigger still fires
--    (triggers run as the table owner regardless of EXECUTE grants).
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- 2) Covering indexes for the two client_id foreign keys (cascade-delete lookups).
create index if not exists milestones_client_fk_idx on public.milestones (client_id);
create index if not exists sow_items_client_fk_idx  on public.sow_items (client_id);

-- 3) Wrap auth.uid() in a scalar subselect so Postgres evaluates it ONCE per query
--    instead of once per row (auth_rls_initplan). Identical security semantics.

-- profiles (keyed on id)
alter policy "profiles: owner read"   on public.profiles using ((select auth.uid()) = id);
alter policy "profiles: owner insert" on public.profiles with check ((select auth.uid()) = id);
alter policy "profiles: owner update" on public.profiles using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- user_preferences
alter policy "prefs: owner select" on public.user_preferences using ((select auth.uid()) = user_id);
alter policy "prefs: owner insert" on public.user_preferences with check ((select auth.uid()) = user_id);
alter policy "prefs: owner update" on public.user_preferences using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "prefs: owner delete" on public.user_preferences using ((select auth.uid()) = user_id);

-- content_projects
alter policy "content: owner select" on public.content_projects using ((select auth.uid()) = user_id);
alter policy "content: owner insert" on public.content_projects with check ((select auth.uid()) = user_id);
alter policy "content: owner update" on public.content_projects using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "content: owner delete" on public.content_projects using ((select auth.uid()) = user_id);

-- brand_deals
alter policy "deals: owner select" on public.brand_deals using ((select auth.uid()) = user_id);
alter policy "deals: owner insert" on public.brand_deals with check ((select auth.uid()) = user_id);
alter policy "deals: owner update" on public.brand_deals using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "deals: owner delete" on public.brand_deals using ((select auth.uid()) = user_id);

-- transactions
alter policy "transactions: owner select" on public.transactions using ((select auth.uid()) = user_id);
alter policy "transactions: owner insert" on public.transactions with check ((select auth.uid()) = user_id);
alter policy "transactions: owner update" on public.transactions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "transactions: owner delete" on public.transactions using ((select auth.uid()) = user_id);

-- team_members
alter policy "team: owner select" on public.team_members using ((select auth.uid()) = user_id);
alter policy "team: owner insert" on public.team_members with check ((select auth.uid()) = user_id);
alter policy "team: owner update" on public.team_members using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "team: owner delete" on public.team_members using ((select auth.uid()) = user_id);

-- clients
alter policy "clients: owner select" on public.clients using ((select auth.uid()) = user_id);
alter policy "clients: owner insert" on public.clients with check ((select auth.uid()) = user_id);
alter policy "clients: owner update" on public.clients using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "clients: owner delete" on public.clients using ((select auth.uid()) = user_id);

-- sow_items
alter policy "sow: owner select" on public.sow_items using ((select auth.uid()) = user_id);
alter policy "sow: owner insert" on public.sow_items with check ((select auth.uid()) = user_id);
alter policy "sow: owner update" on public.sow_items using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "sow: owner delete" on public.sow_items using ((select auth.uid()) = user_id);

-- milestones
alter policy "milestones: owner select" on public.milestones using ((select auth.uid()) = user_id);
alter policy "milestones: owner insert" on public.milestones with check ((select auth.uid()) = user_id);
alter policy "milestones: owner update" on public.milestones using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "milestones: owner delete" on public.milestones using ((select auth.uid()) = user_id);

-- gear
alter policy "gear: owner select" on public.gear using ((select auth.uid()) = user_id);
alter policy "gear: owner insert" on public.gear with check ((select auth.uid()) = user_id);
alter policy "gear: owner update" on public.gear using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "gear: owner delete" on public.gear using ((select auth.uid()) = user_id);

-- review_comments
alter policy "reviews: owner select" on public.review_comments using ((select auth.uid()) = user_id);
alter policy "reviews: owner insert" on public.review_comments with check ((select auth.uid()) = user_id);
alter policy "reviews: owner update" on public.review_comments using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "reviews: owner delete" on public.review_comments using ((select auth.uid()) = user_id);
