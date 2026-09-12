import type { Chamber } from "./types";
import { createBrowserSupabase, hasPublicSupabaseConfig } from "./supabase";

export type PerformerPeriod = "2026" | "6m" | "3m" | "1m";

export type TopPerformer = {
  key: string;
  name: string;
  kind: "ceo" | Chamber;
  memberSlug: string | null;
  avgReturnPct: number;
  buyCount: number;
  pricedBuyCount: number;
  bestTicker: string | null;
  bestReturnPct: number | null;
};

type BuyRow = {
  key: string;
  name: string;
  kind: "ceo" | Chamber;
  memberSlug: string | null;
  ticker: string;
  transactionDate: string;
};

export const PERFORMER_PERIODS: PerformerPeriod[] = ["2026", "6m", "3m", "1m"];

const PAGE = 1000;
const TICKER_CHUNK = 40;
const BAR_PAGE = 1000;

export function parsePerformerPeriod(
  value: string | string[] | undefined,
): PerformerPeriod {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "2026" || raw === "ytd") return "2026";
  if (raw === "6m" || raw === "6mo" || raw === "6") return "6m";
  if (raw === "3m" || raw === "3mo" || raw === "3") return "3m";
  if (raw === "1m" || raw === "month" || raw === "1mo" || raw === "1") {
    return "1m";
  }
  return "2026";
}

export function performerPeriodLabel(period: PerformerPeriod): string {
  switch (period) {
    case "2026":
      return "2026";
    case "6m":
      return "6 months";
    case "3m":
      return "3 months";
    case "1m":
      return "Month";
  }
}

export function performerCutoffDate(period: PerformerPeriod): string {
  if (period === "2026") return "2026-01-01";
  const days = period === "6m" ? 180 : period === "3m" ? 90 : 30;
  const now = new Date();
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  utc.setUTCDate(utc.getUTCDate() - days);
  const cutoff = utc.toISOString().slice(0, 10);
  return cutoff < "2026-01-01" ? "2026-01-01" : cutoff;
}

export function performerPeriodHref(
  period: PerformerPeriod,
  extras?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  if (extras) {
    for (const [key, val] of Object.entries(extras)) {
      if (val) params.set(key, val);
    }
  }
  if (period !== "2026") params.set("perf", period);
  const qs = params.toString();
  return qs ? `/app?${qs}` : "/app";
}

function normalizeTicker(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toUpperCase();
  return t || null;
}

/** Pure ranking helper for tests: average buy return per person. */
export function rankBuyPerformers(
  buys: BuyRow[],
  entryClose: Map<string, number>,
  latestClose: Map<string, number>,
  limit = 10,
): TopPerformer[] {
  type Acc = {
    key: string;
    name: string;
    kind: "ceo" | Chamber;
    memberSlug: string | null;
    returns: number[];
    bestTicker: string | null;
    bestReturnPct: number | null;
    buyCount: number;
  };

  const byKey = new Map<string, Acc>();

  for (const buy of buys) {
    let acc = byKey.get(buy.key);
    if (!acc) {
      acc = {
        key: buy.key,
        name: buy.name,
        kind: buy.kind,
        memberSlug: buy.memberSlug,
        returns: [],
        bestTicker: null,
        bestReturnPct: null,
        buyCount: 0,
      };
      byKey.set(buy.key, acc);
    }
    acc.buyCount += 1;

    const entry = entryClose.get(`${buy.ticker}|${buy.transactionDate}`);
    const latest = latestClose.get(buy.ticker);
    if (
      entry == null ||
      latest == null ||
      !Number.isFinite(entry) ||
      !Number.isFinite(latest) ||
      entry <= 0
    ) {
      continue;
    }
    const ret = ((latest - entry) / entry) * 100;
    acc.returns.push(ret);
    if (acc.bestReturnPct == null || ret > acc.bestReturnPct) {
      acc.bestReturnPct = ret;
      acc.bestTicker = buy.ticker;
    }
  }

  return [...byKey.values()]
    .filter((acc) => acc.returns.length > 0)
    .map((acc) => {
      const sum = acc.returns.reduce((a, b) => a + b, 0);
      return {
        key: acc.key,
        name: acc.name,
        kind: acc.kind,
        memberSlug: acc.memberSlug,
        avgReturnPct: sum / acc.returns.length,
        buyCount: acc.buyCount,
        pricedBuyCount: acc.returns.length,
        bestTicker: acc.bestTicker,
        bestReturnPct: acc.bestReturnPct,
      };
    })
    .sort((a, b) => {
      if (b.avgReturnPct !== a.avgReturnPct) {
        return b.avgReturnPct - a.avgReturnPct;
      }
      return b.pricedBuyCount - a.pricedBuyCount;
    })
    .slice(0, limit);
}

