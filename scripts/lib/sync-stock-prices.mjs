import {
  addDays,
  isLikelyListedEquity,
  normalizeTicker,
  utcToday,
} from "./equity-tickers.mjs";

const ALPACA_BARS_URL = "https://data.alpaca.markets/v2/stocks/bars";
const CONTEXT_DAYS = 30;
const BATCH_SIZE = 8;
const PAGE_LIMIT = 10000;
const SOURCE = "alpaca_iex";
const TRADE_PAGE_SIZE = 1000;
const MAX_HISTORY_DAYS = 365 * 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function barDate(timestamp) {
  return String(timestamp).slice(0, 10);
}

export async function fetchAlpacaDailyBars({
  symbols,
  start,
  end,
  apiKey,
  apiSecret,
}) {
  const barsByTicker = new Map();
  let pageToken = null;

  do {
    const endpoint = new URL(ALPACA_BARS_URL);
    endpoint.searchParams.set("symbols", symbols.join(","));
    endpoint.searchParams.set("timeframe", "1Day");
    endpoint.searchParams.set("start", start);
    endpoint.searchParams.set("end", end);
    endpoint.searchParams.set("feed", "iex");
    endpoint.searchParams.set("adjustment", "split");
    endpoint.searchParams.set("limit", String(PAGE_LIMIT));
    endpoint.searchParams.set("sort", "asc");
    if (pageToken) endpoint.searchParams.set("page_token", pageToken);

    const response = await fetch(endpoint, {
      headers: {
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": apiSecret,
        Accept: "application/json",
      },
    });

    if (response.status === 429) {
      const reset = Number(response.headers.get("X-RateLimit-Reset") ?? "0");
      const waitMs = reset > 0 ? Math.max(1000, reset * 1000 - Date.now()) : 2000;
      await sleep(waitMs);
      continue;
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Alpaca HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const body = JSON.parse(text);
    const bars = body.bars ?? {};
    for (const [symbol, list] of Object.entries(bars ?? {})) {
      if (!Array.isArray(list)) continue;
      const existing = barsByTicker.get(symbol) ?? [];
      existing.push(...list);
      barsByTicker.set(symbol, existing);
    }
    pageToken = body.next_page_token ?? null;
  } while (pageToken);

  return barsByTicker;
}

async function latestBarDates(supabase, tickers) {
  const latest = new Map();
  const chunkSize = 10;
  for (let i = 0; i < tickers.length; i += chunkSize) {
    const chunk = tickers.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (ticker) => {
        const { data, error } = await supabase
          .from("stock_price_bars")
          .select("bar_date")
          .eq("ticker", ticker)
          .order("bar_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return [ticker, data?.bar_date ?? null];
      }),
    );
    for (const [ticker, date] of results) {
      if (date) latest.set(ticker, date);
    }
  }
  return latest;
}

export function toBarRows(ticker, alpacaBars) {
  const seen = new Set();
  const rows = [];
  for (const bar of alpacaBars) {
    const date = barDate(bar.t);
    if (!date || seen.has(date)) continue;
    seen.add(date);
    rows.push({
      ticker,
      bar_date: date,
      open: bar.o ?? null,
      high: bar.h ?? null,
      low: bar.l ?? null,
      close: bar.c ?? null,
      volume: bar.v ?? null,
      source: SOURCE,
    });
  }
  return rows;
}

