#!/usr/bin/env bash
# Load ~1 month of Congress / CEO / lighter SEC data into the local DB.
# Skips Form 13F and N-PORT (too large for local/free-tier-sized disks).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/local-db/start.sh"

# Ensure backend points at local gateway and no cloud JWT leaks in from the parent shell
unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
set -a
# shellcheck disable=SC1091
source "$ROOT/backend/.env"
set +a

if [[ "${SUPABASE_URL:-}" != http://127.0.0.1:54321* ]]; then
  echo "backend/.env is not pointed at local gateway. Run: npm run local:db:bootstrap"
  echo "Got SUPABASE_URL=${SUPABASE_URL:-<empty>}"
  exit 1
fi

# Force a fresh 30-day InsiderWatch lookback
export INSIDERWATCH_INITIAL_DAYS=30
export INSIDERWATCH_OVERLAP_DAYS=3
# Persist for subsequent update-data runs
python3 - <<'PY'
from pathlib import Path
path = Path("/workspace/backend/.env")
lines = path.read_text().splitlines() if path.exists() else []
out, found = [], False
for line in lines:
    if line.startswith("INSIDERWATCH_INITIAL_DAYS="):
        out.append("INSIDERWATCH_INITIAL_DAYS=30")
        found = True
    else:
        out.append(line)
if not found:
    out.append("INSIDERWATCH_INITIAL_DAYS=30")
path.write_text("\n".join(out) + "\n")
PY

PGPASSWORD=localdev psql -h 127.0.0.1 -U postgres -d hedgpix <<'SQL'
-- Reset InsiderWatch sync cursor so update-data uses the 30-day initial lookback.
delete from public.congress_sync_state where provider = 'insiderwatch';
insert into public.congress_sync_state (provider) values ('insiderwatch')
  on conflict (provider) do nothing;
-- Drop bootstrap demo rows so Top performers / activity reflect real sources only.
delete from public.congress_trades
  where source_hash like 'trade:local-demo-%'
     or member_slug in ('nancy-demo', 'alex-senate');
delete from public.member_stock_holdings
  where member_slug in ('nancy-demo', 'alex-senate');
SQL

LOG_DIR="/opt/cursor/artifacts"
mkdir -p "$LOG_DIR" "$ROOT/local-db"
LOG="$ROOT/local-db/seed-month.log"
exec > >(tee "$LOG") 2>&1

echo "=== LOCAL 1-MONTH SEED $(date -u -Iseconds) ==="
echo "Target: InsiderWatch ~30d + Kadoa month (House+Senate) + lighter SEC"

cd "$ROOT/backend"

echo ""
echo "=== 1/6 InsiderWatch + prices + news (update-data, SEC skipped) ==="
SKIP_SEC_FILINGS=1 INSIDERWATCH_INITIAL_DAYS=30 npm run update-data

SINCE=$(python3 -c 'from datetime import date,timedelta; print((date.today()-timedelta(days=35)).isoformat())')
echo ""
echo "=== 2/6 Kadoa House+Senate stock trades since $SINCE (upsert, keep InsiderWatch) ==="
npm run backfill-kadoa -- --no-clear --since "$SINCE" --skip-prices || {
  echo "Kadoa month upsert failed — continuing with InsiderWatch-only congress data"
}

# Current calendar quarter for SEC bulk indexes (2026-09 → 2026q3)
YEAR=$(date -u +%Y)
MONTH=$(date -u +%-m)
Q=$(( (MONTH - 1) / 3 + 1 ))
QUARTER="${YEAR}q${Q}"
echo ""
echo "Using SEC quarter: $QUARTER"

echo ""
echo "=== 3/6 CEO Form 4 ($QUARTER) ==="
npm run backfill-ceo-buys -- --from-year "$YEAR" --only "$QUARTER" || {
  echo "CEO backfill for $QUARTER failed or empty — trying previous quarter"
  PREV_Q=$(( Q == 1 ? 4 : Q - 1 ))
  PREV_Y=$(( Q == 1 ? YEAR - 1 : YEAR ))
  npm run backfill-ceo-buys -- --from-year "$PREV_Y" --only "${PREV_Y}q${PREV_Q}" || true
}

echo ""
echo "=== 4/6 Form 144 proposed sales ($QUARTER) ==="
npm run backfill-form144 -- --from-year "$YEAR" --only "$QUARTER" || true

echo ""
echo "=== 5/6 13D/13G ownership ($QUARTER) ==="
npm run backfill-sec-ownership -- --from-year "$YEAR" --only "$QUARTER" || true

echo ""
echo "=== 6/6 Company filings 8-K / 10-Q/K / offerings ($QUARTER) ==="
# company-filings --only is a period key filter inside each pipeline
npm run backfill-company-filings -- --from-year "$YEAR" --only "$QUARTER" || true

echo ""
echo "=== CONGRESS COUNTS ==="
PGPASSWORD=localdev psql -h 127.0.0.1 -U postgres -d hedgpix -c "
SELECT chamber, transaction_type, count(*)
FROM congress_trades
GROUP BY 1, 2
ORDER BY 1, 2;
SELECT min(disclosure_date) AS from_d, max(disclosure_date) AS to_d, count(*) AS trades
FROM congress_trades;
"

echo ""
echo "=== COUNTS ==="
PGPASSWORD=localdev psql -h 127.0.0.1 -U postgres -d hedgpix -c "
SELECT relname AS table, n_live_tup AS approx_rows
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC NULLS LAST
LIMIT 20;
SELECT pg_size_pretty(pg_database_size('hedgpix')) AS db_size;
"

# Refresh PostgREST schema cache after heavy writes
kill -USR1 "$(pgrep -n -x postgrest)" 2>/dev/null || true

echo ""
echo "=== DONE $(date -u -Iseconds) ==="
echo "Log: $LOG"
echo "Stack is still running. Stop with: npm run local:db:stop"
