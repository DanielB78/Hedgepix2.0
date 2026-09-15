#!/usr/bin/env bash
# Start Next.js against the local DB. Unsets any inherited cloud Supabase env
# so process env cannot override .env.local (a common Cloud Agent pitfall).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/local-db/start.sh"

unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
set -a
# shellcheck disable=SC1091
source "$ROOT/.env.local"
set +a

if [[ "${NEXT_PUBLIC_SUPABASE_URL:-}" != http://127.0.0.1:54321* ]]; then
  echo "Expected NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 after sourcing .env.local"
  echo "Got: ${NEXT_PUBLIC_SUPABASE_URL:-<empty>}"
  echo "Run: npm run local:db:bootstrap"
  exit 1
fi

echo "Next.js → $NEXT_PUBLIC_SUPABASE_URL"
exec npm run dev -- --port "${PORT:-3000}"
