#!/usr/bin/env node
/**
 * Incremental Alpaca daily-bar sync. Safe to run after congressional trade ingest.
 *   node --env-file=.env.local scripts/sync-stock-prices.mjs
 */
import { createClient } from "@supabase/supabase-js";
import {
  formatUpdateSummary,
  syncStockPrices,
} from "./lib/sync-stock-prices.mjs";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

try {
  const prices = await syncStockPrices(supabase, {
    apiKey: process.env.ALPACA_API_KEY,
    apiSecret: process.env.ALPACA_API_SECRET,
  });
  console.log(JSON.stringify(prices, null, 2));
  console.log(
    formatUpdateSummary({
      trades: { status: "NOT_RUN", rowsReceived: 0, rowsUpserted: 0 },
      prices,
    }),
  );
  if (prices.status === "FAILED") process.exitCode = 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
