# Cursor Master Prompt

You are implementing a small MVP called **Congress Trade Monitor**.

Read these files before changing code:
1. `00_README.md`
2. `01_ARCHITECTURE_AND_DATA_FLOW.md`
3. `02_DATABASE_SCHEMA.sql`
4. `03_BACKEND_SYNC_SPEC.md`
5. `04_FRONTEND_SPEC.md`
6. `05_IMPLEMENTATION_PLAN_FOR_CURSOR.md`

## Objective
Build an app that:
- fetches normalized congressional securities disclosures from Bargo;
- stores them in Supabase;
- runs ingestion hourly using Supabase Cron + Supabase Edge Function;
- displays stored data in a Next.js TypeScript frontend;
- supports basic filters;
- preserves historical records;
- avoids duplicates;
- visibly attributes Bargo.

## Scope discipline
Do not add:
- authentication;
- user profiles;
- notifications;
- AI;
- embeddings;
- market-price APIs;
- portfolios;
- direct PDF scraping;
- queues;
- microservices;
- Redis.

## Working method
Use `05_IMPLEMENTATION_PLAN_FOR_CURSOR.md`.

Before each phase:
1. state files to create/change;
2. implement only that phase;
3. run relevant type/lint/test commands;
4. fix errors;
5. summarize what changed.

Do not silently change documented architecture or schema.

## Constraints
- Bargo key server-side only.
- Supabase service role server-side only.
- Browser never calls Bargo directly.
- Do not use `.select("*")` for public trade queries.
- Default order: disclosure date desc, then transaction date desc.
- Show both transaction and disclosure dates.
- Bargo attribution visible near the top.
- Sync must be idempotent.
- Keep stored history after it leaves Bargo's rolling API.
- Treat hourly monitoring as best-effort because Bargo's global feed is ordered by transaction date.

## First action
Inspect the repository and state which phase it is currently at.

If empty, begin with Phase 1.
