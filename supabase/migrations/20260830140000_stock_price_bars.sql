-- Cached Alpaca IEX daily bars. Incremental upserts on (ticker, bar_date).
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

-- UNIQUE (ticker, bar_date) already indexes lookups and enforces idempotent upserts.

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
