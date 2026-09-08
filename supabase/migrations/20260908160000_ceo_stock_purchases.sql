-- CEO stock purchases from SEC Insider Transactions Data Sets (Form 4, code P).
create extension if not exists pgcrypto;

create table if not exists public.ceo_stock_purchases (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,

  accession_number text not null,
  nonderiv_trans_sk text not null,
  reporting_owner_cik text,
  issuer_cik text,

  ceo_name text not null,
  officer_title text,
  issuer_name text,
  ticker text,
  security_title text,

  transaction_date date,
  filing_date date,
  shares_purchased numeric,
  price_per_share numeric,
  shares_owned_after numeric,
  ownership_type text,

  filing_url text,
  form_type text not null default '4',
  quarter text not null,

  raw_source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ceo_stock_purchases_filing_date_idx
  on public.ceo_stock_purchases (filing_date desc nulls last);

create index if not exists ceo_stock_purchases_transaction_date_idx
  on public.ceo_stock_purchases (transaction_date desc nulls last);

create index if not exists ceo_stock_purchases_ticker_idx
  on public.ceo_stock_purchases (ticker);

create index if not exists ceo_stock_purchases_ceo_name_idx
  on public.ceo_stock_purchases (ceo_name);

create index if not exists ceo_stock_purchases_quarter_idx
  on public.ceo_stock_purchases (quarter);

-- Track which SEC quarterly ZIPs have been successfully ingested.
create table if not exists public.ceo_buys_quarters (
  quarter text primary key,
  status text not null
    check (status in ('success', 'failed', 'running')),
  zip_url text,
  rows_extracted integer not null default 0,
  rows_upserted integer not null default 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists ceo_stock_purchases_set_updated_at
  on public.ceo_stock_purchases;
create trigger ceo_stock_purchases_set_updated_at
before update on public.ceo_stock_purchases
for each row execute function public.set_updated_at();

drop trigger if exists ceo_buys_quarters_set_updated_at
  on public.ceo_buys_quarters;
create trigger ceo_buys_quarters_set_updated_at
before update on public.ceo_buys_quarters
for each row execute function public.set_updated_at();

alter table public.ceo_stock_purchases enable row level security;
alter table public.ceo_buys_quarters enable row level security;

drop policy if exists "Public read ceo_stock_purchases"
  on public.ceo_stock_purchases;
create policy "Public read ceo_stock_purchases"
  on public.ceo_stock_purchases
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Service role write ceo_stock_purchases"
  on public.ceo_stock_purchases;
create policy "Service role write ceo_stock_purchases"
  on public.ceo_stock_purchases
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Public read ceo_buys_quarters"
  on public.ceo_buys_quarters;
create policy "Public read ceo_buys_quarters"
  on public.ceo_buys_quarters
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Service role write ceo_buys_quarters"
  on public.ceo_buys_quarters;
create policy "Service role write ceo_buys_quarters"
  on public.ceo_buys_quarters
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.ceo_stock_purchases to anon, authenticated;
grant select on public.ceo_buys_quarters to anon, authenticated;
grant all on public.ceo_stock_purchases to service_role;
grant all on public.ceo_buys_quarters to service_role;
