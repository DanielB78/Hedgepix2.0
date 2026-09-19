import type { Chamber } from "./types";
import { resolveCeoTransactionCode } from "./ceoAggregate";
import { createBrowserSupabase, hasPublicSupabaseConfig } from "./supabase";

export type PerformerPeriod = "2026" | "1y" | "6m" | "3m" | "1m";

export type TopPerformer = {
  key: string;
  name: string;
  kind: "ceo" | Chamber;
  memberSlug: string | null;
  avgReturnPct: number;
  medianReturnPct: number;
  buyCount: number;
  pricedBuyCount: number;
  bestTicker: string | null;
  bestReturnPct: number | null;
  worstTicker: string | null;
  worstReturnPct: number | null;
};

export type PortfolioGrowth = {
  /** Equal-weighted average return across all priced buys in the period. */
  avgReturnPct: number;
  pricedBuyCount: number;
  buyCount: number;
  congressPricedCount: number;
  ceoPricedCount: number;
};

/** Individual purchase ranked by appreciation since reference price. */
export type TopPerformingBuy = {
  id: string;
  ticker: string;
  personKey: string;
  name: string;
  kind: "ceo" | Chamber;
  memberSlug: string | null;
  transactionDate: string;
  referencePrice: number;
  latestPrice: number;
  latestPriceDate: string | null;
  returnPct: number;
  holdingDays: number | null;
  sourceLabel: string;
};

type BuyRow = {
  key: string;
  name: string;
  kind: "ceo" | Chamber;
  memberSlug: string | null;
  ticker: string;
  transactionDate: string;
};

export const PERFORMER_PERIODS: PerformerPeriod[] = ["1m", "3m", "6m", "1y"];

const PAGE = 1000;
const TICKER_CHUNK = 40;
const BAR_PAGE = 1000;
/** Cap buys scanned so ranking stays fast enough for feed navigation. */
const MAX_CONGRESS_BUYS = 400;
const MAX_CEO_BUYS = 400;
/** Over-fetch CEO rows before filtering sales mislabeled as purchases. */
const CEO_FETCH_CAP = 1200;

export function parsePerformerPeriod(
  value: string | string[] | undefined,
  fallback: PerformerPeriod = "1m",
): PerformerPeriod {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "2026" || raw === "ytd") return "2026";
  if (raw === "1y" || raw === "12m" || raw === "year") return "1y";
  if (raw === "6m" || raw === "6mo" || raw === "6") return "6m";
  if (raw === "3m" || raw === "3mo" || raw === "3") return "3m";
  if (raw === "1m" || raw === "month" || raw === "1mo" || raw === "1") {
    return "1m";
  }
  return fallback;
}

export function performerPeriodLabel(period: PerformerPeriod): string {
  switch (period) {
    case "2026":
      return "2026";
    case "1y":
      return "1 Year";
    case "6m":
      return "6 Months";
    case "3m":
      return "3 Months";
    case "1m":
      return "1 Month";
  }
}

export function performerCutoffDate(period: PerformerPeriod): string {
  if (period === "2026") return "2026-01-01";
  const days =
    period === "1y" ? 365 : period === "6m" ? 180 : period === "3m" ? 90 : 30;
  const now = new Date();
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  utc.setUTCDate(utc.getUTCDate() - days);
  const cutoff = utc.toISOString().slice(0, 10);
  return cutoff < "2026-01-01" ? "2026-01-01" : cutoff;
}

export type PerformerViewMode = "portfolio" | "buys";

export function parsePerformerView(
  value: string | string[] | undefined,
): PerformerViewMode {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return raw === "buys" || raw === "top-buys" ? "buys" : "portfolio";
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
  // Default period is 1m (aligns with House/Senate/Trending activity windows).
  if (period !== "1m") params.set("perf", period);
  const qs = params.toString();
  return qs ? `/app?${qs}` : "/app";
}

function normalizeTicker(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toUpperCase();
  return t || null;
}

