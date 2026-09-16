#!/usr/bin/env bash
set -euo pipefail
echo -n "Postgres: "
if PGPASSWORD=localdev psql -h 127.0.0.1 -U postgres -d hedgpix -c 'SELECT 1' >/dev/null 2>&1; then
  echo "up (hedgpix)"
  PGPASSWORD=localdev psql -h 127.0.0.1 -U postgres -d hedgpix -c \
    "SELECT pg_size_pretty(pg_database_size('hedgpix')) AS db_size;"
  PGPASSWORD=localdev psql -h 127.0.0.1 -U postgres -d hedgpix -c \
    "SELECT relname AS table, n_live_tup AS approx_rows
     FROM pg_stat_user_tables ORDER BY n_live_tup DESC NULLS LAST LIMIT 15;"
else
  echo "down"
fi
echo -n "PostgREST: "
if curl -fsS --max-time 2 http://127.0.0.1:54322/ >/dev/null 2>&1; then
  echo "up http://127.0.0.1:54322"
else
  echo "down"
fi
echo -n "Gateway:   "
if curl -fsS --max-time 2 http://127.0.0.1:54321/rest/v1/ >/dev/null 2>&1; then
  echo "up http://127.0.0.1:54321/rest/v1/"
else
  echo "down"
fi
