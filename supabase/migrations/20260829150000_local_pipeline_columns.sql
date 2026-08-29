-- Add asset_type and owner columns for local congress-trading-pipeline ingestion.
-- Safe / additive: does not destroy existing trade rows.

alter table public.congress_trades
  add column if not exists asset_type text;

alter table public.congress_trades
  add column if not exists owner text;

-- Named check so re-runs are idempotent if the constraint already exists.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'congress_trades_owner_check'
      and conrelid = 'public.congress_trades'::regclass
  ) then
    alter table public.congress_trades
      add constraint congress_trades_owner_check
      check (
        owner in ('self', 'joint', 'spouse', 'child')
        or owner is null
      );
  end if;
end $$;

-- Track the local manual updater separately from legacy Bargo sync.
insert into public.congress_sync_state (provider)
values ('local-pipeline')
on conflict (provider) do nothing;

-- CREATE OR REPLACE VIEW cannot insert/reorder columns (Postgres treats that as
-- renaming). Drop + recreate instead.
drop view if exists public.congress_trades_public;

create view public.congress_trades_public as
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
