-- Listed-equity flag on trades + precomputed member holdings summaries.

alter table public.congress_trades
  add column if not exists is_listed_equity boolean not null default false;

create index if not exists congress_trades_listed_equity_idx
  on public.congress_trades (is_listed_equity)
  where is_listed_equity = true;

create table if not exists public.member_stock_holdings (
  id uuid primary key default gen_random_uuid(),
  member_slug text not null,
  member text not null,
  ticker text not null,
  asset text,
  position_low numeric,
  position_high numeric,
  last_activity_type text check (
    last_activity_type in ('purchase', 'sale')
    or last_activity_type is null
  ),
  last_activity_date date,
  last_disclosure_date date,
  computed_at timestamptz not null default now(),
  unique (member_slug, ticker)
);

create index if not exists member_stock_holdings_member_slug_idx
  on public.member_stock_holdings (member_slug);

create index if not exists member_stock_holdings_ticker_idx
  on public.member_stock_holdings (ticker);

alter table public.member_stock_holdings enable row level security;

create policy "public can read member stock holdings"
on public.member_stock_holdings
for select
to anon, authenticated
using (true);

drop trigger if exists member_stock_holdings_set_updated_at
  on public.member_stock_holdings;
