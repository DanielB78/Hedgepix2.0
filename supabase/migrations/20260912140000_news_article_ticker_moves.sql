-- Per-article S&P 500 ticker abnormal-movement checks (news → NAICS → ticker).
-- One row per (article_id, ticker); re-checks upsert the same row during the 24h window.

create table if not exists public.news_article_ticker_moves (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles (id) on delete cascade,
  ticker text not null,
  matched_naics_codes text[] not null default '{}',
  window_start timestamptz not null,
  window_end timestamptz not null,
  window_hours double precision not null,
  start_price double precision,
  end_price double precision,
  event_return_pct double precision,
  historical_typical_move_pct double precision,
  abnormality_ratio double precision,
  is_abnormal boolean not null default false,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, ticker)
);

create index if not exists news_article_ticker_moves_article_id_idx
  on public.news_article_ticker_moves (article_id);

create index if not exists news_article_ticker_moves_ticker_idx
  on public.news_article_ticker_moves (ticker);

create index if not exists news_article_ticker_moves_is_abnormal_idx
  on public.news_article_ticker_moves (is_abnormal)
  where is_abnormal = true;

create index if not exists news_article_ticker_moves_checked_at_idx
  on public.news_article_ticker_moves (checked_at desc);

alter table public.news_article_ticker_moves enable row level security;

drop policy if exists "public can read news article ticker moves"
  on public.news_article_ticker_moves;
create policy "public can read news article ticker moves"
on public.news_article_ticker_moves
for select
to anon, authenticated
using (true);

grant select on public.news_article_ticker_moves to anon, authenticated;
