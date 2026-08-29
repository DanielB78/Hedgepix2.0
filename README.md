# Congress Trade Monitor

MVP that fetches House and Senate STOCK Act securities disclosures from official
U.S. government sources (via a local manual updater derived from
[congress-trading-pipeline](https://github.com/seralifatih/congress-trading-pipeline)),
stores them in Supabase, and displays them in a Next.js frontend.

## Stack

- Next.js (App Router, TypeScript)
- Supabase (Postgres)
- Local Node.js backend updater (`backend/`)

## Features

- **Latest** — filterable disclosure feed (member, ticker, chamber, type) with 50-row pagination
- **Trending** — tickers ranked by congressional disclosure activity (`disclosure_date` window: 7 / 30 / 90 days; All / Buys / Sales)

## Setup

1. Copy `.env.example` to `.env.local` and fill in public Supabase keys (and optional `SUPABASE_SERVICE_ROLE_KEY` for sync-status display).
2. In the Supabase SQL Editor, run `docs/02_DATABASE_SCHEMA.sql`, then apply `supabase/migrations/20260829150000_local_pipeline_columns.sql`.
3. Configure the backend updater:
   ```bash
   cd backend
   cp .env.example .env
   # set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
   npm install
   ```
4. Run the frontend:
   ```bash
   npm install
   npm run dev
   ```

## Updating congressional trade data

The updater fetches the most recent House and Senate disclosures,
deduplicates them, and writes new transactions to Supabase.

The website reads directly from Supabase, so no frontend redeployment
is required after an update.

### Option 1 — Windows

Double-click:

```text
update.bat
```

### Option 2 — Terminal

```bash
cd backend
npm run update-data
```

Or from the repo root:

```bash
npm run update-data
```

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

Do **not** put `SUPABASE_SERVICE_ROLE_KEY` in any `NEXT_PUBLIC_*` variable.

## Docs

See `docs/` for the schema and historical planning notes. Third-party attribution: `THIRD_PARTY_NOTICES.md`.

## Scope

No auth, notifications, AI, market-price APIs, portfolios, OCR, always-on backend server, or scheduled cloud cron in this MVP. Scheduling can later wrap `npm run update-data` on a VPS.
