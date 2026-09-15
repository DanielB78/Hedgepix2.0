-- Minimal demo data so Feed / House / Senate / CEO pages are not empty.
-- Idempotent via ON CONFLICT / WHERE NOT EXISTS.

insert into public.congress_trades (
  source_hash, member, member_slug, chamber, ticker, asset, transaction_type,
  amount_low, amount_high, amount_range, transaction_date, disclosure_date,
  is_listed_equity, filing_portal
) values
  ('trade:local-demo-aapl', 'Nancy Demo', 'nancy-demo', 'house', 'AAPL', 'Apple Inc', 'purchase',
   1001, 15000, '$1,001 - $15,000', '2026-01-15', '2026-02-01', true,
   'https://disclosures-clerk.house.gov/FinancialDisclosure'),
  ('trade:local-demo-msft', 'Nancy Demo', 'nancy-demo', 'house', 'MSFT', 'Microsoft Corp', 'sale',
   15001, 50000, '$15,001 - $50,000', '2026-01-20', '2026-02-05', true,
   'https://disclosures-clerk.house.gov/FinancialDisclosure'),
  ('trade:local-demo-nvda', 'Alex Senate', 'alex-senate', 'senate', 'NVDA', 'NVIDIA Corp', 'purchase',
   50001, 100000, '$50,001 - $100,000', '2026-02-10', '2026-02-28', true,
   'https://efdsearch.senate.gov/search/')
on conflict (source_hash) do nothing;

insert into public.ceo_stock_purchases (
  source_id, accession_number, nonderiv_trans_sk, reporting_owner_cik, issuer_cik,
  ceo_name, officer_title, issuer_name, ticker, security_title,
  transaction_date, filing_date, shares_purchased, price_per_share,
  shares_owned_after, ownership_type, filing_url, form_type, quarter, transaction_code
)
select
  'ceo:local-demo-1',
  '0000000000-26-000001',
  'local-1',
  '0001494730',
  '0000320193',
  'Local CEO',
  'Chief Executive Officer',
  'Apple Inc',
  'AAPL',
  'Common Stock',
  '2026-01-10'::date,
  '2026-01-12'::date,
  5000,
  180.5,
  150000,
  'D',
  'https://www.sec.gov/',
  '4',
  '2026q1',
  'P'
where not exists (
  select 1 from public.ceo_stock_purchases where source_id = 'ceo:local-demo-1'
);

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

insert into public.stock_price_bars (ticker, bar_date, open, high, low, close, volume, source)
values
  ('AAPL', '2026-01-14', 175, 182, 174, 180.5, 1000000, 'local-demo'),
  ('AAPL', '2026-01-15', 180, 185, 179, 183, 1100000, 'local-demo'),
  ('MSFT', '2026-01-19', 400, 410, 398, 405, 900000, 'local-demo'),
  ('MSFT', '2026-01-20', 405, 408, 395, 398, 950000, 'local-demo'),
  ('NVDA', '2026-02-09', 120, 125, 119, 124, 2000000, 'local-demo'),
  ('NVDA', '2026-02-10', 124, 130, 123, 128, 2100000, 'local-demo')
on conflict (ticker, bar_date) do nothing;
