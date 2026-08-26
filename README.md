# Congress Trade Monitor

MVP that fetches normalized congressional securities disclosures from [Bargo](https://www.bargo.ai/free-apis/congress), stores them in Supabase, syncs hourly via a Supabase Edge Function + Cron, and displays them in a Next.js frontend.

## Stack

- Next.js (App Router, TypeScript)
- Supabase (Postgres + Edge Functions + Cron)
- Bargo Congress Trades API

## Setup

1. Copy `.env.example` to `.env.local` and fill in Supabase + optional `BARGO_API_KEY`.
2. In the Supabase SQL Editor, run `docs/02_DATABASE_SCHEMA.sql` (also at `supabase/migrations/20260326120000_congress_trade_monitor.sql`).
3. Deploy the Edge Function:
   ```bash
   npx supabase functions deploy sync-congress-trades
   ```
4. Set Edge Function secrets: `SUPABASE_SERVICE_ROLE_KEY`, optional `BARGO_API_KEY`.
5. Manually invoke sync once before enabling Cron:
   ```bash
   curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/sync-congress-trades" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"mode":"manual"}'
   ```
6. After a successful manual sync, apply `supabase/cron_hourly_sync.sql` (replace project ref and service role key).
7. Run the frontend:
   ```bash
   npm install
   npm run dev
   ```

## Docs

See `docs/` for the schema, implementation plan, and Cursor master prompt. Specs `00`, `01`, `03`, and `04` were not included in the initial upload.

## Scope

No auth, notifications, AI, market-price APIs, portfolios, PDF scraping, queues, or Redis.
