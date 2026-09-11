-- Sector labels from local BGE-small title classification (manual updater).
alter table public.news_articles
  add column if not exists sector text,
  add column if not exists sector_score double precision;

create index if not exists news_articles_sector_idx
  on public.news_articles (sector)
  where sector is not null;
