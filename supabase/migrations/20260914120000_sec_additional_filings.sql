-- Additional SEC filing datasets (13F, 13D/G, Form 144, 8-K, 10-Q/K, offerings, N-PORT).
-- Idempotent ingest keyed by accession / dataset period. Public read, service_role write.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared ingest state (bulk periods + EDGAR cursors)
-- ---------------------------------------------------------------------------
create table if not exists public.sec_ingest_state (
  source text not null,
  period_key text not null,
  status text not null check (status in ('success', 'failed', 'running')),
  source_url text,
  rows_extracted integer not null default 0,
  rows_upserted integer not null default 0,
  last_error text,
  meta jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (source, period_key)
);

create index if not exists sec_ingest_state_source_status_idx
  on public.sec_ingest_state (source, status);

-- ---------------------------------------------------------------------------
-- Form 13F
-- ---------------------------------------------------------------------------
create table if not exists public.sec_13f_filings (
  id uuid primary key default gen_random_uuid(),
  accession_number text not null unique,
  manager_cik text not null,
  manager_name text,
  report_period date,
  filing_date date,
  form_type text,
  filing_url text,
  dataset_period text,
  raw_source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sec_13f_filings_manager_period_idx
  on public.sec_13f_filings (manager_cik, report_period desc nulls last);
create index if not exists sec_13f_filings_filing_date_idx
  on public.sec_13f_filings (filing_date desc nulls last);

create table if not exists public.sec_13f_holdings (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  accession_number text not null,
  manager_cik text not null,
  manager_name text,
  report_period date,
  filing_date date,
  issuer_name text,
  title_of_class text,
  cusip text,
  ticker text,
  shares numeric,
  value_usd numeric,
  put_call text,
  investment_discretion text,
  voting_sole numeric,
  voting_shared numeric,
  voting_none numeric,
  dataset_period text,
  raw_source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sec_13f_holdings_manager_period_idx
  on public.sec_13f_holdings (manager_cik, report_period desc nulls last);
create index if not exists sec_13f_holdings_ticker_idx
  on public.sec_13f_holdings (ticker);
create index if not exists sec_13f_holdings_cusip_idx
  on public.sec_13f_holdings (cusip);
create index if not exists sec_13f_holdings_accession_idx
  on public.sec_13f_holdings (accession_number);

create table if not exists public.sec_13f_position_changes (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  manager_cik text not null,
  manager_name text,
  report_period date not null,
  prior_period date,
  cusip text,
  ticker text,
  issuer_name text,
  change_type text not null
    check (change_type in ('NEW_POSITION', 'INCREASED', 'REDUCED', 'EXITED', 'UNCHANGED')),
  shares numeric,
  prior_shares numeric,
  share_change numeric,
  share_change_pct numeric,
  value_usd numeric,
  prior_value_usd numeric,
  value_change numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sec_13f_position_changes_period_idx
  on public.sec_13f_position_changes (report_period desc);
create index if not exists sec_13f_position_changes_manager_idx
  on public.sec_13f_position_changes (manager_cik, report_period desc);
create index if not exists sec_13f_position_changes_ticker_idx
  on public.sec_13f_position_changes (ticker);
create index if not exists sec_13f_position_changes_type_idx
  on public.sec_13f_position_changes (change_type);

-- ---------------------------------------------------------------------------
-- Schedule 13D / 13G
-- ---------------------------------------------------------------------------
create table if not exists public.sec_large_ownership_filings (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  accession_number text not null,
  form_type text not null,
  filing_date date,
  reporting_person text,
  filer_cik text,
  target_company text,
  target_cik text,
  ticker text,
  ownership_pct numeric,
  shares_beneficially_owned numeric,
  amendment boolean not null default false,
  change_type text,
  filing_url text,
  raw_source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sec_large_ownership_filing_date_idx
  on public.sec_large_ownership_filings (filing_date desc nulls last);
create index if not exists sec_large_ownership_ticker_idx
  on public.sec_large_ownership_filings (ticker);
create index if not exists sec_large_ownership_filer_idx
  on public.sec_large_ownership_filings (filer_cik);

-- ---------------------------------------------------------------------------
-- Form 144 — proposed sales
-- ---------------------------------------------------------------------------
create table if not exists public.sec_form144_sales (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  accession_number text not null,
  filing_date date,
  proposed_sale_date date,
  filer_name text,
  filer_cik text,
  issuer_name text,
  issuer_cik text,
  ticker text,
  shares_proposed numeric,
  aggregate_market_value numeric,
  broker text,
  filing_url text,
  raw_source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sec_form144_filing_date_idx
  on public.sec_form144_sales (filing_date desc nulls last);
create index if not exists sec_form144_ticker_idx
  on public.sec_form144_sales (ticker);

-- ---------------------------------------------------------------------------
-- Company filings metadata (8-K, 10-Q/K, S-1/424B, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.sec_company_filings (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  accession_number text not null,
  form_type text not null,
  company_name text,
  cik text,
  ticker text,
  filed_at timestamptz,
  filing_date date,
  items text,
  description text,
  filing_url text,
  raw_source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sec_company_filings_form_date_idx
  on public.sec_company_filings (form_type, filing_date desc nulls last);
create index if not exists sec_company_filings_ticker_idx
  on public.sec_company_filings (ticker);
create index if not exists sec_company_filings_cik_idx
  on public.sec_company_filings (cik);

-- ---------------------------------------------------------------------------
-- Fundamentals extracted from 10-Q / 10-K (XBRL companyfacts)
-- ---------------------------------------------------------------------------
create table if not exists public.sec_company_fundamentals (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  cik text not null,
  ticker text,
  company_name text,
  form_type text,
  accession_number text,
  period_end date,
  filed_at timestamptz,
  revenue numeric,
  net_income numeric,
  operating_income numeric,
  cash numeric,
  total_assets numeric,
  total_liabilities numeric,
  debt numeric,
  operating_cash_flow numeric,
  eps numeric,
  revenue_yoy_pct numeric,
  net_income_yoy_pct numeric,
  eps_yoy_pct numeric,
  cash_change numeric,
  debt_change numeric,
  filing_url text,
  raw_source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sec_company_fundamentals_ticker_period_idx
  on public.sec_company_fundamentals (ticker, period_end desc nulls last);
create index if not exists sec_company_fundamentals_cik_period_idx
  on public.sec_company_fundamentals (cik, period_end desc nulls last);

-- ---------------------------------------------------------------------------
-- Offerings (S-1 / 424B)
-- ---------------------------------------------------------------------------
create table if not exists public.sec_offerings (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  accession_number text not null,
  form_type text not null,
  issuer_name text,
  cik text,
  ticker text,
  filing_date date,
  security_description text,
  shares_offered numeric,
  price numeric,
  offering_size numeric,
  filing_url text,
  raw_source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sec_offerings_filing_date_idx
  on public.sec_offerings (filing_date desc nulls last);
create index if not exists sec_offerings_ticker_idx
  on public.sec_offerings (ticker);

-- ---------------------------------------------------------------------------
-- N-PORT holdings (filtered)
-- ---------------------------------------------------------------------------
create table if not exists public.sec_nport_holdings (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  accession_number text,
  fund_name text,
  fund_cik text,
  report_date date,
  issuer_name text,
  security_name text,
  cusip text,
  ticker text,
  shares numeric,
  value_usd numeric,
  pct_portfolio numeric,
  dataset_period text,
  raw_source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sec_nport_holdings_ticker_idx
  on public.sec_nport_holdings (ticker);
create index if not exists sec_nport_holdings_fund_date_idx
  on public.sec_nport_holdings (fund_cik, report_date desc nulls last);
create index if not exists sec_nport_holdings_period_idx
  on public.sec_nport_holdings (dataset_period);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'sec_ingest_state',
    'sec_13f_filings',
    'sec_13f_holdings',
    'sec_13f_position_changes',
    'sec_large_ownership_filings',
    'sec_form144_sales',
    'sec_company_filings',
    'sec_company_fundamentals',
    'sec_offerings',
    'sec_nport_holdings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Public read %1$s" on public.%1$I', t);
    execute format(
      'create policy "Public read %1$s" on public.%1$I for select to anon, authenticated using (true)',
      t
    );
    execute format('drop policy if exists "Service role write %1$s" on public.%1$I', t);
    execute format(
      'create policy "Service role write %1$s" on public.%1$I for all to service_role using (true) with check (true)',
      t
    );
  end loop;
end $$;
