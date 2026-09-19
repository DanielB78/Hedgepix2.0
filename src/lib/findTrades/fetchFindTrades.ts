/**
 * Load universal House + Senate + Insider trades with derived metrics
 * for the Find Trades page.
 */

import { createBrowserSupabase, hasPublicSupabaseConfig } from "@/lib/supabase";
import { PUBLIC_TRADE_COLUMNS } from "@/lib/trades";
import { resolveCeoTransactionCode } from "@/lib/ceoAggregate";
import {
  computeTradeSectorOverlaps,
  fetchMemberIndustryLabels,
  memberSectorsRecord,
} from "@/lib/memberSectors";
import { getTickerIndustryLabel } from "@/lib/tickerIndustry";
import { parentsForNicheLabel } from "@/lib/generalSectors";
import { tickerIndustryLabelsForFilter } from "@/lib/advancedTradeFilters";
import type { Chamber, CeoStockPurchaseRow, CongressTrade } from "@/lib/types";
import type { ChartTrade } from "@/lib/chartTrades";
import { asCongressChartTrade, ceoRowToChartTrade } from "@/lib/chartTrades";
import {
  computeDerivedMetrics,
  initEmptyMetrics,
  sideFromType,
  sourceFromChamber,
  type PriceSeries,
} from "./derivedMetrics";
import type { FindTradeRow, OverlapMatchType } from "./types";

const CEO_COLUMNS =
  "id, source_id, accession_number, ceo_name, officer_title, issuer_name, ticker, security_title, transaction_date, filing_date, shares_purchased, price_per_share, shares_owned_after, ownership_type, filing_url, form_type, quarter, created_at, raw_source, transaction_code";

const TRADE_LIMIT = 5000;
const LOOKBACK_DAYS = 180;
const TICKER_CHUNK = 40;
const BAR_PAGE = 1000;

export type FindTradesPayload = {
  rows: FindTradeRow[];
  error: string | null;
  lookbackDays: number;
  loadedAt: string;
};

function cutoffDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchCongress(
  chamber: Chamber,
  since: string,
): Promise<CongressTrade[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("congress_trades")
    .select(PUBLIC_TRADE_COLUMNS)
    .eq("is_listed_equity", true)
    .eq("chamber", chamber)
    .gte("disclosure_date", since)
    .order("disclosure_date", { ascending: false, nullsFirst: false })
    .order("transaction_date", { ascending: false, nullsFirst: false })
    .limit(TRADE_LIMIT);

  if (error) throw new Error(error.message);
  return ((data as unknown as CongressTrade[]) ?? []);
}

async function fetchInsiders(since: string): Promise<CeoStockPurchaseRow[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("ceo_stock_purchases")
    .select(CEO_COLUMNS)
    .gte("filing_date", since)
    .order("filing_date", { ascending: false, nullsFirst: false })
    .order("transaction_date", { ascending: false, nullsFirst: false })
    .limit(TRADE_LIMIT);

  if (error) throw new Error(error.message);
  return (data as CeoStockPurchaseRow[] | null) ?? [];
}