function isValidTxDate(tx: string, todayIso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx)) return false;
  if (tx > todayIso) return false;
  return true;
}

function sourceLabelForKind(kind: "ceo" | Chamber): string {
  if (kind === "ceo") return "Form 4";
  if (kind === "senate") return "Senate";
  return "House";
}

function holdingDaysBetween(
  fromIso: string,
  toIso: string | null,
): number | null {
  if (!toIso) return null;
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/** Same person + ticker + transaction date → one purchase occasion. */
export function dedupeSameDayBuys(buys: BuyRow[]): BuyRow[] {
  const seen = new Set<string>();
  const out: BuyRow[] = [];
  for (const buy of buys) {
    const key = `${buy.key}|${buy.ticker}|${buy.transactionDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(buy);
  }
  return out;
}

function buyReturns(
  buys: BuyRow[],
  entryClose: Map<string, number>,
  latestClose: Map<string, number>,
  latestCloseDate: Map<string, string>,
): Array<
  BuyRow & {
    returnPct: number;
    referencePrice: number;
    latestPrice: number;
    latestPriceDate: string | null;
  }
> {
  const out: Array<
    BuyRow & {
      returnPct: number;
      referencePrice: number;
      latestPrice: number;
      latestPriceDate: string | null;
    }
  > = [];
  for (const buy of buys) {
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
    out.push({
      ...buy,
      returnPct: ((latest - entry) / entry) * 100,
      referencePrice: entry,
      latestPrice: latest,
      latestPriceDate: latestCloseDate.get(buy.ticker) ?? null,
    });
  }
  return out;
}

/** Pure ranking helper for tests: average buy return per person. */
export function rankBuyPerformers(
  buys: BuyRow[],
  entryClose: Map<string, number>,
  latestClose: Map<string, number>,
  limit = 10,
  latestCloseDate: Map<string, string> = new Map(),
): TopPerformer[] {
  const people = rankPortfolioPeople(
    buys,
    entryClose,
    latestClose,
    latestCloseDate,
  );
  return people
    .slice()
    .sort((a, b) => {
      if (b.avgReturnPct !== a.avgReturnPct) {
        return b.avgReturnPct - a.avgReturnPct;
      }
      return b.pricedBuyCount - a.pricedBuyCount;
    })
    .slice(0, limit);
}

/** Person-level portfolio metrics; default order is name (A–Z). */
export function rankPortfolioPeople(
  buys: BuyRow[],
  entryClose: Map<string, number>,
  latestClose: Map<string, number>,
  latestCloseDate: Map<string, string> = new Map(),
): TopPerformer[] {
  type Acc = {
    key: string;
    name: string;
    kind: "ceo" | Chamber;
    memberSlug: string | null;
    returns: number[];
    bestTicker: string | null;
    bestReturnPct: number | null;
    worstTicker: string | null;
    worstReturnPct: number | null;
    buyCount: number;
  };

  const byKey = new Map<string, Acc>();
  const priced = buyReturns(buys, entryClose, latestClose, latestCloseDate);

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
        worstTicker: null,
        worstReturnPct: null,
        buyCount: 0,
      };
      byKey.set(buy.key, acc);
    }
    acc.buyCount += 1;
  }

  for (const buy of priced) {
    const acc = byKey.get(buy.key);
    if (!acc) continue;
    acc.returns.push(buy.returnPct);
    if (acc.bestReturnPct == null || buy.returnPct > acc.bestReturnPct) {
      acc.bestReturnPct = buy.returnPct;
      acc.bestTicker = buy.ticker;
    }
    if (acc.worstReturnPct == null || buy.returnPct < acc.worstReturnPct) {
      acc.worstReturnPct = buy.returnPct;
      acc.worstTicker = buy.ticker;
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
        medianReturnPct: medianOf(acc.returns),
        buyCount: acc.buyCount,
        pricedBuyCount: acc.returns.length,
        bestTicker: acc.bestTicker,
        bestReturnPct: acc.bestReturnPct,
        worstTicker: acc.worstTicker,
        worstReturnPct: acc.worstReturnPct,
      };
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

/** Individual purchases ranked by return descending. */
export function rankTopPerformingBuys(
  buys: BuyRow[],
  entryClose: Map<string, number>,
  latestClose: Map<string, number>,
  latestCloseDate: Map<string, string> = new Map(),
  limit = 50,
): TopPerformingBuy[] {
  const priced = buyReturns(buys, entryClose, latestClose, latestCloseDate);
  return priced
    .map((buy) => ({
      id: `${buy.key}|${buy.ticker}|${buy.transactionDate}`,
      ticker: buy.ticker,
      personKey: buy.key,
      name: buy.name,
      kind: buy.kind,
      memberSlug: buy.memberSlug,
      transactionDate: buy.transactionDate,
      referencePrice: buy.referencePrice,
      latestPrice: buy.latestPrice,
      latestPriceDate: buy.latestPriceDate,
      returnPct: buy.returnPct,
      holdingDays: holdingDaysBetween(buy.transactionDate, buy.latestPriceDate),
      sourceLabel: sourceLabelForKind(buy.kind),
    }))
    .sort((a, b) => {
      if (b.returnPct !== a.returnPct) return b.returnPct - a.returnPct;
      return b.transactionDate.localeCompare(a.transactionDate);
    })
    .slice(0, limit);
}

/** Equal-weighted portfolio return across all priced buys. */
export function computePortfolioGrowth(
  buys: BuyRow[],
  entryClose: Map<string, number>,
  latestClose: Map<string, number>,
  latestCloseDate: Map<string, string> = new Map(),
): PortfolioGrowth | null {
  const priced = buyReturns(buys, entryClose, latestClose, latestCloseDate);
  if (priced.length === 0) return null;
  const sum = priced.reduce((a, b) => a + b.returnPct, 0);
  return {
    avgReturnPct: sum / priced.length,
    pricedBuyCount: priced.length,
    buyCount: buys.length,
    congressPricedCount: priced.filter((b) => b.kind !== "ceo").length,
    ceoPricedCount: priced.filter((b) => b.kind === "ceo").length,
  };
}

async function fetchRecentCongressBuys(
  cutoff: string,
  chamber?: Chamber,
): Promise<BuyRow[]> {
  const supabase = createBrowserSupabase();
  const buys: BuyRow[] = [];
  const todayIso = new Date().toISOString().slice(0, 10);
  let from = 0;

  while (buys.length < MAX_CONGRESS_BUYS) {
    const end = Math.min(from + PAGE - 1, MAX_CONGRESS_BUYS - 1);
    let query = supabase
      .from("congress_trades")
      .select(
        "member, member_slug, chamber, ticker, transaction_date, disclosure_date, is_listed_equity",
      )
      .eq("transaction_type", "purchase")
      .eq("is_listed_equity", true)
      .gte("transaction_date", cutoff)
      .not("ticker", "is", null)
      .order("transaction_date", { ascending: false })
      .range(from, end);
    if (chamber === "house" || chamber === "senate") {
      query = query.eq("chamber", chamber);
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (buys.length >= MAX_CONGRESS_BUYS) break;
      const ticker = normalizeTicker(row.ticker as string | null);
      const name = String(row.member ?? "").trim();
      const slug = (row.member_slug as string | null)?.trim() || null;
      const rowChamber = row.chamber as Chamber | null;
      const tx = (row.transaction_date as string | null)?.slice(0, 10);
      if (
        !ticker ||
        !name ||
        !tx ||
        !isValidTxDate(tx, todayIso) ||
        (rowChamber !== "house" && rowChamber !== "senate")
      ) {
        continue;
      }
      if (tx < cutoff) continue;
      if (chamber && rowChamber !== chamber) continue;
      buys.push({
        key: `congress:${slug ?? name.toLowerCase()}`,
        name,
        kind: rowChamber,
        memberSlug: slug,
        ticker,
        transactionDate: tx,
      });
    }

    if (rows.length < end - from + 1) break;
    from += PAGE;
  }

  return dedupeSameDayBuys(buys);
}

async function fetchRecentCeoBuys(cutoff: string): Promise<BuyRow[]> {
  const supabase = createBrowserSupabase();
  const todayIso = new Date().toISOString().slice(0, 10);

  async function scan(fromDate: string): Promise<BuyRow[]> {
    const buys: BuyRow[] = [];
    let from = 0;
    // Prefer transaction_code=P so sales-heavy Form 4 dumps do not exhaust the
    // fetch cap before purchases are seen. Still verify via raw_source.
    while (buys.length < MAX_CEO_BUYS && from < CEO_FETCH_CAP) {
      const end = Math.min(from + PAGE - 1, CEO_FETCH_CAP - 1);
      const { data, error } = await supabase
        .from("ceo_stock_purchases")
        .select(
          "ceo_name, ticker, transaction_date, transaction_code, raw_source",
        )
        .eq("transaction_code", "P")
        .gte("transaction_date", fromDate)
        .not("ticker", "is", null)
        .order("transaction_date", { ascending: false })
        .range(from, end);

      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        if (buys.length >= MAX_CEO_BUYS) break;
        if (
          resolveCeoTransactionCode({
            transaction_code: row.transaction_code as string | null,
            raw_source: row.raw_source as Record<string, unknown> | null,
          }) !== "P"
        ) {
          continue;
        }
        const ticker = normalizeTicker(row.ticker as string | null);
        const name = String(row.ceo_name ?? "").trim();
        const tx = (row.transaction_date as string | null)?.slice(0, 10);
        if (!ticker || !name || !tx || !isValidTxDate(tx, todayIso)) continue;
        if (tx < fromDate) continue;
        buys.push({
          key: `ceo:${name.toLowerCase()}`,
          name,
          kind: "ceo",
          memberSlug: null,
          ticker,
          transactionDate: tx,
        });
      }

      if (rows.length < end - from + 1) break;
      from += PAGE;
    }
    return dedupeSameDayBuys(buys);
  }

  let buys = await scan(cutoff);
  if (buys.length > 0) return buys;

  // Form 4 bulk ZIPs lag — fall back to the latest available transaction window.
  const latest = await supabase
    .from("ceo_stock_purchases")
    .select("transaction_date")
    .eq("transaction_code", "P")
    .not("transaction_date", "is", null)
    .order("transaction_date", { ascending: false })
    .limit(1);
  const maxDate = (latest.data?.[0]?.transaction_date as string | null)?.slice(
    0,
    10,
  );
  if (!maxDate) return [];

  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const cutoffUtc = Date.parse(`${cutoff}T00:00:00Z`);
  const windowDays = Math.max(
    30,
    Math.round((todayUtc - cutoffUtc) / (24 * 60 * 60 * 1000)),
  );
  const anchor = new Date(`${maxDate}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - windowDays);
  const fallbackCutoff = anchor.toISOString().slice(0, 10);
  return scan(fallbackCutoff < "2026-01-01" ? "2026-01-01" : fallbackCutoff);
}

async function loadPriceMaps(
  buys: BuyRow[],
): Promise<{
  entryClose: Map<string, number>;
  latestClose: Map<string, number>;
  latestCloseDate: Map<string, string>;
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
  const latestCloseDate = new Map<string, string>();
  for (const [ticker, list] of series) {
    if (list.length === 0) continue;
    const last = list[list.length - 1]!;
    latestClose.set(ticker, last.close);
    latestCloseDate.set(ticker, last.date);
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
      // Nearest available session on/after tx; else nearest prior session.
      let found: number | null = null;
      for (const bar of list) {
        if (bar.date >= tx) {
          found = bar.close;
          break;
        }
      }
      if (found == null) {
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i]!.date <= tx) {
            found = list[i]!.close;
            break;
          }
        }
      }
      if (found != null) entryClose.set(`${ticker}|${tx}`, found);
    }
  }

  return { entryClose, latestClose, latestCloseDate };
}

