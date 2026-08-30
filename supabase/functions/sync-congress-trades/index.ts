// Supabase Edge Function: sync-congress-trades
// Deno runtime. Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BARGO_API_KEY (optional)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const BARGO_BASE = "https://www.bargo.ai/free-apis/congress/v1";
const HOURLY_LIMIT = 100;

type BargoTrade = {
  member: string | null;
  member_slug: string | null;
  chamber: "house" | "senate" | null;
  state: string | null;
  ticker: string | null;
  asset: string | null;
  type: "purchase" | "sale" | "exchange" | null;
  amount_low: number | null;
  amount_high: number | null;
  amount_range: string | null;
  transaction_date: string | null;
  disclosure_date: string | null;
  est_price: number | null;
  recent_price: number | null;
  recent_price_date: string | null;
  perf_pct: number | null;
  realized_return_pct: number | null;
  outcome: string | null;
  filing_portal: string;
};

type BargoTradePage = {
  trades: BargoTrade[];
  page: number;
  limit: number;
  count: number;
};

type SyncMode = "hourly" | "backfill" | "manual";

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "Missing Supabase service credentials" }, 500);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let mode: SyncMode = "hourly";
  let page = 0;
  let limit = HOURLY_LIMIT;

  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (
        body?.mode === "backfill" ||
        body?.mode === "manual" ||
        body?.mode === "hourly"
      ) {
        mode = body.mode;
      }
      if (typeof body?.page === "number" && body.page >= 0) page = body.page;
      if (
        typeof body?.limit === "number" &&
        body.limit >= 1 &&
        body.limit <= 250
      ) {
        limit = body.limit;
      }
    } else {
      const q = new URL(req.url).searchParams;
      const m = q.get("mode");
      if (m === "backfill" || m === "manual" || m === "hourly") mode = m;
      const p = Number(q.get("page") ?? "0");
      if (!Number.isNaN(p) && p >= 0) page = p;
      const l = Number(q.get("limit") ?? String(HOURLY_LIMIT));
      if (!Number.isNaN(l) && l >= 1 && l <= 250) limit = l;
    }
  } catch {
    // use defaults
  }

  if (mode === "hourly") {
    limit = Math.min(limit, HOURLY_LIMIT);
    page = 0;
  }

  const { data: run, error: runInsertError } = await supabase
    .from("congress_sync_runs")
    .insert({
      provider: "bargo",
      mode,
      status: "running",
      requested_page: page,
      requested_limit: limit,
    })
    .select("id")
    .single();

  if (runInsertError || !run) {
    return json(
      { error: runInsertError?.message ?? "Failed to start sync run" },
      500,
    );
  }

  const runId = run.id as string;
  const attemptedAt = new Date().toISOString();

  await supabase.from("congress_sync_state").upsert({
    provider: "bargo",
    last_attempt_at: attemptedAt,
    last_error: null,
  });

  try {
    const bargo = await fetchBargoTrades(page, limit);
    const deduped = new Map<string, Awaited<ReturnType<typeof toUpsertRow>>>();
    for (const trade of bargo.page.trades) {
      const row = await toUpsertRow(trade);
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

      if (upsertError) {
        throw new Error(upsertError.message);
      }
      upserted = upsertedRows?.length ?? 0;
    }

    const latestDisclosure = maxDate(rows.map((r) => r.disclosure_date));
    const latestTransaction = maxDate(rows.map((r) => r.transaction_date));

    const statePatch: Record<string, unknown> = {
      provider: "bargo",
      last_attempt_at: attemptedAt,
      last_success_at: now,
      last_rows_received: bargo.page.trades.length,
      last_rows_upserted: upserted,
      last_error: null,
    };

    if (mode === "backfill") {
      statePatch.backfill_page = page + 1;
    }
    if (latestDisclosure) {
      statePatch.latest_seen_disclosure_date = latestDisclosure;
    }
    if (latestTransaction) {
      statePatch.latest_seen_transaction_date = latestTransaction;
    }

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
      .eq("id", runId);

    let stock_prices: Record<string, unknown> | null = null;
    try {
      stock_prices = await catchUpPricesForTickers(
        supabase,
        rows.map((row) => ({ ticker: row.ticker, asset: row.asset, transaction_date: row.transaction_date })),
      );
    } catch (priceErr) {
      stock_prices = {
        status: "FAILED",
        error: priceErr instanceof Error ? priceErr.message : String(priceErr),
      };
    }

    return json({
      ok: true,
      mode,
      page,
      limit,
      rows_received: bargo.page.trades.length,
      rows_unique: rows.length,
      rows_upserted: upserted,
      rate_limit_requests_remaining: bargo.rateLimitRequestsRemaining,
      rate_limit_rows_remaining: bargo.rateLimitRowsRemaining,
      run_id: runId,
      stock_prices,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finishedAt = new Date().toISOString();

    await supabase
      .from("congress_sync_runs")
      .update({
        status: "failed",
        error_message: message,
        finished_at: finishedAt,
      })
      .eq("id", runId);

    await supabase.from("congress_sync_state").upsert({
      provider: "bargo",
      last_attempt_at: attemptedAt,
      last_error: message,
    });

    return json({ ok: false, error: message, run_id: runId }, 500);
  }
});