async function fetchAllCongressBuys(cutoff: string): Promise<BuyRow[]> {
  const supabase = createBrowserSupabase();
  const buys: BuyRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("congress_trades")
      .select(
        "member, member_slug, chamber, ticker, transaction_date, is_listed_equity",
      )
      .eq("transaction_type", "purchase")
      .eq("is_listed_equity", true)
      .gte("transaction_date", cutoff)
      .not("ticker", "is", null)
      .order("transaction_date", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const ticker = normalizeTicker(row.ticker as string | null);
      const name = String(row.member ?? "").trim();
      const slug = (row.member_slug as string | null)?.trim() || null;
      const chamber = row.chamber as Chamber | null;
      const tx = (row.transaction_date as string | null)?.slice(0, 10);
      if (
        !ticker ||
        !name ||
        !tx ||
        (chamber !== "house" && chamber !== "senate")
      ) {
        continue;
      }
      buys.push({
        key: `congress:${slug ?? name.toLowerCase()}`,
        name,
        kind: chamber,
        memberSlug: slug,
        ticker,
        transactionDate: tx,
      });
    }

    if (rows.length < PAGE) break;
    from += PAGE;
  }

  return buys;
}

async function fetchAllCeoBuys(cutoff: string): Promise<BuyRow[]> {
  const supabase = createBrowserSupabase();
  const buys: BuyRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("ceo_stock_purchases")
      .select("ceo_name, ticker, transaction_date, transaction_code")
      .gte("transaction_date", cutoff)
      .not("ticker", "is", null)
      .or(
        "transaction_code.is.null,transaction_code.eq.P,transaction_code.eq.p",
      )
      .order("transaction_date", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const ticker = normalizeTicker(row.ticker as string | null);
      const name = String(row.ceo_name ?? "").trim();
      const tx = (row.transaction_date as string | null)?.slice(0, 10);
      if (!ticker || !name || !tx) continue;
      buys.push({
        key: `ceo:${name.toLowerCase()}`,
        name,
        kind: "ceo",
        memberSlug: null,
        ticker,
        transactionDate: tx,
      });
    }

    if (rows.length < PAGE) break;
    from += PAGE;
  }

  return buys;
}

async function loadPriceMaps(
  buys: BuyRow[],
): Promise<{
  entryClose: Map<string, number>;
  latestClose: Map<string, number>;
}> {
  const supabase = createBrowserSupabase();
  const tickers = [...new Set(buys.map((b) => b.ticker))];
  const minDate =
    buys.reduce(
      (min, b) => (b.transactionDate < min ? b.transactionDate : min),
      buys[0]?.transactionDate ?? "2026-01-01",
    ) || "2026-01-01";

  const series = new Map<string, Array<{ date: string; close: number }>>();

  for (let i = 0; i < tickers.length; i += TICKER_CHUNK) {
    const chunk = tickers.slice(i, i + TICKER_CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("stock_price_bars")
        .select("ticker, bar_date, close")
        .in("ticker", chunk)
        .gte("bar_date", minDate)
        .not("close", "is", null)
        .order("bar_date", { ascending: true })
        .range(from, from + BAR_PAGE - 1);

      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const ticker = normalizeTicker(row.ticker as string);
        const date = (row.bar_date as string)?.slice(0, 10);
        const close = Number(row.close);
        if (!ticker || !date || !Number.isFinite(close)) continue;
        let list = series.get(ticker);
        if (!list) {
          list = [];
          series.set(ticker, list);
        }
        list.push({ date, close });
      }

      if (rows.length < BAR_PAGE) break;
      from += BAR_PAGE;
    }
  }

  const latestClose = new Map<string, number>();
  for (const [ticker, list] of series) {
    if (list.length === 0) continue;
    latestClose.set(ticker, list[list.length - 1].close);
  }

  const entryClose = new Map<string, number>();
  const needed = new Map<string, Set<string>>();
  for (const buy of buys) {
    let dates = needed.get(buy.ticker);
    if (!dates) {
      dates = new Set();
      needed.set(buy.ticker, dates);
    }
    dates.add(buy.transactionDate);
  }

  for (const [ticker, dates] of needed) {
    const list = series.get(ticker);
    if (!list || list.length === 0) continue;
    for (const tx of dates) {
      let found: number | null = null;
      for (const bar of list) {
        if (bar.date >= tx) {
          found = bar.close;
          break;
        }
      }
      if (found != null) entryClose.set(`${ticker}|${tx}`, found);
    }
  }

  return { entryClose, latestClose };
}

export async function fetchTopPerformers(
  period: PerformerPeriod,
  limit = 10,
): Promise<{ rows: TopPerformer[]; error: string | null }> {
  if (!hasPublicSupabaseConfig()) {
    return { rows: [], error: null };
  }

  try {
    const cutoff = performerCutoffDate(period);
    const [congress, ceos] = await Promise.all([
      fetchAllCongressBuys(cutoff),
      fetchAllCeoBuys(cutoff),
    ]);
    const buys = [...congress, ...ceos];
    if (buys.length === 0) return { rows: [], error: null };

    const { entryClose, latestClose } = await loadPriceMaps(buys);
    return {
      rows: rankBuyPerformers(buys, entryClose, latestClose, limit),
      error: null,
    };
  } catch (err) {
    return {
      rows: [],
      error:
        err instanceof Error ? err.message : "Failed to load top performers",
    };
  }
}
