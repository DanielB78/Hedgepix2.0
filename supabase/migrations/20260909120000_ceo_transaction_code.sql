-- Add Form 4 transaction code so CEO open-market sales (S) can be stored
-- alongside purchases (P). Existing rows default to P.
alter table public.ceo_stock_purchases
  add column if not exists transaction_code text not null default 'P';

alter table public.ceo_stock_purchases
  drop constraint if exists ceo_stock_purchases_transaction_code_check;

alter table public.ceo_stock_purchases
  add constraint ceo_stock_purchases_transaction_code_check
  check (transaction_code in ('P', 'S'));

create index if not exists ceo_stock_purchases_transaction_code_idx
  on public.ceo_stock_purchases (transaction_code);

comment on column public.ceo_stock_purchases.transaction_code is
  'SEC Form 4 TRANS_CODE: P = open-market purchase, S = open-market sale';