export type TopPerformerOptions = {
  /** Limit congress buys to one chamber. */
  chamber?: Chamber;
  /** Include Form 4 officer buys in the ranking (default true). */
  includeCeo?: boolean;
  /** Include congress buys (default true). Set false for Insiders-only. */
  includeCongress?: boolean;
};

export async function fetchTopPerformers(
  period: PerformerPeriod,
  limit = 50,
  options?: TopPerformerOptions,
): Promise<{
  rows: TopPerformer[];
  topBuys: TopPerformingBuy[];
  portfolio: PortfolioGrowth | null;
  error: string | null;
}> {
  if (!hasPublicSupabaseConfig()) {
    return { rows: [], topBuys: [], portfolio: null, error: null };
  }

  try {
    const cutoff = performerCutoffDate(period);
    const includeCeo = options?.includeCeo !== false;
    const includeCongress = options?.includeCongress !== false;
    const [congress, ceos] = await Promise.all([
      includeCongress
        ? fetchRecentCongressBuys(cutoff, options?.chamber)
        : Promise.resolve([] as BuyRow[]),
      includeCeo ? fetchRecentCeoBuys(cutoff) : Promise.resolve([] as BuyRow[]),
    ]);
    const buys = dedupeSameDayBuys([...congress, ...ceos]);
    if (buys.length === 0) {
      return { rows: [], topBuys: [], portfolio: null, error: null };
    }

    const { entryClose, latestClose, latestCloseDate } =
      await loadPriceMaps(buys);
    return {
      rows: rankPortfolioPeople(buys, entryClose, latestClose, latestCloseDate),
      topBuys: rankTopPerformingBuys(
        buys,
        entryClose,
        latestClose,
        latestCloseDate,
        limit,
      ),
      portfolio: computePortfolioGrowth(
        buys,
        entryClose,
        latestClose,
        latestCloseDate,
      ),
      error: null,
    };
  } catch (err) {
    return {
      rows: [],
      topBuys: [],
      portfolio: null,
      error:
        err instanceof Error ? err.message : "Failed to load top performers",
    };
  }
}


