-- Offline GDELT news articles (populated by manual updater only).
create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'gdelt',
  title text not null,
  url text not null,
  published_at timestamptz,
  domain text,
  image_url text,
  language text,
  gdelt_id text,
  source_hash text not null,
  raw_source jsonb,
  created_at timestamptz not null default now(),
  unique (source_hash)
);

create index if not exists news_articles_published_at_idx
  on public.news_articles (published_at desc nulls last);

create index if not exists news_articles_gdelt_id_idx
  on public.news_articles (gdelt_id)
  where gdelt_id is not null;

alter table public.news_articles enable row level security;

drop policy if exists "public can read news articles"
  on public.news_articles;
create policy "public can read news articles"
on public.news_articles
for select
to anon, authenticated
using (true);

grant select on public.news_articles to anon, authenticated;
