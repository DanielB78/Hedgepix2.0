#!/usr/bin/env node
/**
 * Manual sync for local/dev testing (mirrors supabase/functions/sync-congress-trades).
 * Usage:
 *   node --env-file=.env.local scripts/sync-congress-trades.mjs
 *   node --env-file=.env.local scripts/sync-congress-trades.mjs --limit=50 --mode=manual
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  formatUpdateSummary,
  syncStockPrices,
} from "./lib/sync-stock-prices.mjs";

const BARGO_BASE = "https://www.bargo.ai/free-apis/congress/v1";

function parseArgs(argv) {
  const out = { mode: "manual", page: 0, limit: 50 };
  for (const arg of argv) {
    if (arg.startsWith("--mode=")) out.mode = arg.slice(7);
    if (arg.startsWith("--page=")) out.page = Number(arg.slice(7));
    if (arg.startsWith("--limit=")) out.limit = Number(arg.slice(8));
  }
  if (!["hourly", "backfill", "manual"].includes(out.mode)) {
    throw new Error(`Invalid mode: ${out.mode}`);
  }
  if (Number.isNaN(out.page) || out.page < 0) throw new Error("Invalid page");
  if (Number.isNaN(out.limit) || out.limit < 1 || out.limit > 250) {
    throw new Error("Invalid limit");
  }
  return out;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function sourceHash(trade) {
  const payload = [
    trade.member_slug ?? "",
    trade.ticker ?? "",
    trade.type ?? "",
    trade.amount_low ?? "",
    trade.amount_high ?? "",
    trade.transaction_date ?? "",
    trade.disclosure_date ?? "",
    trade.filing_portal ?? "",
    trade.asset ?? "",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

function toUpsertRow(trade) {
  const now = new Date().toISOString();
  return {
    source_hash: sourceHash(trade),
    member: trade.member,
    member_slug: trade.member_slug,
    chamber: trade.chamber,
    state: trade.state,
    ticker: trade.ticker,
    asset: trade.asset,
    transaction_type: trade.type,
    amount_low: trade.amount_low,
    amount_high: trade.amount_high,
    amount_range: trade.amount_range,
    transaction_date: trade.transaction_date,
    disclosure_date: trade.disclosure_date,
    est_price: trade.est_price,
    recent_price: trade.recent_price,
    recent_price_date: trade.recent_price_date,
    perf_pct: trade.perf_pct,
    realized_return_pct: trade.realized_return_pct,
    outcome: trade.outcome,
    filing_portal: trade.filing_portal,
    raw_source: trade,
    last_seen_at: now,
    updated_at: now,
  };
}

function maxDate(values) {
  const dates = values.filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

async function fetchBargoTrades(page, limit) {
  const endpoint = new URL(`${BARGO_BASE}/trades`);
  endpoint.searchParams.set("page", String(page));
  endpoint.searchParams.set("limit", String(limit));

  const headers = {
    Accept: "application/json",
    "User-Agent": "congress-trade-monitor/0.1",
  };
  if (process.env.BARGO_API_KEY) {
    headers["X-Api-Key"] = process.env.BARGO_API_KEY;
  }

  const response = await fetch(endpoint, { headers });
  const rateLimitRequestsRemaining = Number.parseInt(
    response.headers.get("X-RateLimit-Remaining") ?? "",
    10,
  );
  const rateLimitRowsRemaining = Number.parseInt(
    response.headers.get("X-RateLimit-Rows-Remaining") ?? "",
    10,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bargo HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = await response.json();
  if (!Array.isArray(body.trades)) {
    throw new Error("Unexpected Bargo response: missing trades array");
  }

  return {
    page: body,
    rateLimitRequestsRemaining: Number.isNaN(rateLimitRequestsRemaining)
      ? null
      : rateLimitRequestsRemaining,
    rateLimitRowsRemaining: Number.isNaN(rateLimitRowsRemaining)
      ? null
      : rateLimitRowsRemaining,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let page = args.page;
  let limit = args.limit;
  if (args.mode === "hourly") {
    limit = Math.min(limit, 100);
    page = 0;
  }

  const attemptedAt = new Date().toISOString();
  const { data: run, error: runInsertError } = await supabase
    .from("congress_sync_runs")
    .insert({
      provider: "bargo",
      mode: args.mode,
      status: "running",
      requested_page: page,
      requested_limit: limit,
    })
    .select("id")
    .single();

  if (runInsertError || !run) {
    throw new Error(runInsertError?.message ?? "Failed to start sync run");
  }

  await supabase.from("congress_sync_state").upsert({
    provider: "bargo",
    last_attempt_at: attemptedAt,
    last_error: null,
  });

  try {
    const before = await supabase
      .from("congress_trades")
      .select("*", { count: "exact", head: true });

    const bargo = await fetchBargoTrades(page, limit);
    const deduped = new Map();
    for (const trade of bargo.page.trades) {
      const row = toUpsertRow(trade);
      deduped.set(row.source_hash, row);
    }
    const rows = [...deduped.values()];
    const now = new Date().toISOString();

    let upserted = 0;
    if (rows.length > 0) {
      const { data: upsertedRows, error: upsertError } = await supabase
        .from("congress_trades")
        .upsert(rows, { onConflict: "source_hash" })
        .select("id");
      if (upsertError) throw new Error(upsertError.message);
      upserted = upsertedRows?.length ?? 0;
    }

    const after = await supabase
      .from("congress_trades")
      .select("*", { count: "exact", head: true });

    const statePatch = {
      provider: "bargo",
      last_attempt_at: attemptedAt,
      last_success_at: now,
      last_rows_received: bargo.page.trades.length,
      last_rows_upserted: upserted,
      last_error: null,
      latest_seen_disclosure_date: maxDate(
        rows.map((r) => r.disclosure_date),
      ),
      latest_seen_transaction_date: maxDate(
        rows.map((r) => r.transaction_date),
      ),
    };
    if (args.mode === "backfill") statePatch.backfill_page = page + 1;

    await supabase.from("congress_sync_state").upsert(statePatch);
    await supabase
      .from("congress_sync_runs")
      .update({
        status: "success",
        rows_received: bargo.page.trades.length,
        rows_upserted: upserted,
        rate_limit_requests_remaining: bargo.rateLimitRequestsRemaining,
        rate_limit_rows_remaining: bargo.rateLimitRowsRemaining,
        finished_at: now,
      })
      .eq("id", run.id);

    let prices = {
      status: "SKIPPED",
      tickersChecked: 0,
      tickersUpdated: 0,
      newDailyBars: 0,
      skippedUnsupported: 0,
      skippedNoHistory: 0,
      errors: 0,
      errorMessages: [],
    };
    try {
      prices = await syncStockPrices(supabase, {
        apiKey: process.env.ALPACA_API_KEY,
        apiSecret: process.env.ALPACA_API_SECRET,
      });
    } catch (priceErr) {
      prices = {
        status: "FAILED",
        tickersChecked: 0,
        tickersUpdated: 0,
        newDailyBars: 0,
        skippedUnsupported: 0,
        skippedNoHistory: 0,
        errors: 1,
        errorMessages: [
          priceErr instanceof Error ? priceErr.message : String(priceErr),
        ],
      };
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: args.mode,
          page,
          limit,
          rows_received: bargo.page.trades.length,
          rows_unique: rows.length,
          rows_upserted: upserted,
          trade_count_before: before.count ?? null,
          trade_count_after: after.count ?? null,
          rate_limit_requests_remaining: bargo.rateLimitRequestsRemaining,
          rate_limit_rows_remaining: bargo.rateLimitRowsRemaining,
          run_id: run.id,
          stock_prices: prices,
        },
        null,
        2,
      ),
    );
    console.log(
      formatUpdateSummary({
        trades: {
          status: "SUCCESS",
          rowsReceived: bargo.page.trades.length,
          rowsUpserted: upserted,
          tradeCountAfter: after.count ?? null,
          houseReceived: bargo.page.trades.filter((t) => t.chamber === "house")
            .length,
          senateReceived: bargo.page.trades.filter((t) => t.chamber === "senate")
            .length,
        },
        prices,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("congress_sync_runs")
      .update({
        status: "failed",
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    await supabase.from("congress_sync_state").upsert({
      provider: "bargo",
      last_attempt_at: attemptedAt,
      last_error: message,
    });
    console.error(JSON.stringify({ ok: false, error: message, run_id: run.id }));
    process.exitCode = 1;
  }
}

main();