async function loadPriceSeries(
  tickers: string[],
  minDate: string,
): Promise<{
  seriesByTicker: Map<string, PriceSeries>;
  latestCloseByTicker: Map<string, number>;
}> {
  const supabase = createBrowserSupabase();
  const seriesByTicker = new Map<string, PriceSeries>();
  const latestCloseByTicker = new Map<string, number>();

  // Extend lookback for "before" windows (up to 180d)
  const barMin = (() => {
    const d = new Date(`${minDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 200);
    return d.toISOString().slice(0, 10);
  })();

  for (let i = 0; i < tickers.length; i += TICKER_CHUNK) {
    const chunk = tickers.slice(i, i + TICKER_CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("stock_price_bars")
        .select("ticker, bar_date, close")
        .in("ticker", chunk)
        .gte("bar_date", barMin)
        .not("close", "is", null)
        .order("bar_date", { ascending: true })
        .range(from, from + BAR_PAGE - 1);

      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const ticker = String(row.ticker ?? "")
          .trim()
          .toUpperCase();
        const date = String(row.bar_date ?? "").slice(0, 10);
        const close = Number(row.close);
        if (!ticker || !date || !Number.isFinite(close)) continue;
        let list = seriesByTicker.get(ticker);
        if (!list) {
          list = [];
          seriesByTicker.set(ticker, list);
        }
        list.push({ date, close });
      }

      if (rows.length < BAR_PAGE) break;
      from += BAR_PAGE;
    }
  }

  for (const [ticker, series] of seriesByTicker) {
    if (series.length) {
      latestCloseByTicker.set(ticker, series[series.length - 1]!.close);
    }
  }

  return { seriesByTicker, latestCloseByTicker };
}

function personKeyFor(
  source: "house" | "senate" | "insider",
  name: string | null,
  slug: string | null,
): string {
  if (source === "insider") {
    return `insider:${(name ?? "").trim().toLowerCase()}`;
  }
  const s = (slug ?? "").trim().toLowerCase();
  if (s) return `congress:${s}`;
  return `congress:${(name ?? "").trim().toLowerCase()}`;
}

function buildFromCongress(
  trade: CongressTrade,
  memberLabels: string[],
  overlap: {
    has_sector_overlap: boolean;
    match_type: "direct" | "embedding" | null;
    similarity: number | null;
    member_label: string | null;
    ticker_label: string | null;
  } | null,
): FindTradeRow {
  const source = sourceFromChamber(trade.chamber, false);
  const tickerLabels = tickerIndustryLabelsForFilter(trade.ticker);
  const generalParents = new Set<string>();
  for (const label of tickerLabels) {
    for (const p of parentsForNicheLabel(label)) generalParents.add(p);
  }
  const memberGenerals = new Set<string>();
  for (const label of memberLabels) {
    for (const p of parentsForNicheLabel(label)) memberGenerals.add(p);
  }

  const industry = getTickerIndustryLabel(trade.ticker);
  let overlapMatchType: OverlapMatchType | null = null;
  if (overlap?.match_type === "direct") overlapMatchType = "direct";
  if (overlap?.match_type === "embedding") overlapMatchType = "semantic";

  return initEmptyMetrics({
    id: trade.id,
    source,
    person: trade.member,
    personKey: personKeyFor(source, trade.member, trade.member_slug),
    memberSlug: trade.member_slug,
    chamber: trade.chamber,
    state: trade.state,
    officerTitle: null,
    ticker: trade.ticker?.trim().toUpperCase() ?? null,
    company: industry?.company ?? trade.asset,
    transactionType: sideFromType(trade.transaction_type),
    transactionDate: trade.transaction_date?.slice(0, 10) ?? null,
    disclosureDate: trade.disclosure_date?.slice(0, 10) ?? null,
    disclosedMin: trade.amount_low,
    disclosedMax: trade.amount_high,
    amountRange: trade.amount_range,
    exactValue: null,
    exactShares: null,
    exactPrice: trade.est_price,
    tickerGeneralSector:
      generalParents.size > 0 ? [...generalParents][0]! : null,
    tickerIndustryLabels: tickerLabels,
    memberIndustryLabels: memberLabels,
    memberGeneralSectors: [...memberGenerals],
    hasSectorOverlap: overlap ? overlap.has_sector_overlap : false,
    overlapMatchType,
    overlapSimilarity: overlap?.similarity ?? null,
    overlapMemberLabel: overlap?.member_label ?? null,
    overlapTickerLabel: overlap?.ticker_label ?? null,
    filingUrl: trade.filing_portal,
  });
}

function buildFromInsider(row: CeoStockPurchaseRow): FindTradeRow | null {
  const code = resolveCeoTransactionCode(row);
  const chart = ceoRowToChartTrade(row);
  if (!chart) return null;

  const shares =
    row.shares_purchased != null && Number.isFinite(row.shares_purchased)
      ? row.shares_purchased
      : null;
  const price =
    row.price_per_share != null && Number.isFinite(row.price_per_share)
      ? row.price_per_share
      : null;
  const exactValue =
    shares != null && price != null ? shares * price : null;

  const tickerLabels = tickerIndustryLabelsForFilter(chart.ticker);
  const generalParents = new Set<string>();
  for (const label of tickerLabels) {
    for (const p of parentsForNicheLabel(label)) generalParents.add(p);
  }
  const industry = getTickerIndustryLabel(chart.ticker);

  // Ensure sale side when Form 4 is S
  const side =
    code === "S" ? ("sale" as const) : sideFromType(chart.transaction_type);

  return initEmptyMetrics({
    id: chart.id,
    source: "insider",
    person: row.ceo_name,
    personKey: personKeyFor("insider", row.ceo_name, null),
    memberSlug: null,
    chamber: null,
    state: null,
    officerTitle: row.officer_title?.trim() || null,
    ticker: chart.ticker,
    company: industry?.company ?? row.issuer_name ?? row.security_title,
    transactionType: side,
    transactionDate: chart.transaction_date?.slice(0, 10) ?? null,
    disclosureDate: chart.disclosure_date?.slice(0, 10) ?? null,
    disclosedMin: null,
    disclosedMax: null,
    amountRange: chart.amount_range,
    exactValue,
    exactShares: shares,
    exactPrice: price,
    tickerGeneralSector:
      generalParents.size > 0 ? [...generalParents][0]! : null,
    tickerIndustryLabels: tickerLabels,
    memberIndustryLabels: [],
    memberGeneralSectors: [],
    hasSectorOverlap: null,
    overlapMatchType: null,
    overlapSimilarity: null,
    overlapMemberLabel: null,
    overlapTickerLabel: null,
    filingUrl: row.filing_url,
  });
}

export async function fetchFindTradesPayload(
  lookbackDays = LOOKBACK_DAYS,
): Promise<FindTradesPayload> {
  if (!hasPublicSupabaseConfig()) {
    return {
      rows: [],
      error: "Supabase is not configured",
      lookbackDays,
      loadedAt: new Date().toISOString(),
    };
  }

  try {
    const since = cutoffDate(lookbackDays);
    const [house, senate, insiders] = await Promise.all([
      fetchCongress("house", since),
      fetchCongress("senate", since),
      fetchInsiders(since),
    ]);

    const congressChart: ChartTrade[] = [
      ...house.map(asCongressChartTrade),
      ...senate.map(asCongressChartTrade),
    ];

    const slugs = [
      ...new Set(
        congressChart
          .map((t) => t.member_slug)
          .filter((s): s is string => Boolean(s?.trim())),
      ),
    ];
    const memberLabelMap = await fetchMemberIndustryLabels(slugs);
    const memberSectors = memberSectorsRecord(memberLabelMap);
    const overlaps = await computeTradeSectorOverlaps(
      congressChart,
      memberLabelMap,
    );

    const rows: FindTradeRow[] = [];

    for (const t of house) {
      const slug = t.member_slug?.trim().toLowerCase() ?? "";
      const labels = slug ? memberSectors[slug] ?? [] : [];
      rows.push(buildFromCongress(t, labels, overlaps[t.id] ?? null));
    }
    for (const t of senate) {
      const slug = t.member_slug?.trim().toLowerCase() ?? "";
      const labels = slug ? memberSectors[slug] ?? [] : [];
      rows.push(buildFromCongress(t, labels, overlaps[t.id] ?? null));
    }
    for (const row of insiders) {
      const built = buildFromInsider(row);
      if (built) rows.push(built);
    }

    const tickers = [
      ...new Set(
        rows
          .map((r) => r.ticker)
          .filter((t): t is string => Boolean(t)),
      ),
    ];
    const minTx =
      rows.reduce((min, r) => {
        const d = r.transactionDate;
        if (!d) return min;
        return !min || d < min ? d : min;
      }, "" as string) || since;

    const { seriesByTicker, latestCloseByTicker } = await loadPriceSeries(
      tickers,
      minTx,
    );

    computeDerivedMetrics(rows, seriesByTicker, latestCloseByTicker);

    // Newest first for the table
    rows.sort((a, b) => {
      const da = a.disclosureDate ?? a.transactionDate ?? "";
      const db = b.disclosureDate ?? b.transactionDate ?? "";
      if (da !== db) return db.localeCompare(da);
      return (b.transactionDate ?? "").localeCompare(a.transactionDate ?? "");
    });

    return {
      rows,
      error: null,
      lookbackDays,
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : "Failed to load trades",
      lookbackDays,
      loadedAt: new Date().toISOString(),
    };
  }
}