export type MemberBuyPerformance = {
  id: string;
  ticker: string;
  asset: string | null;
  transactionDate: string;
  disclosureDate: string | null;
  amountLow: number | null;
  amountHigh: number | null;
  amountRange: string | null;
  returnPct: number | null;
  entryClose: number | null;
  latestClose: number | null;
};

export type MemberBuysPayload = {
  slug: string;
  name: string;
  chamber: Chamber | null;
  state: string | null;
  period: PerformerPeriod;
  buys: MemberBuyPerformance[];
};

/** Purchases for one member in a period, each with % return since buy. */
export async function fetchMemberBuysWithReturns(
  slug: string,
  period: PerformerPeriod,
): Promise<MemberBuysPayload | null> {
  if (!hasPublicSupabaseConfig()) return null;
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  const cutoff = performerCutoffDate(period);
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("congress_trades")
    .select(
      "id, member, member_slug, chamber, state, ticker, asset, transaction_date, disclosure_date, amount_low, amount_high, amount_range, is_listed_equity",
    )
    .eq("member_slug", normalized)
    .eq("transaction_type", "purchase")
    .eq("is_listed_equity", true)
    .gte("transaction_date", cutoff)
    .not("ticker", "is", null)
    .order("transaction_date", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      slug: normalized,
      name: normalized,
      chamber: null,
      state: null,
      period,
      buys: [],
    };
  }

  const buyRows: BuyRow[] = [];
  const seenOccasions = new Set<string>();
  const detail: Array<{
    id: string;
    ticker: string;
    asset: string | null;
    transactionDate: string;
    disclosureDate: string | null;
    amountLow: number | null;
    amountHigh: number | null;
    amountRange: string | null;
  }> = [];

  for (const row of rows) {
    const ticker = normalizeTicker(row.ticker as string | null);
    const tx = (row.transaction_date as string | null)?.slice(0, 10);
    if (!ticker || !tx) continue;
    const occasionKey = `${normalized}|${ticker}|${tx}`;
    if (seenOccasions.has(occasionKey)) continue;
    seenOccasions.add(occasionKey);
    const id = String(row.id ?? occasionKey);
    buyRows.push({
      key: id,
      name: String(row.member ?? normalized),
      kind: (row.chamber as Chamber) === "senate" ? "senate" : "house",
      memberSlug: normalized,
      ticker,
      transactionDate: tx,
    });
    detail.push({
      id,
      ticker,
      asset: (row.asset as string | null) ?? null,
      transactionDate: tx,
      disclosureDate: (row.disclosure_date as string | null)?.slice(0, 10) ?? null,
      amountLow:
        row.amount_low == null ? null : Number(row.amount_low),
      amountHigh:
        row.amount_high == null ? null : Number(row.amount_high),
      amountRange: (row.amount_range as string | null) ?? null,
    });
  }

  const { entryClose, latestClose } = await loadPriceMaps(buyRows);
  const buys: MemberBuyPerformance[] = detail.map((d) => {
    const entry = entryClose.get(`${d.ticker}|${d.transactionDate}`) ?? null;
    const latest = latestClose.get(d.ticker) ?? null;
    let returnPct: number | null = null;
    if (
      entry != null &&
      latest != null &&
      Number.isFinite(entry) &&
      Number.isFinite(latest) &&
      entry > 0
    ) {
      returnPct = ((latest - entry) / entry) * 100;
    }
    return {
      ...d,
      returnPct,
      entryClose: entry,
      latestClose: latest,
    };
  });

  // Best return first, then most recent.
  buys.sort((a, b) => {
    if (a.returnPct != null && b.returnPct != null && a.returnPct !== b.returnPct) {
      return b.returnPct - a.returnPct;
    }
    if (a.returnPct != null && b.returnPct == null) return -1;
    if (a.returnPct == null && b.returnPct != null) return 1;
    return b.transactionDate.localeCompare(a.transactionDate);
  });

  const first = rows[0]!;
  return {
    slug: normalized,
    name: String(first.member ?? normalized),
    chamber:
      first.chamber === "house" || first.chamber === "senate"
        ? first.chamber
        : null,
    state: (first.state as string | null) ?? null,
    period,
    buys,
  };
}

