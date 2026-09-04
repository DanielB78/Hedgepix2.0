# Congress Trade Monitor

MVP that stores House and Senate STOCK Act securities disclosures in Supabase
and displays ordinary publicly traded stocks in a Next.js frontend.

- **Historical backfill:** MIT-licensed [Kadoa congress-trading-monitor](https://github.com/kadoa-org/congress-trading-monitor) dataset
- **Ongoing updates:** [InsiderWatch](https://insiderwatch.ai/congress-disclosure-lag) open congress-trades CSV (CC BY 4.0)

Historical stock prices are cached from Alpaca Market Data (IEX daily bars)
during updates, then read from Supabase by the website.

## Stack

- Next.js (App Router, TypeScript)
- Supabase (Postgres)
- Local Node.js backend updater (`backend/`)
- Alpaca Market Data (IEX daily bars, cached in Supabase)
- Kadoa static JSON (`public/data/filer/*.json`) for history
- InsiderWatch CSV for new disclosures

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

## Data flow

```text
Kadoa (historical)  ──backfill-kadoa──▶  congress_trades
InsiderWatch (new)  ──update-data────▶  congress_trades
                                              │
                                              ├─▶ holdings
                                              └─▶ Alpaca missing prices
```

Only House + Senate **ordinary listed stocks** are kept. Bonds, ETFs, funds,
options, crypto, and other non-stock assets are discarded.

Deduplication uses a stable content `source_hash` (`trade:<sha256>`) built from
chamber, member, ticker, purchase/sale, amounts, transaction date, and owner so
Kadoa history and InsiderWatch updates can match the same trade.

### One-time historical backfill (Kadoa)

```bash
npm run backfill-kadoa
```

Clears `congress_trades` (not price history), imports Kadoa House/Senate stocks,
rebuilds holdings, and fetches missing Alpaca bars.

### Ongoing updates (InsiderWatch)

```bash
npm run update-data
```

1. Reads `congress_sync_state` for `provider = insiderwatch`
2. Downloads https://insiderwatch.ai/api/data/congress-trades.csv
3. Filters by `filed_date` ≥ last success − overlap (default 3 days; first run uses a 14-day lookback)
4. Keeps House/Senate stocks only
5. Upserts into Supabase
6. Rebuilds holdings + missing Alpaca prices
7. Advances `last_success_at` only on full success

Useful env vars (backend `.env`):

```bash
INSIDERWATCH_OVERLAP_DAYS=3
INSIDERWATCH_INITIAL_DAYS=14
# INSIDERWATCH_CSV_URL=https://insiderwatch.ai/api/data/congress-trades.csv
# INSIDERWATCH_CSV_PATH=/path/to/local.csv
```

### Prices only / tests

```bash
npm run sync:prices
npm run test:prices
cd backend && npm test
```

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
