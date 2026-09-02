# Congress Trade Monitor

MVP that fetches House and Senate STOCK Act securities disclosures from official
U.S. government sources (via a local manual updater derived from
[congress-trading-pipeline](https://github.com/seralifatih/congress-trading-pipeline)),
stores them in Supabase, and displays them in a Next.js frontend.

Historical stock prices are cached from Alpaca Market Data (IEX daily bars) during
the same manual update, then read from Supabase by the website.

## Stack

- Next.js (App Router, TypeScript)
- Supabase (Postgres)
- Local Node.js backend updater (`backend/`)
- Alpaca Market Data (IEX daily bars, cached in Supabase)

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

## Updating congressional trade data

The updater fetches the most recent House and Senate disclosures,
deduplicates them, writes new transactions to Supabase, then incrementally
fetches missing Alpaca daily bars for listed stock/ETF tickers.

The website reads congressional trades and stock prices from Supabase only
(no browser calls to Alpaca), so no frontend redeployment is required after
an update.

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
# one-time historical backfill (2012 → present):
npm run backfill-history
# prices only:
npm run sync:prices
# tests:
npm run test:prices
cd backend && npm test
```

Only **listed stocks** (valid tickers passing equity filters) appear in Latest, Trending, member pages, stock pages, and holdings. Bonds, funds, and other non-stock assets are stored with `is_listed_equity = false` and excluded from the UI.

## Historical House PDF OCR setup

Most recent House PTR filings include extractable text and are parsed directly with the normal PDF text extractor.

Some older House filings (especially mid-2010s) are scanned image PDFs. For those, the historical backfill uses **OCRmyPDF as a fallback only**:

1. Download the House PDF
2. Run normal PDF text extraction
3. If usable transaction markers are found → parse with the existing House parser
4. If not → run OCRmyPDF, extract text again, then parse with the same House parser

The normal incremental updater (`npm run update-data`) does **not** OCR PDFs. OCR is only attempted during `npm run backfill-history` when OCRmyPDF is available.

Before a historical House backfill starts, the backend checks whether OCRmyPDF is installed. If it is missing, it prints setup instructions and continues without OCR.

### Windows installation

1. **Python**

   ```powershell
   winget install -e --id Python.Python.3.12
   ```

2. **Tesseract OCR**

   ```powershell
   winget install -e --id UB-Mannheim.TesseractOCR
   ```

3. **Ghostscript**

   Install the current 64-bit Ghostscript for Windows from [https://ghostscript.com/releases/gsdnld.html](https://ghostscript.com/releases/gsdnld.html).

   If a suitable package is available in winget on your machine, that is fine too.

4. **OCRmyPDF**

   ```powershell
   py -m pip install ocrmypdf
   ```

5. **Verify**

   ```powershell
   py -m ocrmypdf --version
   tesseract --version
   ```

The OCR command used for scanned filings is:

```text
py -m ocrmypdf --mode skip input.pdf output.pdf
```

After a historical backfill completes, the summary includes House PDF parsing stats such as normal parses, OCR attempts, OCR successes, and filings that remained unparseable.

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

No auth, notifications, AI, live browser market-price calls, portfolios, always-on backend server, or scheduled cloud cron in this MVP. Historical daily bars are ingested server-side from Alpaca and read from Supabase. OCRmyPDF is used only as an optional fallback during historical House backfill for scanned PDFs. Scheduling can later wrap `npm run update-data` on a VPS.