export type OfficerBuysPayload = {
  name: string;
  officerTitle: string | null;
  period: PerformerPeriod;
  buys: MemberBuyPerformance[];
};

/** Form 4 purchases for one officer (matched by exact ceo_name) with % return. */
export async function fetchOfficerBuysWithReturns(
  name: string,
  period: PerformerPeriod,
): Promise<OfficerBuysPayload | null> {
  if (!hasPublicSupabaseConfig()) return null;
  const person = name.trim();
  if (!person) return null;

  const cutoff = performerCutoffDate(period);
  const supabase = createBrowserSupabase();

  async function loadPurchases(fromDate: string) {
    const { data, error } = await supabase
      .from("ceo_stock_purchases")
      .select(
        "id, ceo_name, officer_title, ticker, issuer_name, security_title, transaction_date, filing_date, shares_purchased, price_per_share, transaction_code, raw_source",
      )
      .ilike("ceo_name", person)
      .gte("transaction_date", fromDate)
      .not("ticker", "is", null)
      .order("transaction_date", { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);
    return (data ?? []).filter(
      (row) =>
        resolveCeoTransactionCode({
          transaction_code: row.transaction_code as string | null,
          raw_source: row.raw_source as Record<string, unknown> | null,
        }) === "P",
    );
  }

  let rows = await loadPurchases(cutoff);
  if (rows.length === 0) {
    const latest = await supabase
      .from("ceo_stock_purchases")
      .select("transaction_date")
      .ilike("ceo_name", person)
      .not("transaction_date", "is", null)
      .order("transaction_date", { ascending: false })
      .limit(1);
    const maxDate = (
      latest.data?.[0]?.transaction_date as string | null
    )?.slice(0, 10);
    if (maxDate) {
      const today = new Date();
      const todayUtc = Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
      );
      const cutoffUtc = Date.parse(`${cutoff}T00:00:00Z`);
      const windowDays = Math.max(
        30,
        Math.round((todayUtc - cutoffUtc) / (24 * 60 * 60 * 1000)),
      );
      const anchor = new Date(`${maxDate}T00:00:00Z`);
      anchor.setUTCDate(anchor.getUTCDate() - windowDays);
      let fallbackCutoff = anchor.toISOString().slice(0, 10);
      if (fallbackCutoff < "2026-01-01") fallbackCutoff = "2026-01-01";
      rows = await loadPurchases(fallbackCutoff);
    }
  }

  if (rows.length === 0) {
    return {
      name: person,
      officerTitle: null,
      period,
      buys: [],
    };
  }

  const buyRows: BuyRow[] = [];
  const detail: Array<{
    id: string;
    ticker: string;
    asset: string | null;
    transactionDate: string;
    disclosureDate: string | null;
    amountLow: number | null;
    amountHigh: number | null;
    amountRange: string | null;
  }> = [];

  for (const row of rows) {
    const ticker = normalizeTicker(row.ticker as string | null);
    const tx = (row.transaction_date as string | null)?.slice(0, 10);
    if (!ticker || !tx) continue;
    const id = String(row.id ?? `${ticker}|${tx}`);
    const shares =
      row.shares_purchased == null ? null : Number(row.shares_purchased);
    const price =
      row.price_per_share == null ? null : Number(row.price_per_share);
    let amountRange: string | null = null;
    if (
      shares != null &&
      price != null &&
      Number.isFinite(shares) &&
      Number.isFinite(price)
    ) {
      amountRange = `${shares.toLocaleString("en-US")} @ ${price.toFixed(2)}`;
    } else if (shares != null && Number.isFinite(shares)) {
      amountRange = `${shares.toLocaleString("en-US")} shares`;
    }

    buyRows.push({
      key: id,
      name: person,
      kind: "ceo",
      memberSlug: null,
      ticker,
      transactionDate: tx,
    });
    detail.push({
      id,
      ticker,
      asset:
        (row.issuer_name as string | null) ??
        (row.security_title as string | null) ??
        null,
      transactionDate: tx,
      disclosureDate: (row.filing_date as string | null)?.slice(0, 10) ?? null,
      amountLow: null,
      amountHigh: null,
      amountRange,
    });
  }

  const { entryClose, latestClose } = await loadPriceMaps(buyRows);
  const buys: MemberBuyPerformance[] = detail.map((d) => {
    const entry = entryClose.get(`${d.ticker}|${d.transactionDate}`) ?? null;
    const latest = latestClose.get(d.ticker) ?? null;
    let returnPct: number | null = null;
    if (
      entry != null &&
      latest != null &&
      Number.isFinite(entry) &&
      Number.isFinite(latest) &&
      entry > 0
    ) {
      returnPct = ((latest - entry) / entry) * 100;
    }
    return {
      ...d,
      returnPct,
      entryClose: entry,
      latestClose: latest,
    };
  });

  buys.sort((a, b) => {
    if (
      a.returnPct != null &&
      b.returnPct != null &&
      a.returnPct !== b.returnPct
    ) {
      return b.returnPct - a.returnPct;
    }
    if (a.returnPct != null && b.returnPct == null) return -1;
    if (a.returnPct == null && b.returnPct != null) return 1;
    return b.transactionDate.localeCompare(a.transactionDate);
  });

  const title =
    (rows.find((r) => (r.officer_title as string | null)?.trim())
      ?.officer_title as string | null) ?? null;

  return {
    name: String(rows[0]?.ceo_name ?? person),
    officerTitle: title,
    period,
    buys,
  };
}
