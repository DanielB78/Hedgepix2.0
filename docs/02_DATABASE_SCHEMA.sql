-- Congress Trade Monitor MVP
create extension if not exists pgcrypto;

create table if not exists public.congress_trades (
  id uuid primary key default gen_random_uuid(),
  source_hash text not null unique,

  member text,
  member_slug text,
  chamber text check (chamber in ('house', 'senate') or chamber is null),
  state text,
  ticker text,
  asset text,
  transaction_type text check (
    transaction_type in ('purchase', 'sale', 'exchange')
    or transaction_type is null
  ),

  amount_low numeric,
  amount_high numeric,
  amount_range text,

  transaction_date date,
  disclosure_date date,

  est_price numeric,
  recent_price numeric,
  recent_price_date date,
  perf_pct numeric,
  realized_return_pct numeric,
  outcome text,

  filing_portal text,
  raw_source jsonb,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists congress_trades_disclosure_date_idx
  on public.congress_trades (disclosure_date desc);
create index if not exists congress_trades_transaction_date_idx
  on public.congress_trades (transaction_date desc);
create index if not exists congress_trades_member_slug_idx
  on public.congress_trades (member_slug);
create index if not exists congress_trades_ticker_idx
  on public.congress_trades (ticker);
create index if not exists congress_trades_chamber_idx
  on public.congress_trades (chamber);
create index if not exists congress_trades_type_idx
  on public.congress_trades (transaction_type);

create table if not exists public.congress_sync_state (
  provider text primary key,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  latest_seen_disclosure_date date,
  latest_seen_transaction_date date,
  backfill_page integer not null default 0,
  last_rows_received integer,
  last_rows_upserted integer,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.congress_sync_state (provider)
values ('bargo')
on conflict (provider) do nothing;

create table if not exists public.congress_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'bargo',
  mode text not null default 'hourly'
    check (mode in ('hourly', 'backfill', 'manual')),
  status text not null
    check (status in ('running', 'success', 'failed')),
  requested_page integer,
  requested_limit integer,
  rows_received integer not null default 0,
  rows_upserted integer not null default 0,
  rate_limit_requests_remaining integer,
  rate_limit_rows_remaining integer,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists congress_sync_runs_started_idx
  on public.congress_sync_runs (started_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists congress_trades_set_updated_at
  on public.congress_trades;
create trigger congress_trades_set_updated_at
before update on public.congress_trades
for each row execute function public.set_updated_at();

drop trigger if exists congress_sync_state_set_updated_at
  on public.congress_sync_state;
create trigger congress_sync_state_set_updated_at
before update on public.congress_sync_state
for each row execute function public.set_updated_at();

alter table public.congress_trades enable row level security;
alter table public.congress_sync_state enable row level security;
alter table public.congress_sync_runs enable row level security;

create policy "public can read congress trades"
on public.congress_trades
for select
to anon, authenticated
using (true);

create or replace view public.congress_trades_public as
select
  id,
  member,
  member_slug,
  chamber,
  state,
  ticker,
  asset,
  transaction_type,
  amount_low,
  amount_high,
  amount_range,
  transaction_date,
  disclosure_date,
  est_price,
  recent_price,
  recent_price_date,
  perf_pct,
  realized_return_pct,
  outcome,
  filing_portal,
  first_seen_at,
  last_seen_at
from public.congress_trades;

-- Cached Alpaca IEX daily bars. Incremental upserts on (ticker, bar_date).
-- Also applied as supabase/migrations/20260830140000_stock_price_bars.sql
create table if not exists public.stock_price_bars (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  bar_date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume numeric,
  source text not null default 'alpaca_iex',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticker, bar_date)
);

drop trigger if exists stock_price_bars_set_updated_at
  on public.stock_price_bars;
create trigger stock_price_bars_set_updated_at
before update on public.stock_price_bars
for each row execute function public.set_updated_at();

alter table public.stock_price_bars enable row level security;

drop policy if exists "public can read stock price bars"
  on public.stock_price_bars;
create policy "public can read stock price bars"
on public.stock_price_bars
for select
to anon, authenticated
using (true);

grant select on public.stock_price_bars to anon, authenticated;
