-- Ticker sector / industry profiles for UI labels and enrichment.
create table if not exists public.ticker_profiles (
  ticker text primary key,
  company_name text,
  cik text,
  -- Broad bucket shown next to tickers (e.g. Energy, Technology).
  sector text,
  -- Finer label when known (e.g. Nuclear energy, Semiconductors).
  industry text,
  naics_code text,
  naics_name text,
  sic_code text,
  sic_description text,
  -- sp500_map | sec_submissions | name_heuristic | manual
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

create index if not exists ticker_profiles_sector_idx
  on public.ticker_profiles (sector);

create index if not exists ticker_profiles_updated_at_idx
  on public.ticker_profiles (updated_at desc);

comment on table public.ticker_profiles is
  'Per-ticker sector/industry labels. Populated from S&P NAICS map, SEC SIC, and heuristics for new congress tickers.';
