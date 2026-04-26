-- Subscriptions (Stripe) + webhook idempotency
-- Run via Supabase migrations or SQL editor.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'incomplete'
    check (status in ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'unpaid')),
  plan_type text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Older projects may already have `subscriptions` without Stripe columns.
alter table public.subscriptions
  add column if not exists plan_type text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz;

alter table public.subscriptions
  add column if not exists created_at timestamptz;

alter table public.subscriptions
  add column if not exists updated_at timestamptz;

-- Backfill NOT NULL where older rows omitted defaults (best-effort).
update public.subscriptions set created_at = coalesce(created_at, now()) where created_at is null;
update public.subscriptions set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.subscriptions alter column created_at set default now();
alter table public.subscriptions alter column updated_at set default now();

create unique index if not exists subscriptions_user_id_uidx on public.subscriptions (user_id);

create unique index if not exists subscriptions_stripe_subscription_id_uidx
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.stripe_webhook_events (
  id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete for authenticated clients; service role bypasses RLS.

create or replace function public.set_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_subscriptions_updated_at();
