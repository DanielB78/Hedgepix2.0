#!/usr/bin/env bash
# Stop the local data stack. Nothing is left listening afterward.
set -euo pipefail

STOP_NEXT="${LOCAL_STOP_NEXT:-1}"

echo "Stopping local gateway…"
pkill -f 'scripts/local-db/gateway.mjs' >/dev/null 2>&1 || true

echo "Stopping PostgREST…"
pkill -x postgrest >/dev/null 2>&1 || true

if [[ "$STOP_NEXT" == "1" ]]; then
  echo "Stopping Next.js (port 3000)…"
  # Prefer precise PIDs over broad name kills
  for pid in $(pgrep -f 'next-server|next dev --port 3000' 2>/dev/null || true); do
    kill "$pid" >/dev/null 2>&1 || true
  done
fi

if command -v pg_ctlcluster >/dev/null; then
  if pg_lsclusters 2>/dev/null | awk '/^16/ {print $4}' | grep -qx online; then
    echo "Stopping Postgres 16 cluster…"
    sudo pg_ctlcluster 16 main stop || true
  else
    echo "Postgres cluster already stopped."
  fi
fi

sleep 0.5
still=0
curl -fsS --max-time 1 http://127.0.0.1:54321/rest/v1/ >/dev/null 2>&1 && still=1 || true
curl -fsS --max-time 1 http://127.0.0.1:54322/ >/dev/null 2>&1 && still=1 || true
if PGPASSWORD=localdev psql -h 127.0.0.1 -U postgres -d hedgpix -c 'SELECT 1' >/dev/null 2>&1; then
  still=1
fi

if [[ "$still" -eq 0 ]]; then
  echo "Local stack stopped (gateway, PostgREST, Postgres${STOP_NEXT:+, Next.js})."
  echo "Start again with: npm run local:db:start   (and npm run local:dev for the site)"
else
  echo "Warning: something may still be listening — run: npm run local:db:status"
  exit 1
fi
