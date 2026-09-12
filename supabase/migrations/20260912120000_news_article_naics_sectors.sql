-- Top-3 NAICS sector matches from local BGE-small title classification.
alter table public.news_articles
  add column if not exists sector_1 text,
  add column if not exists sector_1_code text,
  add column if not exists sector_1_score double precision,
  add column if not exists sector_2 text,
  add column if not exists sector_2_code text,
  add column if not exists sector_2_score double precision,
  add column if not exists sector_3 text,
  add column if not exists sector_3_code text,
  add column if not exists sector_3_score double precision;

-- Keep legacy sector / sector_score in sync with rank-1 for older readers.
-- (Updater writes both.)

create index if not exists news_articles_sector_1_code_idx
  on public.news_articles (sector_1_code)
  where sector_1_code is not null;

create index if not exists news_articles_sector_2_code_idx
  on public.news_articles (sector_2_code)
  where sector_2_code is not null;

create index if not exists news_articles_sector_3_code_idx
  on public.news_articles (sector_3_code)
  where sector_3_code is not null;
