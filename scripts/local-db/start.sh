#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$ROOT/.local/bin/postgrest"
CONF="$ROOT/local-db/postgrest.conf"
LOG="$ROOT/local-db/postgrest.log"
GW_LOG="$ROOT/local-db/gateway.log"

mkdir -p "$ROOT/local-db"

if [[ ! -x "$BIN" ]]; then
  bash "$ROOT/scripts/local-db/install-postgrest.sh"
fi
if [[ ! -f "$CONF" ]]; then
  echo "Missing $CONF — run: npm run local:db:bootstrap"
  exit 1
fi

# PostgREST on 54322; gateway on 54321 exposes /rest/v1 for supabase-js
python3 - <<'PY' "$CONF"
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
if "server-port = 54321" in text:
    text = text.replace("server-port = 54321", "server-port = 54322")
if "server-port = 54322" not in text:
    text = text.rstrip() + "\nserver-port = 54322\n"
path.write_text(text)
PY

if command -v pg_ctlcluster >/dev/null; then
  sudo pg_ctlcluster 16 main start 2>/dev/null || true
fi
if ! PGPASSWORD=localdev psql -h 127.0.0.1 -U postgres -d hedgpix -c 'SELECT 1' >/dev/null 2>&1; then
  echo "Cannot connect to local Postgres (hedgpix). Run npm run local:db:bootstrap first."
  exit 1
fi

# Stop previous listeners
pkill -x postgrest >/dev/null 2>&1 || true
pkill -f 'scripts/local-db/gateway.mjs' >/dev/null 2>&1 || true
sleep 0.4

# Start with nohup (reliable in Cloud Agent); also mirror logs
nohup "$BIN" "$CONF" >"$LOG" 2>&1 &
nohup node "$ROOT/scripts/local-db/gateway.mjs" >"$GW_LOG" 2>&1 &

for _ in $(seq 1 40); do
  if curl -fsS --max-time 1 "http://127.0.0.1:54322/" >/dev/null 2>&1 \
    && curl -fsS --max-time 1 "http://127.0.0.1:54321/rest/v1/" >/dev/null 2>&1; then
    echo "Local API ready:"
    echo "  Gateway (Supabase URL): http://127.0.0.1:54321"
    echo "  PostgREST:              http://127.0.0.1:54322"
    exit 0
  fi
  sleep 0.25
done
echo "Failed to start local stack — see $LOG and $GW_LOG"
tail -n 40 "$LOG" 2>/dev/null || true
tail -n 40 "$GW_LOG" 2>/dev/null || true
exit 1
