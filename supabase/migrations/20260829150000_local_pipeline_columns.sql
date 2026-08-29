-- Add asset_type and owner columns for local congress-trading-pipeline ingestion.
-- Safe / additive: does not destroy existing data.

alter table public.congress_trades
  add column if not exists asset_type text;

alter table public.congress_trades
  add column if not exists owner text
  check (
    owner in ('self', 'joint', 'spouse', 'child')
    or owner is null
  );

-- Track the local manual updater separately from legacy Bargo sync.
insert into public.congress_sync_state (provider)
values ('local-pipeline')
on conflict (provider) do nothing;

-- Refresh public view to expose new display-safe columns (still no raw_source).
create or replace view public.congress_trades_public as
select
  id,
  member,
  member_slug,
  chamber,
  state,
  ticker,
  asset,
  asset_type,
  transaction_type,
  amount_low,
  amount_high,
  amount_range,
  transaction_date,
  disclosure_date,
  owner,
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
