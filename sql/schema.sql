-- ============================================================
-- SVN OS — Creator Dashboard Schema
-- Helpers and triggers are namespaced with svnos_ so they
-- coexist with other tables in shared Supabase projects.
-- Run this in your Supabase SQL Editor for a new project.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── PROFILES ─────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text,
  full_name     text,
  avatar_url    text,
  bio           text,
  website       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9_-]{3,32}$')
);

create unique index uniq_profiles_username_lower
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles enable row level security;

create policy "Users can view own profile"   on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Anyone (including unauthenticated visitors) can read profiles with
-- a username — this powers the public /u/{username} pages.
create policy "Public profile lookup by username"
  on public.profiles
  for select
  to anon, authenticated
  using (username is not null);

-- Auto-create a profile row when a new user signs up.
create or replace function public.svnos_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger svnos_on_auth_user_created
  after insert on auth.users
  for each row execute function public.svnos_handle_new_user();


-- ── CONTENT PROJECTS ─────────────────────────────────────────
create type public.content_status as enum (
  'idea','scripting','production','ready','posted','archived'
);

create type public.content_platform as enum (
  'youtube','tiktok','instagram','twitter','linkedin','podcast','blog','other'
);

create table public.content_projects (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  description   text,
  status        public.content_status not null default 'idea',
  platform      public.content_platform,
  scheduled_at  timestamptz,
  published_at  timestamptz,
  notes         text,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_content_projects_user      on public.content_projects(user_id);
create index idx_content_projects_status    on public.content_projects(status);
create index idx_content_projects_scheduled on public.content_projects(scheduled_at);
create index idx_content_projects_tags      on public.content_projects using gin (tags);

alter table public.content_projects enable row level security;

create policy "Users can view own projects"   on public.content_projects for select using (auth.uid() = user_id);
create policy "Users can insert own projects" on public.content_projects for insert with check (auth.uid() = user_id);
create policy "Users can update own projects" on public.content_projects for update using (auth.uid() = user_id);
create policy "Users can delete own projects" on public.content_projects for delete using (auth.uid() = user_id);


-- ── BRAND DEALS ──────────────────────────────────────────────
create type public.deal_status as enum (
  'lead','negotiating','signed','in_progress','completed','lost'
);

create table public.brand_deals (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  brand_name      text not null,
  contact_name    text,
  contact_email   text,
  status          public.deal_status not null default 'lead',
  value           numeric(12, 2),
  currency        text not null default 'USD',
  deliverables    text,
  deadline        date,
  notes           text,
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_brand_deals_user   on public.brand_deals(user_id);
create index idx_brand_deals_status on public.brand_deals(status);
create index idx_brand_deals_tags   on public.brand_deals using gin (tags);

alter table public.brand_deals enable row level security;

create policy "Users can view own deals"   on public.brand_deals for select using (auth.uid() = user_id);
create policy "Users can insert own deals" on public.brand_deals for insert with check (auth.uid() = user_id);
create policy "Users can update own deals" on public.brand_deals for update using (auth.uid() = user_id);
create policy "Users can delete own deals" on public.brand_deals for delete using (auth.uid() = user_id);


-- ── TRANSACTIONS ─────────────────────────────────────────────
create type public.transaction_type as enum ('income','expense');

create type public.transaction_category as enum (
  'sponsorship','ad_revenue','merch','freelance','subscription',
  'equipment','software','travel','contractor','other'
);

create type public.transaction_recurrence as enum ('none','weekly','monthly','yearly');

create table public.transactions (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  type                  public.transaction_type not null,
  category              public.transaction_category not null default 'other',
  amount                numeric(12, 2) not null,
  currency              text not null default 'USD',
  description           text,
  date                  date not null default current_date,
  deal_id               uuid references public.brand_deals(id) on delete set null,
  recurrence            public.transaction_recurrence not null default 'none',
  recurrence_end_date   date,
  parent_transaction_id uuid references public.transactions(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_transactions_user on public.transactions(user_id);
create index idx_transactions_date on public.transactions(date);
create index idx_transactions_type on public.transactions(type);
create index idx_transactions_recurrence on public.transactions(recurrence) where recurrence <> 'none';
create index idx_transactions_parent on public.transactions(parent_transaction_id);

create unique index uniq_transactions_parent_date
  on public.transactions(parent_transaction_id, date)
  where parent_transaction_id is not null;

alter table public.transactions enable row level security;

create policy "Users can view own transactions"   on public.transactions for select using (auth.uid() = user_id);
create policy "Users can insert own transactions" on public.transactions for insert with check (auth.uid() = user_id);
create policy "Users can update own transactions" on public.transactions for update using (auth.uid() = user_id);
create policy "Users can delete own transactions" on public.transactions for delete using (auth.uid() = user_id);


-- ── AUTO-UPDATE updated_at ───────────────────────────────────
create or replace function public.svnos_update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger svnos_set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.svnos_update_updated_at();

create trigger svnos_set_content_projects_updated_at
  before update on public.content_projects
  for each row execute function public.svnos_update_updated_at();

create trigger svnos_set_brand_deals_updated_at
  before update on public.brand_deals
  for each row execute function public.svnos_update_updated_at();

create trigger svnos_set_transactions_updated_at
  before update on public.transactions
  for each row execute function public.svnos_update_updated_at();
