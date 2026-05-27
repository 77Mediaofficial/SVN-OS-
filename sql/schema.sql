-- ============================================================
-- SVN OS — Creator OS Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- PROFILES
-- Extends Supabase auth.users with creator-specific fields
-- ────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  avatar_url    text,
  bio           text,
  website       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
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
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ────────────────────────────────────────────────────────────
-- CONTENT PROJECTS
-- Tracks content from idea through to publication
-- ────────────────────────────────────────────────────────────
create type public.content_status as enum (
  'idea',
  'scripting',
  'production',
  'ready',
  'posted',
  'archived'
);

create type public.content_platform as enum (
  'youtube',
  'tiktok',
  'instagram',
  'twitter',
  'linkedin',
  'podcast',
  'blog',
  'other'
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
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_content_projects_user on public.content_projects(user_id);
create index idx_content_projects_status on public.content_projects(status);
create index idx_content_projects_scheduled on public.content_projects(scheduled_at);

alter table public.content_projects enable row level security;

create policy "Users can view own projects"
  on public.content_projects for select
  using (auth.uid() = user_id);

create policy "Users can insert own projects"
  on public.content_projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on public.content_projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on public.content_projects for delete
  using (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- BRAND DEALS
-- CRM pipeline for sponsorships and partnerships
-- ────────────────────────────────────────────────────────────
create type public.deal_status as enum (
  'lead',
  'negotiating',
  'signed',
  'in_progress',
  'completed',
  'lost'
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
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_brand_deals_user on public.brand_deals(user_id);
create index idx_brand_deals_status on public.brand_deals(status);

alter table public.brand_deals enable row level security;

create policy "Users can view own deals"
  on public.brand_deals for select
  using (auth.uid() = user_id);

create policy "Users can insert own deals"
  on public.brand_deals for insert
  with check (auth.uid() = user_id);

create policy "Users can update own deals"
  on public.brand_deals for update
  using (auth.uid() = user_id);

create policy "Users can delete own deals"
  on public.brand_deals for delete
  using (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- TRANSACTIONS
-- Financial ledger for income and expenses
-- ────────────────────────────────────────────────────────────
create type public.transaction_type as enum ('income', 'expense');

create type public.transaction_category as enum (
  'sponsorship',
  'ad_revenue',
  'merch',
  'freelance',
  'subscription',
  'equipment',
  'software',
  'travel',
  'contractor',
  'other'
);

create table public.transactions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  type          public.transaction_type not null,
  category      public.transaction_category not null default 'other',
  amount        numeric(12, 2) not null,
  currency      text not null default 'USD',
  description   text,
  date          date not null default current_date,
  deal_id       uuid references public.brand_deals(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_transactions_user on public.transactions(user_id);
create index idx_transactions_date on public.transactions(date);
create index idx_transactions_type on public.transactions(type);

alter table public.transactions enable row level security;

create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- AUTO-UPDATE updated_at TIMESTAMP
-- ────────────────────────────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger set_content_projects_updated_at
  before update on public.content_projects
  for each row execute function public.update_updated_at();

create trigger set_brand_deals_updated_at
  before update on public.brand_deals
  for each row execute function public.update_updated_at();

create trigger set_transactions_updated_at
  before update on public.transactions
  for each row execute function public.update_updated_at();
