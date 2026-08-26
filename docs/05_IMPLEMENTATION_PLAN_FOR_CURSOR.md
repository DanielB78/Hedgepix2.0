# Implementation Plan for Cursor

Follow this order.

## Phase 1 — Bootstrap
- Create Next.js TypeScript App Router project.
- Add Supabase dependency.
- Add `.env.example`.
- Never commit real keys.

## Phase 2 — Database
Apply `02_DATABASE_SCHEMA.sql`.

Verify:
```text
congress_trades
congress_sync_state
congress_sync_runs
```

## Phase 3 — Backend sync
Build:
```text
supabase/functions/sync-congress-trades/index.ts
```

Use `03_BACKEND_SYNC_SPEC.md`.

First test manually.

Success:
- Bargo response received;
- rows inserted;
- sync run recorded;
- second call creates no duplicates.

Do not configure Cron until manual sync works.

## Phase 4 — Scheduler
Configure Supabase Cron:
```cron
0 * * * *
```

Verify a scheduled run appears in logs and `congress_sync_runs`.

## Phase 5 — Frontend
Build homepage:
- title;
- attribution;
- last checked;
- trade list/table;
- default ordering.

## Phase 6 — Filters
Add:
- member;
- ticker;
- chamber;
- type.

Represent filters in URL query parameters.

## Phase 7 — Pagination
Add 50-row server-side pagination.

## Phase 8 — Backfill
Only after hourly ingestion works.

Create manual backfill that:
- requests up to 250 rows/page;
- uses same hash/upsert;
- reads daily rate-limit headers;
- persists `backfill_page`;
- stops cleanly when budget is low.

## Phase 9 — Verify
Compare several rows with Bargo:
- member;
- ticker;
- type;
- amount range;
- transaction date;
- disclosure date;
- filing portal.

## Coding principles
- Idempotent ingestion.
- Bargo logic isolated from frontend.
- Secrets server-side.
- Never delete old stored trades because Bargo ages them out.
- Prefer explicit simple code.
- No queues, Redis, microservices, or unnecessary ORM.

## Acceptance test
1. Start with empty DB.
2. Invoke sync.
3. Confirm rows.
4. Invoke again.
5. Confirm count does not double.
6. Load frontend.
7. Confirm newest disclosures first.
8. Filter by ticker.
9. Filter by member.
10. Open filing link.
11. Confirm Bargo attribution.
12. Confirm scheduled sync updates run history.
