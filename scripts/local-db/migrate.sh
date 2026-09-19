#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

apply() {
  local f="$1"
  echo "=== $f ==="
  # Tolerate duplicate policies / views from overlapping base schema + migrations
  sudo -u postgres psql -d hedgpix -v ON_ERROR_STOP=0 -f "$f" \
    | grep -E 'ERROR|FATAL' || true
}

apply "$ROOT/docs/02_DATABASE_SCHEMA.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  apply "$f"
done

sudo -u postgres psql -d hedgpix <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, authenticator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
SQL

echo "Migrations applied."
