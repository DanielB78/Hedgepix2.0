-- Optional lightweight smoke rows for empty local DBs.
-- Prefer `npm run local:db:seed-month` for real InsiderWatch + Kadoa congress data.
-- Intentionally does NOT insert congress_trades demos (they polluted Top performers).

insert into public.news_articles (
  source_hash, title, url, published_at, domain, language
)
select
  'news:local-demo-1',
  'Local demo: markets open higher on tech strength',
  'https://example.com/local-demo-news',
  now() - interval '2 hours',
  'example.com',
  'en'
where not exists (
  select 1 from public.news_articles where source_hash = 'news:local-demo-1'
);
