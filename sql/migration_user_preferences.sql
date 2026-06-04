-- ============================================================
-- SVN OS — Migration: user_preferences
-- Adds per-user workspace customization: pipeline stage labels
-- and order, deal status labels, tag presets, business identity.
-- Safe to re-run.
-- ============================================================

create table if not exists public.user_preferences (
  user_id                uuid primary key references public.profiles(id) on delete cascade,
  business_name          text,
  business_type          text,
  pipeline_overrides     jsonb not null default '{}'::jsonb,
  deal_status_overrides  jsonb not null default '{}'::jsonb,
  content_tag_presets    text[] not null default '{}',
  deal_tag_presets       text[] not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users view own preferences"   on public.user_preferences;
drop policy if exists "Users insert own preferences" on public.user_preferences;
drop policy if exists "Users update own preferences" on public.user_preferences;
drop policy if exists "Users delete own preferences" on public.user_preferences;

create policy "Users view own preferences"
  on public.user_preferences for select using (auth.uid() = user_id);
create policy "Users insert own preferences"
  on public.user_preferences for insert with check (auth.uid() = user_id);
create policy "Users update own preferences"
  on public.user_preferences for update using (auth.uid() = user_id);
create policy "Users delete own preferences"
  on public.user_preferences for delete using (auth.uid() = user_id);

drop trigger if exists svnos_set_user_preferences_updated_at on public.user_preferences;
create trigger svnos_set_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.svnos_update_updated_at();
