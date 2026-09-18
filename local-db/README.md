# Local database (offline from cloud Supabase)

Use this when the hosted Supabase project is overloaded, over quota, or unreachable.
It runs **PostgreSQL + PostgREST** on localhost and keeps the same
`@supabase/supabase-js` API the app already uses.

## What you get

| Service | URL / port |
|---------|------------|
| Postgres | `127.0.0.1:5432` database `hedgpix` |
| PostgREST | `http://127.0.0.1:54322` |
| Gateway (set as `SUPABASE_URL`) | `http://127.0.0.1:54321` — maps `/rest/v1/*` → PostgREST |

Auth (GoTrue) is **stubbed**. Public data pages work; email signup/login will not until you point back at cloud Supabase or add GoTrue.

## One-time setup

```bash
# Requires: PostgreSQL 16 client+server, curl, python3
sudo apt-get install -y postgresql postgresql-contrib

# Download PostgREST binary into .local/bin (gitignored)
npm run local:db:install

# Create roles, apply schema, write .env.local + backend/.env
npm run local:db:bootstrap
```

## Daily use

```bash
npm run local:db:start       # start Postgres + PostgREST + gateway
npm run local:db:status
npm run local:dev            # Next.js on :3000 (clears inherited cloud env)
npm run local:db:seed-month  # ~30d InsiderWatch + Kadoa House/Senate + lighter SEC
npm run local:db:stop        # stop gateway + PostgREST + Postgres (+ Next)
# alias: npm run local:stop
```

The stack does **not** stay up unless you start it. `local:db:stop` shuts
everything down (including Postgres). Start again only when you need it.

Important: if your shell already exports `NEXT_PUBLIC_SUPABASE_URL` (cloud),
that overrides `.env.local`. Prefer `npm run local:dev`, which unsets those
vars before starting Next.

## Credentials (local only)

Written by bootstrap into `.env.local` and `backend/.env`:

- URL: `http://127.0.0.1:54321`
- JWT secret: `super-secret-jwt-token-with-at-least-32-characters-long`
- DB password for `postgres` / `authenticator`: `localdev`
- `DATABASE_URL=postgresql://postgres:localdev@127.0.0.1:5432/hedgpix`

Do **not** point production at these keys.

## Disk / SEC note

Do not run full Form 13F / N-PORT backfills into this local DB without filtering —
one 13F period is millions of holdings rows and will fill disk quickly. Prefer
Congress / CEO / news pipelines for local UI work.

## Switch back to cloud

Restore your previous `.env.local` and `backend/.env` (or copy from a backup),
then stop the local stack.