async function fetchBargoTrades(page: number, limit: number) {
  const endpoint = new URL(`${BARGO_BASE}/trades`);
  endpoint.searchParams.set("page", String(page));
  endpoint.searchParams.set("limit", String(limit));

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "congress-trade-monitor/0.1",
  };
  const apiKey = Deno.env.get("BARGO_API_KEY");
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }

  const response = await fetch(endpoint.toString(), { headers });
  const rateLimitRequestsRemaining = parseOptionalInt(
    response.headers.get("X-RateLimit-Remaining"),
  );
  const rateLimitRowsRemaining = parseOptionalInt(
    response.headers.get("X-RateLimit-Rows-Remaining"),
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bargo HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const pageBody = (await response.json()) as BargoTradePage;
  if (!Array.isArray(pageBody.trades)) {
    throw new Error("Unexpected Bargo response: missing trades array");
  }

  return {
    page: pageBody,
    rateLimitRequestsRemaining,
    rateLimitRowsRemaining,
  };
}

async function toUpsertRow(trade: BargoTrade) {
  const sourceHash = await computeSourceHash(trade);
  const now = new Date().toISOString();

  return {
    source_hash: sourceHash,
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

async function computeSourceHash(trade: BargoTrade): Promise<string> {
  // Stable identity for idempotent upserts. Excludes derived price fields.
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

  const data = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function maxDate(values: Array<string | null | undefined>): string | null {
  const dates = values.filter((v): v is string => Boolean(v)).sort();
  return dates.length ? dates[dates.length - 1]! : null;
}

function parseOptionalInt(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TICKER_RE = /^[A-Z]{1,5}(\.[A-Z])?$/;
const ASSET_SKIP = [
  "bond",
  "treasury",
  " municipal",
  "muni ",
  "note due",
  "notes due",
  "go utx",
  "certificate of deposit",
  "ctf dep",
  "act/365",
  "t-bill",
  "t bill",
  "ust ",
  "fnma",
  "gnma",
  "private placement",
  "limited partnership",
  "coupon",
];

function isLikelyListedEquity(ticker: string | null, asset: string | null) {
  const symbol = ticker?.trim().toUpperCase() ?? "";
  if (!TICKER_RE.test(symbol)) return false;
  const name = (asset ?? "").toLowerCase();
  if (/%/.test(name) && /(due|mat |maturity|note|bond)/.test(name)) return false;
  return !ASSET_SKIP.some((needle) => name.includes(needle));
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function catchUpPricesForTickers(
  supabase: ReturnType<typeof createClient>,
  rows: Array<{
    ticker: string | null;
    asset: string | null;
    transaction_date: string | null;
  }>,
) {
  const apiKey = Deno.env.get("ALPACA_API_KEY");
  const apiSecret = Deno.env.get("ALPACA_API_SECRET");
  if (!apiKey || !apiSecret) {
    return { status: "SKIPPED", reason: "ALPACA credentials not set" };
  }

  const byTicker = new Map<string, string | null>();
  for (const row of rows) {
    const ticker = row.ticker?.trim().toUpperCase() ?? "";
    if (!isLikelyListedEquity(ticker, row.asset)) continue;
    const prev = byTicker.get(ticker);
    if (!prev || (row.transaction_date && row.transaction_date < prev)) {
      byTicker.set(ticker, row.transaction_date);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  let tickersUpdated = 0;
  let newDailyBars = 0;
  const errors: string[] = [];

  for (const [ticker, earliest] of byTicker) {
    try {
      const { data: latest } = await supabase
        .from("stock_price_bars")
        .select("bar_date")
        .eq("ticker", ticker)
        .order("bar_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const start = latest?.bar_date
        ? addDays(latest.bar_date, 1)
        : addDays(earliest || today, -30);
      if (start > today) continue;

      const endpoint = new URL("https://data.alpaca.markets/v2/stocks/bars");
      endpoint.searchParams.set("symbols", ticker);
      endpoint.searchParams.set("timeframe", "1Day");
      endpoint.searchParams.set("start", start);
      endpoint.searchParams.set("end", today);
      endpoint.searchParams.set("feed", "iex");
      endpoint.searchParams.set("adjustment", "split");
      endpoint.searchParams.set("limit", "10000");
      endpoint.searchParams.set("sort", "asc");

      const response = await fetch(endpoint, {
        headers: {
          "APCA-API-KEY-ID": apiKey,
          "APCA-API-SECRET-KEY": apiSecret,
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        errors.push(`${ticker}: HTTP ${response.status}`);
        continue;
      }
      const body = await response.json();
      const list = body.bars?.[ticker] ?? [];
      const upserts = [];
      for (const bar of list) {
        const barDate = String(bar.t ?? "").slice(0, 10);
        if (!barDate || barDate < start) continue;
        upserts.push({
          ticker,
          bar_date: barDate,
          open: bar.o ?? null,
          high: bar.h ?? null,
          low: bar.l ?? null,
          close: bar.c ?? null,
          volume: bar.v ?? null,
          source: "alpaca_iex",
        });
      }
      if (upserts.length === 0) continue;
      const { error } = await supabase
        .from("stock_price_bars")
        .upsert(upserts, { onConflict: "ticker,bar_date" });
      if (error) {
        errors.push(`${ticker}: ${error.message}`);
        continue;
      }
      tickersUpdated += 1;
      newDailyBars += upserts.length;
    } catch (err) {
      errors.push(`${ticker}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    status: errors.length && !tickersUpdated ? "FAILED" : "SUCCESS",
    tickersChecked: byTicker.size,
    tickersUpdated,
    newDailyBars,
    errors: errors.length,
  };
}