export async function collectEligibleTickers(supabase) {
  const seenAssets = new Map();
  const byTicker = new Map();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("congress_trades")
      .select("ticker, asset, transaction_date, is_listed_equity")
      .not("ticker", "is", null)
      .range(from, from + TRADE_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const ticker = normalizeTicker(row.ticker);
      if (!ticker) continue;
      if (!seenAssets.has(ticker)) seenAssets.set(ticker, false);

      if (row.is_listed_equity === false) continue;
      if (
        row.is_listed_equity !== true &&
        !isLikelyListedEquity(ticker, row.asset)
      ) {
        continue;
      }
      seenAssets.set(ticker, true);

      let acc = byTicker.get(ticker);
      if (!acc) {
        acc = { ticker, earliest: row.transaction_date };
        byTicker.set(ticker, acc);
      }
      if (
        row.transaction_date &&
        (!acc.earliest || row.transaction_date < acc.earliest)
      ) {
        acc.earliest = row.transaction_date;
      }
    }

    if (rows.length < TRADE_PAGE_SIZE) break;
    from += TRADE_PAGE_SIZE;
  }

  const skippedUnsupported = [...seenAssets.entries()]
    .filter(([, eligible]) => !eligible)
    .map(([ticker]) => ticker)
    .sort();

  return { eligible: [...byTicker.values()], skippedUnsupported };
}

function emptyPriceSummary() {
  return {
    status: "SUCCESS",
    tickersChecked: 0,
    tickersUpdated: 0,
    newDailyBars: 0,
    skippedUnsupported: 0,
    skippedNoHistory: 0,
    errors: 0,
    errorMessages: [],
  };
}

async function upsertTickerBars(supabase, job, alpacaBars, summary) {
  if (!alpacaBars || alpacaBars.length === 0) {
    summary.skippedNoHistory += 1;
    console.warn(`No Alpaca daily bars for ${job.ticker} from ${job.start}`);
    return;
  }
  const rows = toBarRows(job.ticker, alpacaBars);
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("stock_price_bars")
    .upsert(rows, { onConflict: "ticker,bar_date" });
  if (error) {
    summary.errors += 1;
    summary.errorMessages.push(`${job.ticker}: ${error.message}`);
    return;
  }
  summary.tickersUpdated += 1;
  summary.newDailyBars += rows.length;
}

async function fetchBarsForJobs(jobs, start, apiKey, apiSecret, summary) {
  const symbols = jobs.map((job) => job.ticker);
  try {
    return await fetchAlpacaDailyBars({
      symbols,
      start,
      end: utcToday(),
      apiKey,
      apiSecret,
    });
  } catch (batchErr) {
    console.warn(
      `Alpaca batch failed (${symbols.join(", ")}): ${
        batchErr instanceof Error ? batchErr.message : String(batchErr)
      } — retrying per symbol`,
    );
    const barsByTicker = new Map();
    for (const job of jobs) {
      try {
        const one = await fetchAlpacaDailyBars({
          symbols: [job.ticker],
          start: job.start,
          end: utcToday(),
          apiKey,
          apiSecret,
        });
        for (const [symbol, bars] of one) barsByTicker.set(symbol, bars);
      } catch (inner) {
        summary.errors += 1;
        summary.errorMessages.push(
          `${job.ticker}: ${inner instanceof Error ? inner.message : String(inner)}`,
        );
      }
    }
    return barsByTicker;
  }
}

