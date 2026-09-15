#!/usr/bin/env bash
set -euo pipefail
pkill -f 'scripts/local-db/gateway.mjs' 2>/dev/null || true
pkill -x postgrest 2>/dev/null || true
echo "Stopped local gateway + PostgREST (Postgres left running)."
echo "To stop Postgres too: sudo pg_ctlcluster 16 main stop"
