# Congress Trade Monitor

MVP that imports House and Senate STOCK Act securities disclosures from the
MIT-licensed [Kadoa congress-trading-monitor](https://github.com/kadoa-org/congress-trading-monitor)
dataset, stores ordinary publicly traded stocks in Supabase, and displays them
in a Next.js frontend.

Historical stock prices are cached from Alpaca Market Data (IEX daily bars)
during the same update, then read from Supabase by the website.

## Stack

- Next.js (App Router, TypeScript)
- Supabase (Postgres)
- Local Node.js backend updater (`backend/`)
- Alpaca Market Data (IEX daily bars, cached in Supabase)
- Kadoa static JSON dataset (`public/data/filer/*.json`)

## Features

- **Latest** — filterable disclosure feed (member, ticker, chamber, type) with 50-row pagination and same-member/same-disclosure-date groups
- **Trending** — tickers ranked by distinct members active (`disclosure_date` window: 7 / 30 / 90 days; All / Buys / Sales)
- **Stock detail** (`/stocks/[ticker]`) — cached daily closing-price chart with congressional purchase/sale markers on **transaction date**
- **Member pages** (`/members/[slug]`) — activity feed and estimated current stock holdings since 2012

## Setup

1. Copy `.env.example` to `.env.local` and fill in public Supabase keys, optional `SUPABASE_SERVICE_ROLE_KEY`, and `ALPACA_API_KEY` / `ALPACA_API_SECRET`.
2. In the Supabase SQL Editor, run `docs/02_DATABASE_SCHEMA.sql`, then apply:
   - `supabase/migrations/20260829150000_local_pipeline_columns.sql`
   - `supabase/migrations/20260830140000_stock_price_bars.sql`
   - `supabase/migrations/20260901150000_member_holdings.sql`
3. Configure the backend updater:
   ```bash
   cd backend
   cp .env.example .env
   # set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
   # set ALPACA_API_KEY + ALPACA_API_SECRET for price sync
   npm install
   ```
4. Run the frontend:
   ```bash
   npm install
   npm run dev
   ```

## Importing congressional trade data (Kadoa)

Data flow:

```text
Kadoa dataset → House + Senate only → stocks only → congress_trades → holdings / Latest / Trending
```

Executive-branch disclosures, bonds, ETFs, mutual funds, options, crypto, and
other non-stock assets are discarded. Deduplication uses stable
`source_hash` values (`kadoa:<kadoa_trade_id>`).

### One-time historical backfill (clears old trades)

```bash
npm run backfill-kadoa
```

This will:

1. Download/read the Kadoa dataset (or use `KADOA_DATA_DIR`)
2. Keep House + Senate stock purchase/sale rows only
3. Clear existing `congress_trades` rows (not price history)
4. Upsert into Supabase
5. Recalculate member holdings
6. Fetch missing Alpaca daily bars only

Useful flags (passed through to the backend script):

```bash
cd backend
npx tsx src/backfill-kadoa.ts --no-clear          # upsert without wiping
npx tsx src/backfill-kadoa.ts --data-dir /path    # local Kadoa checkout
npx tsx src/backfill-kadoa.ts --skip-prices
npx tsx src/backfill-kadoa.ts --refresh           # re-clone dataset cache
```

### Incremental refresh

```bash
npm run update-data
```

Re-reads Kadoa and upserts without clearing. Safe to run repeatedly.

### Prices only / tests

```bash
npm run sync:prices
npm run test:prices
cd backend && npm test
```

Only **ordinary listed stocks** (valid tickers passing equity filters) appear in
Latest, Trending, member pages, stock pages, holdings, and Alpaca price sync.

Attribution: see `THIRD_PARTY_NOTICES.md`.

## Deploy (Vercel)

1. Framework Preset: **Next.js**
2. Root Directory: repository root (blank)
3. Output Directory: **leave blank** (do not set `.next` or `out`)
4. Build Command: `next build` (default)
5. Environment variables (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; for last-sync display)
6. After deploy, open the **Production** domain (`*.vercel.app`), not a protected preview deployment URL.

Do **not** put `SUPABASE_SERVICE_ROLE_KEY` or Alpaca keys in any `NEXT_PUBLIC_*` variable.
Alpaca keys are only needed for the local/backend updater, not for Vercel serving pages.

## Docs

See `docs/` for the schema and historical planning notes. Third-party attribution: `THIRD_PARTY_NOTICES.md`.

## Scope

No auth, notifications, AI, live browser market-price calls, portfolios, always-on backend server, or scheduled cloud cron in this MVP. Historical daily bars are ingested server-side from Alpaca and read from Supabase. Scheduling can later wrap `npm run update-data` on a VPS.