export async function syncStockPrices(supabase, { apiKey, apiSecret, tickers } = {}) {
  const summary = emptyPriceSummary();

  if (!apiKey || !apiSecret) {
    summary.status = "SKIPPED";
    summary.errorMessages.push("ALPACA_API_KEY / ALPACA_API_SECRET not set");
    return summary;
  }

  const collected = await collectEligibleTickers(supabase);
  summary.skippedUnsupported = collected.skippedUnsupported.length;
  if (collected.skippedUnsupported.length) {
    console.warn(
      `Skipping unsupported assets: ${collected.skippedUnsupported.join(", ")}`,
    );
  }

  let work = collected.eligible;
  if (Array.isArray(tickers) && tickers.length > 0) {
    const allow = new Set(tickers.map((t) => normalizeTicker(t)).filter(Boolean));
    work = work.filter((item) => allow.has(item.ticker));
  }

  summary.tickersChecked = work.length;
  if (work.length === 0) return summary;

  const latest = await latestBarDates(
    supabase,
    work.map((item) => item.ticker),
  );
  const today = utcToday();
  const incremental = [];
  const fresh = [];

  for (const item of work) {
    const last = latest.get(item.ticker);
    let start;
    if (last) {
      start = addDays(last, 1);
    } else {
      const earliest = item.earliest || today;
      start = addDays(earliest, -CONTEXT_DAYS);
      const floor = addDays(today, -MAX_HISTORY_DAYS);
      if (start < floor) start = floor;
    }
    if (start > today) continue;
    const job = { ticker: item.ticker, start };
    if (last) incremental.push(job);
    else fresh.push(job);
  }

  // Incremental jobs share a near-today start; batch them.
  for (let i = 0; i < incremental.length; i += BATCH_SIZE) {
    const batch = incremental.slice(i, i + BATCH_SIZE);
    const start = batch.reduce(
      (min, job) => (job.start < min ? job.start : min),
      batch[0].start,
    );
    const barsByTicker = await fetchBarsForJobs(
      batch,
      start,
      apiKey,
      apiSecret,
      summary,
    );
    for (const job of batch) {
      await upsertTickerBars(
        supabase,
        job,
        barsByTicker.get(job.ticker) ?? [],
        summary,
      );
    }
  }

  // New tickers: batch by shared request start = min(earliest − 30d).
  // Extra history for newer names is useful chart context, not wasted work.
  for (let i = 0; i < fresh.length; i += BATCH_SIZE) {
    const batch = fresh.slice(i, i + BATCH_SIZE);
    const start = batch.reduce(
      (min, job) => (job.start < min ? job.start : min),
      batch[0].start,
    );
    const barsByTicker = await fetchBarsForJobs(
      batch,
      start,
      apiKey,
      apiSecret,
      summary,
    );
    for (const job of batch) {
      await upsertTickerBars(
        supabase,
        job,
        barsByTicker.get(job.ticker) ?? [],
        summary,
      );
    }
  }

  if (summary.errors > 0 && summary.tickersUpdated === 0) {
    summary.status = "FAILED";
  } else if (summary.errors > 0) {
    summary.status = "PARTIAL";
  }

  return summary;
}

export function formatUpdateSummary({ trades, prices }) {
  const lines = [
    "========================================",
    "CONGRESS TRADE UPDATE COMPLETE",
    "========================================",
    "",
    "CONGRESS TRADES",
    `Status: ${trades.status}`,
  ];
  if (trades.houseReceived != null || trades.senateReceived != null) {
    lines.push(`HOUSE trades in batch: ${trades.houseReceived ?? 0}`);
    lines.push(`SENATE trades in batch: ${trades.senateReceived ?? 0}`);
  }
  lines.push(
    `Rows received: ${trades.rowsReceived ?? 0}`,
    `Rows upserted: ${trades.rowsUpserted ?? 0}`,
    `Trade count after: ${trades.tradeCountAfter ?? "—"}`,
    "",
    "STOCK PRICE DATA",
    `Status: ${prices.status}`,
    `Tickers checked: ${prices.tickersChecked}`,
    `Tickers updated: ${prices.tickersUpdated}`,
    `New daily bars: ${prices.newDailyBars}`,
    `Skipped unsupported assets: ${prices.skippedUnsupported}`,
    `Skipped (no Alpaca history): ${prices.skippedNoHistory}`,
    `Errors: ${prices.errors}`,
  );
  if (prices.errorMessages?.length) {
    for (const message of prices.errorMessages.slice(0, 8)) {
      lines.push(`  - ${message}`);
    }
  }
  lines.push("");
  if (trades.status === "SUCCESS" && prices.status === "FAILED") {
    lines.push("Congress trades: SUCCESS");
    lines.push("Stock prices: FAILED");
    lines.push("Congressional data was stored; price ingest did not roll back trades.");
  } else if (prices.status === "SKIPPED") {
    lines.push("Congressional data stored. Stock prices skipped (Alpaca keys not set).");
  } else {
    lines.push("Supabase successfully updated.");
  }
  lines.push("========================================");
  return lines.join("\n");
}
