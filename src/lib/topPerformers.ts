import type { Chamber } from "./types";
import { resolveCeoTransactionCode } from "./ceoAggregate";
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

export type PortfolioGrowth = {
  /** Equal-weighted average return across all priced buys in the period. */
  avgReturnPct: number;
  pricedBuyCount: number;
  buyCount: number;
  congressPricedCount: number;
  ceoPricedCount: number;
};

type BuyRow = {
  key: string;
  name: string;
  kind: "ceo" | Chamber;
  memberSlug: string | null;
  ticker: string;
  transactionDate: string;
};

export const PERFORMER_PERIODS: PerformerPeriod[] = ["1m", "3m", "6m", "2026"];

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
  // Default period is 1m (aligns with House/Senate/Trending activity windows).
  if (period !== "1m") params.set("perf", period);
  const qs = params.toString();
  return qs ? `/app?${qs}` : "/app";
}

function normalizeTicker(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toUpperCase();
  return t || null;
}

function buyReturns(
  buys: BuyRow[],
  entryClose: Map<string, number>,
  latestClose: Map<string, number>,
): Array<BuyRow & { returnPct: number }> {
  const out: Array<BuyRow & { returnPct: number }> = [];
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

/** Equal-weighted portfolio return across all priced buys. */
export function computePortfolioGrowth(
  buys: BuyRow[],
  entryClose: Map<string, number>,
  latestClose: Map<string, number>,
): PortfolioGrowth | null {
  const priced = buyReturns(buys, entryClose, latestClose);
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
      .gte("disclosure_date", cutoff)
      .not("ticker", "is", null)
      .order("disclosure_date", { ascending: false })
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
        (rowChamber !== "house" && rowChamber !== "senate")
      ) {
        continue;
      }
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

  return buys;
}

async function fetchRecentCeoBuys(cutoff: string): Promise<BuyRow[]> {
  const supabase = createBrowserSupabase();
  const buys: BuyRow[] = [];
  let from = 0;

  // Do not trust transaction_code alone — filter with raw_source.trans_code.
  while (buys.length < MAX_CEO_BUYS && from < CEO_FETCH_CAP) {
    const end = Math.min(from + PAGE - 1, CEO_FETCH_CAP - 1);
    const { data, error } = await supabase
      .from("ceo_stock_purchases")
      .select("ceo_name, ticker, transaction_date, transaction_code, raw_source")
      .gte("transaction_date", cutoff)
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

    if (rows.length < end - from + 1) break;
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
  limit = 10,
  options?: TopPerformerOptions,
): Promise<{
  rows: TopPerformer[];
  portfolio: PortfolioGrowth | null;
  error: string | null;
}> {
  if (!hasPublicSupabaseConfig()) {
    return { rows: [], portfolio: null, error: null };
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
    const buys = [...congress, ...ceos];
    if (buys.length === 0) {
      return { rows: [], portfolio: null, error: null };
    }

    const { entryClose, latestClose } = await loadPriceMaps(buys);
    return {
      rows: rankBuyPerformers(buys, entryClose, latestClose, limit),
      portfolio: computePortfolioGrowth(buys, entryClose, latestClose),
      error: null,
    };
  } catch (err) {
    return {
      rows: [],
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
    .gte("disclosure_date", cutoff)
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
  const { data, error } = await supabase
    .from("ceo_stock_purchases")
    .select(
      "id, ceo_name, officer_title, ticker, issuer_name, security_title, transaction_date, filing_date, shares_purchased, price_per_share, transaction_code, raw_source",
    )
    .ilike("ceo_name", person)
    .gte("transaction_date", cutoff)
    .not("ticker", "is", null)
    .order("transaction_date", { ascending: false })
    .limit(400);

  if (error) throw new Error(error.message);
  const rows = (data ?? []).filter(
    (row) =>
      resolveCeoTransactionCode({
        transaction_code: row.transaction_code as string | null,
        raw_source: row.raw_source as Record<string, unknown> | null,
      }) === "P",
  );

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
    if (shares != null && price != null && Number.isFinite(shares) && Number.isFinite(price)) {
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
    if (a.returnPct != null && b.returnPct != null && a.returnPct !== b.returnPct) {
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
