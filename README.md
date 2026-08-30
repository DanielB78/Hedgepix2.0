# Congress Trade Monitor

MVP that fetches normalized congressional securities disclosures from [Bargo](https://www.bargo.ai/free-apis/congress), stores them in Supabase, syncs hourly via a Supabase Edge Function + Cron, and displays them in a Next.js frontend.

## Stack

- Next.js (App Router, TypeScript)
- Supabase (Postgres + Edge Functions + Cron)
- Bargo Congress Trades API
- Alpaca Market Data (IEX daily bars, cached in Supabase)

## Features

- **Latest** — filterable disclosure feed (member, ticker, chamber, type) with 50-row pagination
- **Trending** — tickers ranked by congressional disclosure activity (`disclosure_date` window: 7 / 30 / 90 days; All / Buys / Sales)
- **Stock detail** (`/stocks/[ticker]`) — cached daily closing-price chart with congressional purchase/sale markers on **transaction date**

## Setup

1. Copy `.env.example` to `.env.local` and fill in Supabase, optional `BARGO_API_KEY`, and `ALPACA_API_KEY` / `ALPACA_API_SECRET`.
2. In the Supabase SQL Editor, run `docs/02_DATABASE_SCHEMA.sql` and `supabase/migrations/20260830140000_stock_price_bars.sql`.
3. Deploy the Edge Function:
   ```bash
   npx supabase functions deploy sync-congress-trades
   ```
4. Set Edge Function secrets: `SUPABASE_SERVICE_ROLE_KEY`, optional `BARGO_API_KEY`, `ALPACA_API_KEY`, `ALPACA_API_SECRET`.
5. Manually invoke sync once before enabling Cron:
   ```bash
   npm run sync
   # or only prices:
   npm run sync:prices
   ```
6. After a successful manual sync, apply `supabase/cron_hourly_sync.sql` (replace project ref and service role key).
7. Run the frontend:
   ```bash
   npm install
   npm run dev
   ```

## Deploy (Vercel)

1. Framework Preset: **Next.js**
2. Root Directory: repository root (blank)
3. Output Directory: **leave blank** (do not set `.next` or `out`)
4. Build Command: `next build` (default)
5. Environment variables (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ALPACA_API_KEY`
   - `ALPACA_API_SECRET`
6. After deploy, open the **Production** domain (`*.vercel.app`), not a protected preview deployment URL.
7. If you still see Vercel `NOT_FOUND`, open Deployments → latest → **Promote to Production**, and confirm Domains lists the production hostname.

## Docs

See `docs/` for the schema, implementation plan, and Cursor master prompt. Specs `00`, `01`, `03`, and `04` were not included in the initial upload.

## Scope

No auth, notifications, AI, live browser market-price calls, portfolios, PDF scraping, queues, or Redis. Historical daily bars are ingested server-side from Alpaca and read from Supabase.
