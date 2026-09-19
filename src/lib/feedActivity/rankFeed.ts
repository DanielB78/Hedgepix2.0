/**
 * Aggregate trades into ticker-level Feed rankings.
 * Transparent capped score from FEED_WEIGHTS — no ML.
 */

import { normalizeTransactionType } from "@/lib/advancedTradeFilters";
import { parentsForNicheLabel } from "@/lib/generalSectors";
import { tickerIndustryLabelsForFilter } from "@/lib/advancedTradeFilters";
import { getTickerIndustryLabel } from "@/lib/tickerIndustry";
import type { PriceSeries } from "@/lib/findTrades/derivedMetrics";
import {
  marketBenchmarkReturn,
  sectorBenchmarkReturn,
} from "./benchmarks";
import {
  currentTradingDayReturn,
  tradingDayReturnBefore,
  priceAtDate,
} from "./priceTrend";
import {
  FEED_ACTIVITY_BASELINE_FLOOR,
  FEED_CAPS,
  FEED_MIN_BUY_OCCASIONS,
  FEED_TREND_TRADING_DAYS,
  FEED_UNUSUAL_SIZE_RATIO,
  FEED_WEIGHTS,
  capCount,
  recencyWeight,
} from "./weights";
import type {
  FeedBuyOccasion,
  FeedBuyerStreak,
  FeedFilters,
  FeedPositionKind,
  FeedScoreBreakdown,
  FeedScoreComponents,
  FeedSourceFilter,
  FeedTickerRow,
  FeedTimeframe,
  FeedTradeSource,
} from "./types";

export type FeedRawTrade = {
  id: string;
  source: FeedTradeSource;
  person: string | null;
  personKey: string;
  memberSlug: string | null;
  ticker: string | null;
  company: string | null;
  transactionType: string | null;
  transactionDate: string | null;
  disclosureDate: string | null;
  amountRange: string | null;
  disclosedMin: number | null;
  disclosedMax: number | null;
  exactValue: number | null;
  officerTitle: string | null;
  filingUrl: string | null;
  hasSectorOverlap: boolean | null;
  overlapMatchType: "direct" | "embedding" | "semantic" | null;
  overlapSimilarity: number | null;
  overlapMemberLabel: string | null;
  overlapTickerLabel: string | null;
};

export function timeframeDays(tf: FeedTimeframe): number {
  if (tf === "6m") return 180;
  if (tf === "1y") return 365;
  return 90;
}

export function parseFeedTimeframe(
  value: string | string[] | undefined,
  fallback: FeedTimeframe = "3m",
): FeedTimeframe {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "6m" || raw === "6mo" || raw === "6") return "6m";
  if (raw === "1y" || raw === "12m" || raw === "year") return "1y";
  if (raw === "3m" || raw === "3mo" || raw === "3") return "3m";
  return fallback;
}

export function cutoffDateFromDays(days: number, now = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
      (24 * 60 * 60 * 1000),
  );
}

function occasionKey(
  personKey: string,
  ticker: string,
  transactionDate: string,
): string {
  return `${personKey}|${ticker}|${transactionDate}`;
}

function sourceMatches(
  source: FeedTradeSource,
  filter: FeedSourceFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "congress") return source === "house" || source === "senate";
  if (filter === "house") return source === "house";
  if (filter === "senate") return source === "senate";
  if (filter === "insiders") return source === "insider";
  return true;
}

function matchesNiche(
  industryLabels: string[],
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  if (industryLabels.length === 0) return false;
  const set = new Set(selected.map((s) => s.trim().toLowerCase()));
  return industryLabels.some((l) => set.has(l.trim().toLowerCase()));
}

/** Exact value preferred; otherwise disclosed range midpoint (estimate only). */
export function purchaseSizeEstimate(trade: {
  exactValue: number | null;
  disclosedMin: number | null;
  disclosedMax: number | null;
}): { value: number | null; approximate: boolean } {
  if (trade.exactValue != null && Number.isFinite(trade.exactValue) && trade.exactValue > 0) {
    return { value: trade.exactValue, approximate: false };
  }
  const lo = trade.disclosedMin;
  const hi = trade.disclosedMax;
  if (lo != null && hi != null && Number.isFinite(lo) && Number.isFinite(hi)) {
    return { value: (lo + hi) / 2, approximate: true };
  }
  if (lo != null && Number.isFinite(lo) && lo > 0) {
    return { value: lo, approximate: true };
  }
  if (hi != null && Number.isFinite(hi) && hi > 0) {
    return { value: hi, approximate: true };
  }
  return { value: null, approximate: false };
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

type ChronoTrade = FeedRawTrade & {
  txDate: string;
  discDate: string;
  tickerNorm: string;
};

export function computeBuyStreaks(
  chrono: Array<{ txDate: string; isBuy: boolean; occasionKey: string }>,
): { maxStreak: number; currentStreak: number; occasionOrder: string[] } {
  const seen = new Set<string>();
  const ordered: Array<{ key: string; isBuy: boolean }> = [];
  for (const row of chrono) {
    if (seen.has(row.occasionKey)) continue;
    seen.add(row.occasionKey);
    ordered.push({ key: row.occasionKey, isBuy: row.isBuy });
  }

  let maxStreak = 0;
  let run = 0;
  for (const row of ordered) {
    if (row.isBuy) {
      run += 1;
      if (run > maxStreak) maxStreak = run;
    } else {
      run = 0;
    }
  }
  let currentStreak = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (!ordered[i]!.isBuy) break;
    currentStreak += 1;
  }

  return {
    maxStreak,
    currentStreak,
    occasionOrder: ordered.filter((o) => o.isBuy).map((o) => o.key),
  };
}

function sourceLabel(s: FeedTradeSource): string {
  if (s === "house") return "House";
  if (s === "senate") return "Senate";
  return "Insider";
}

export function buildWhyNoteworthy(c: FeedScoreComponents): string[] {
  const lines: string[] = [];
  if (c.distinct_buyers > 0) {
    lines.push(`${c.distinct_buyers} distinct buyer${c.distinct_buyers === 1 ? "" : "s"}`);
  }
  if (c.buyers_last_30d > 0) {
    lines.push(
      `${c.buyers_last_30d} buyer${c.buyers_last_30d === 1 ? "" : "s"} in the last 30 days`,
    );
  }
  if (c.repeat_buyers > 0) {
    lines.push(`${c.repeat_buyers} repeat buyer${c.repeat_buyers === 1 ? "" : "s"}`);
  }
  if (c.sector_overlap_buyers > 0) {
    lines.push(
      `${c.sector_overlap_buyers} congressional sector-overlap buyer${c.sector_overlap_buyers === 1 ? "" : "s"}`,
    );
  }
  if (c.downtrend_buys > 0) {
    lines.push(
      `${c.downtrend_buys} buy${c.downtrend_buys === 1 ? "" : "s"} occurred during downtrends`,
    );
  }
  if (c.return_20d != null && c.return_20d < 0) {
    lines.push(`stock is currently ${c.return_20d.toFixed(1)}% over 20D`);
  }
  if (c.relative_sector_return_20d != null && c.relative_sector_return_20d < 0) {
    lines.push(
      `stock underperformed its sector by ${Math.abs(c.relative_sector_return_20d).toFixed(1)}%`,
    );
  } else if (
    c.relative_market_return_20d != null &&
    c.relative_market_return_20d < 0
  ) {
    lines.push(
      `stock underperformed the market by ${Math.abs(c.relative_market_return_20d).toFixed(1)}%`,
    );
  }
  if (c.averaging_down_buyers > 0) {
    lines.push(
      `${c.averaging_down_buyers} buyer${c.averaging_down_buyers === 1 ? "" : "s"} added again at lower prices`,
    );
  }
  if (c.unusually_large_buys > 0) {
    lines.push(
      `${c.unusually_large_buys} purchase${c.unusually_large_buys === 1 ? "" : "s"} unusually large vs that person's history`,
    );
  }
  if (c.activity_ratio != null && c.activity_ratio >= 1.5) {
    lines.push(
      `recent buy activity is ${c.activity_ratio.toFixed(1)}× its historical baseline`,
    );
  }
  if (c.active_source_types.length >= 2) {
    lines.push(`${c.active_source_types.join(" + ")} buying both present`);
  }
  return lines;
}

function computeScore(input: {
  buyOccasions: number;
  distinctBuyers: number;
  repeatBuyers: number;
  maxConsecutiveStreak: number;
  distinctOverlapBuyers: number;
  downtrendBuyCount: number;
  isCurrentDowntrend: boolean;
  buyersLast14d: number;
  buyersLast30d: number;
  unusuallyLargeBuyCount: number;
  averagingDownBuyers: number;
  relativeWeaknessPct: number | null;
  activityRatio: number | null;
  avgRecencyWeight: number;
  extraSourceTypes: number;
}): FeedScoreBreakdown {
  const buyOccasion =
    capCount(input.buyOccasions, FEED_CAPS.buyOccasion) * FEED_WEIGHTS.buyOccasion;
  const distinctBuyer =
    capCount(input.distinctBuyers, FEED_CAPS.distinctBuyer) *
    FEED_WEIGHTS.distinctBuyer;
  const repeatBuyer =
    capCount(input.repeatBuyers, FEED_CAPS.repeatBuyer) * FEED_WEIGHTS.repeatBuyer;
  const consecutiveStreak =
    capCount(Math.max(0, input.maxConsecutiveStreak - 1), FEED_CAPS.consecutiveStreak) *
    FEED_WEIGHTS.consecutiveStreak;
  const overlapBuyer =
    capCount(input.distinctOverlapBuyers, FEED_CAPS.overlapBuyer) *
    FEED_WEIGHTS.overlapBuyer;
  const downtrendBuy =
    capCount(input.downtrendBuyCount, FEED_CAPS.downtrendBuy) *
    FEED_WEIGHTS.downtrendBuy;
  const currentDowntrend = input.isCurrentDowntrend
    ? FEED_WEIGHTS.currentDowntrend
    : 0;
  const buyerCluster =
    capCount(input.buyersLast14d, FEED_CAPS.buyerCluster14d) *
      FEED_WEIGHTS.buyerCluster14d +
    capCount(input.buyersLast30d, FEED_CAPS.buyerCluster30d) *
      FEED_WEIGHTS.buyerCluster30d;
  const unusuallyLargeBuy =
    capCount(input.unusuallyLargeBuyCount, FEED_CAPS.unusuallyLargeBuy) *
    FEED_WEIGHTS.unusuallyLargeBuy;
  const averagingDown =
    capCount(input.averagingDownBuyers, FEED_CAPS.averagingDownBuyer) *
    FEED_WEIGHTS.averagingDownBuyer;

  let relativeWeakness = 0;
  if (input.relativeWeaknessPct != null && input.relativeWeaknessPct < 0) {
    const pts = Math.min(
      Math.abs(input.relativeWeaknessPct),
      FEED_CAPS.relativeWeaknessPct,
    );
    relativeWeakness = pts * FEED_WEIGHTS.relativeWeakness;
  }

  let unusualActivity = 0;
  if (input.activityRatio != null && input.activityRatio > 1) {
    const excess = Math.min(
      input.activityRatio - 1,
      FEED_CAPS.activityRatio - 1,
    );
    unusualActivity = excess * FEED_WEIGHTS.unusualActivity;
  }

  const recency = input.avgRecencyWeight * FEED_WEIGHTS.recency;
  const crossSource =
    capCount(input.extraSourceTypes, FEED_CAPS.crossSourceExtra) *
    FEED_WEIGHTS.crossSource;

  const total =
    buyOccasion +
    distinctBuyer +
    repeatBuyer +
    consecutiveStreak +
    overlapBuyer +
    downtrendBuy +
    currentDowntrend +
    buyerCluster +
    unusuallyLargeBuy +
    averagingDown +
    relativeWeakness +
    unusualActivity +
    recency +
    crossSource;

  return {
    buyOccasion,
    distinctBuyer,
    repeatBuyer,
    consecutiveStreak,
    overlapBuyer,
    downtrendBuy,
    currentDowntrend,
    buyerCluster,
    unusuallyLargeBuy,
    averagingDown,
    relativeWeakness,
    unusualActivity,
    recency,
    crossSource,
    total: Math.round(total * 10) / 10,
  };
}

export function rankFeedTickers(
  trades: FeedRawTrade[],
  seriesByTicker: Map<string, PriceSeries>,
  opts: {
    timeframe: FeedTimeframe;
    filters?: Partial<FeedFilters>;
    now?: Date;
    minBuyOccasions?: number;
  },
): FeedTickerRow[] {
  const filters: FeedFilters = {
    source: opts.filters?.source ?? "all",
    nicheLabels: opts.filters?.nicheLabels ?? [],
    trend: opts.filters?.trend ?? "all",
    overlap: opts.filters?.overlap ?? "all",
    minBuyers: opts.filters?.minBuyers ?? 0,
    minBuys: opts.filters?.minBuys ?? 0,
    minRepeatBuyers: opts.filters?.minRepeatBuyers ?? 0,
    minOverlapBuyers: opts.filters?.minOverlapBuyers ?? 0,
    minBuyers30d: opts.filters?.minBuyers30d ?? 0,
    minActivityRatio: opts.filters?.minActivityRatio ?? 0,
    averagingDown: opts.filters?.averagingDown ?? "all",
    maxRelativeSectorPct: opts.filters?.maxRelativeSectorPct ?? null,
    crossSource: opts.filters?.crossSource ?? "all",
  };
  const minOccasions = opts.minBuyOccasions ?? FEED_MIN_BUY_OCCASIONS;
  const now = opts.now ?? new Date();
  const today = cutoffDateFromDays(0, now);
  const windowCutoff = cutoffDateFromDays(timeframeDays(opts.timeframe), now);
  const d14 = cutoffDateFromDays(14, now);
  const d30 = cutoffDateFromDays(30, now);

  const chrono: ChronoTrade[] = [];
  for (const t of trades) {
    const ticker = (t.ticker ?? "").trim().toUpperCase();
    const txDate = t.transactionDate?.slice(0, 10);
    const discDate = t.disclosureDate?.slice(0, 10);
    if (!ticker || !txDate) continue;
    if (!sourceMatches(t.source, filters.source)) continue;
    chrono.push({
      ...t,
      tickerNorm: ticker,
      txDate,
      discDate: discDate ?? txDate,
    });
  }

  chrono.sort((a, b) => {
    const d = a.txDate.localeCompare(b.txDate);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });

  // Person-level purchase size medians (all loaded buys, for unusual-size).
  const personSizeSamples = new Map<string, number[]>();
  for (const t of chrono) {
    if (normalizeTransactionType(t.transactionType) !== "buy") continue;
    const est = purchaseSizeEstimate(t);
    if (est.value == null) continue;
    let list = personSizeSamples.get(t.personKey);
    if (!list) {
      list = [];
      personSizeSamples.set(t.personKey, list);
    }
    list.push(est.value);
  }
  const personMedian = new Map<string, number>();
  for (const [k, vals] of personSizeSamples) {
    const m = median(vals);
    if (m != null && m > 0) personMedian.set(k, m);
  }

  // Ticker historical buy occasions outside the recent 30d for activity baseline.
  // Use all loaded buys grouped by occasion key.
  const tickerHistOccasions = new Map<string, Set<string>>();
  for (const t of chrono) {
    if (normalizeTransactionType(t.transactionType) !== "buy") continue;
    const key = occasionKey(t.personKey, t.tickerNorm, t.txDate);
    let set = tickerHistOccasions.get(t.tickerNorm);
    if (!set) {
      set = new Set();
      tickerHistOccasions.set(t.tickerNorm, set);
    }
    // Count only disclosures before the recent 30d window for baseline.
    if (t.discDate < d30) set.add(key);
  }

  const byPersonTicker = new Map<string, ChronoTrade[]>();
  for (const t of chrono) {
    const key = `${t.personKey}|${t.tickerNorm}`;
    let list = byPersonTicker.get(key);
    if (!list) {
      list = [];
      byPersonTicker.set(key, list);
    }
    list.push(t);
  }

  // Sector membership for cross-sectional sector benchmark
  const tickersBySector = new Map<string, string[]>();

  type Acc = {
    ticker: string;
    company: string | null;
    occasions: Map<string, FeedBuyOccasion>;
    buyerOccasions: Map<string, Set<string>>;
    overlapBuyers: Set<string>;
    downtrendBuyers: Set<string>;
    buyerMeta: Map<
      string,
      {
        person: string | null;
        source: FeedTradeSource;
        memberSlug: string | null;
        hasOverlap: boolean;
        maxStreak: number;
        currentStreak: number;
        isAveragingDown: boolean;
        lowerPriceTransitions: number;
        maxDeclineFirstToLatest: number | null;
      }
    >;
  };

  const byTicker = new Map<string, Acc>();

  for (const [, list] of byPersonTicker) {
    const streakInput = list.map((t) => ({
      txDate: t.txDate,
      isBuy: normalizeTransactionType(t.transactionType) === "buy",
      occasionKey: occasionKey(t.personKey, t.tickerNorm, t.txDate),
    }));
    const streaks = computeBuyStreaks(streakInput);

    // Position kind + averaging-down from full chronology
    const buyOccasionsChrono: Array<{
      key: string;
      txDate: string;
      price: number | null;
      positionKind: FeedPositionKind;
    }> = [];
    let openPosition = false;
    for (const t of list) {
      const isBuy = normalizeTransactionType(t.transactionType) === "buy";
      const isSale = normalizeTransactionType(t.transactionType) === "sale";
      const oKey = occasionKey(t.personKey, t.tickerNorm, t.txDate);
      if (isSale) {
        openPosition = false;
        continue;
      }
      if (!isBuy) continue;
      if (buyOccasionsChrono.some((x) => x.key === oKey)) continue;
      const series = seriesByTicker.get(t.tickerNorm) ?? [];
      const price = priceAtDate(series, t.txDate);
      const positionKind: FeedPositionKind = openPosition ? "adding" : "new";
      buyOccasionsChrono.push({ key: oKey, txDate: t.txDate, price, positionKind });
      openPosition = true;
    }

    let lowerPriceTransitions = 0;
    for (let i = 1; i < buyOccasionsChrono.length; i++) {
      const prev = buyOccasionsChrono[i - 1]!;
      const cur = buyOccasionsChrono[i]!;
      if (
        prev.price != null &&
        cur.price != null &&
        cur.price < prev.price
      ) {
        lowerPriceTransitions += 1;
      }
    }
    const firstPx = buyOccasionsChrono[0]?.price ?? null;
    const lastPx =
      buyOccasionsChrono[buyOccasionsChrono.length - 1]?.price ?? null;
    let maxDeclineFirstToLatest: number | null = null;
    if (firstPx != null && lastPx != null && firstPx > 0) {
      maxDeclineFirstToLatest = ((lastPx - firstPx) / firstPx) * 100;
    }
    const lastTwo = buyOccasionsChrono.slice(-2);
    const isAveragingDown =
      lastTwo.length >= 2 &&
      lastTwo[0]!.price != null &&
      lastTwo[1]!.price != null &&
      lastTwo[1]!.price! < lastTwo[0]!.price!;

    const positionByKey = new Map(
      buyOccasionsChrono.map((x) => [x.key, x] as const),
    );
    const avgDownStepKeys = new Set<string>();
    for (let i = 1; i < buyOccasionsChrono.length; i++) {
      const prev = buyOccasionsChrono[i - 1]!;
      const cur = buyOccasionsChrono[i]!;
      if (
        prev.price != null &&
        cur.price != null &&
        cur.price < prev.price
      ) {
        avgDownStepKeys.add(cur.key);
      }
    }

    for (const t of list) {
      if (normalizeTransactionType(t.transactionType) !== "buy") continue;
      if (t.discDate < windowCutoff) continue;

      const series = seriesByTicker.get(t.tickerNorm) ?? [];
      const ret20 = tradingDayReturnBefore(series, t.txDate);
      const boughtDuringDowntrend = ret20 != null && ret20 < 0;
      const hasOverlap = t.hasSectorOverlap === true;
      const est = purchaseSizeEstimate(t);
      const med = personMedian.get(t.personKey);
      const sizeRatio =
        est.value != null && med != null && med > 0 ? est.value / med : null;
      const isUnusuallyLarge =
        sizeRatio != null && sizeRatio >= FEED_UNUSUAL_SIZE_RATIO;

      let overlapMatchType: FeedBuyOccasion["overlapMatchType"] = null;
      if (t.overlapMatchType === "direct") overlapMatchType = "direct";
      else if (
        t.overlapMatchType === "embedding" ||
        t.overlapMatchType === "semantic"
      ) {
        overlapMatchType = "semantic";
      }

      const oKey = occasionKey(t.personKey, t.tickerNorm, t.txDate);
      const pos = positionByKey.get(oKey);
      const ageDays = Math.max(0, daysBetween(t.discDate, today));

      let acc = byTicker.get(t.tickerNorm);
      if (!acc) {
        const industry = getTickerIndustryLabel(t.tickerNorm);
        acc = {
          ticker: t.tickerNorm,
          company: industry?.company ?? t.company,
          occasions: new Map(),
          buyerOccasions: new Map(),
          overlapBuyers: new Set(),
          downtrendBuyers: new Set(),
          buyerMeta: new Map(),
        };
        byTicker.set(t.tickerNorm, acc);
      }
      if (t.company && !acc.company) acc.company = t.company;

      if (!acc.occasions.has(oKey)) {
        acc.occasions.set(oKey, {
          key: oKey,
          person: t.person,
          personKey: t.personKey,
          memberSlug: t.memberSlug,
          source: t.source,
          ticker: t.tickerNorm,
          company: acc.company,
          transactionDate: t.txDate,
          disclosureDate: t.discDate,
          amountRange: t.amountRange,
          disclosedMin: t.disclosedMin,
          disclosedMax: t.disclosedMax,
          exactValue: t.exactValue,
          purchaseEstimate: est.value,
          purchaseEstimateIsApproximate: est.approximate,
          priceAtTrade: priceAtDate(series, t.txDate),
          return20dBefore: ret20,
          boughtDuringDowntrend,
          personSizeRatio: sizeRatio,
          isUnusuallyLarge,
          positionKind: pos?.positionKind ?? "unknown",
          isAveragingDownStep: avgDownStepKeys.has(oKey),
          hasSectorOverlap: hasOverlap,
          overlapMatchType,
          overlapSimilarity: t.overlapSimilarity,
          overlapMemberLabel: t.overlapMemberLabel,
          overlapTickerLabel: t.overlapTickerLabel,
          officerTitle: t.officerTitle,
          filingUrl: t.filingUrl,
          recencyWeight: recencyWeight(ageDays),
        });
      } else {
        const existing = acc.occasions.get(oKey)!;
        if (hasOverlap && !existing.hasSectorOverlap) {
          existing.hasSectorOverlap = true;
          existing.overlapMatchType = overlapMatchType;
          existing.overlapSimilarity = t.overlapSimilarity;
          existing.overlapMemberLabel = t.overlapMemberLabel;
          existing.overlapTickerLabel = t.overlapTickerLabel;
        }
        if (isUnusuallyLarge) existing.isUnusuallyLarge = true;
      }

      let buyerSet = acc.buyerOccasions.get(t.personKey);
      if (!buyerSet) {
        buyerSet = new Set();
        acc.buyerOccasions.set(t.personKey, buyerSet);
      }
      buyerSet.add(oKey);

      if (hasOverlap) acc.overlapBuyers.add(t.personKey);
      if (boughtDuringDowntrend) acc.downtrendBuyers.add(t.personKey);

      const prev = acc.buyerMeta.get(t.personKey);
      acc.buyerMeta.set(t.personKey, {
        person: t.person,
        source: t.source,
        memberSlug: t.memberSlug,
        hasOverlap: (prev?.hasOverlap ?? false) || hasOverlap,
        maxStreak: streaks.maxStreak,
        currentStreak: streaks.currentStreak,
        isAveragingDown,
        lowerPriceTransitions,
        maxDeclineFirstToLatest,
      });
    }
  }

  // Build sector ticker lists for proxies
  for (const acc of byTicker.values()) {
    const labels = tickerIndustryLabelsForFilter(acc.ticker);
    const parents = new Set<string>();
    for (const label of labels) {
      for (const p of parentsForNicheLabel(label)) parents.add(p);
    }
    for (const p of parents) {
      const list = tickersBySector.get(p) ?? [];
      list.push(acc.ticker);
      tickersBySector.set(p, list);
    }
  }

  const marketBench = marketBenchmarkReturn(seriesByTicker);
  const rows: FeedTickerRow[] = [];

  for (const acc of byTicker.values()) {
    const occasions = [...acc.occasions.values()].sort((a, b) =>
      b.transactionDate.localeCompare(a.transactionDate),
    );
    if (occasions.length < minOccasions) continue;

    const latest = occasions.reduce((best, o) => {
      const d = o.disclosureDate ?? o.transactionDate;
      const bd = best.disclosureDate ?? best.transactionDate;
      return d >= bd ? o : best;
    }, occasions[0]!);
    const latestDisc = latest.disclosureDate ?? latest.transactionDate;
    if (latestDisc < windowCutoff) continue;

    const industryLabels = tickerIndustryLabelsForFilter(acc.ticker);
    if (!matchesNiche(industryLabels, filters.nicheLabels)) continue;

    const generalParents = new Set<string>();
    for (const label of industryLabels) {
      for (const p of parentsForNicheLabel(label)) generalParents.add(p);
    }
    const generalSector =
      generalParents.size > 0 ? [...generalParents][0]! : null;

    const distinctBuyers = acc.buyerOccasions.size;
    let repeatBuyers = 0;
    for (const set of acc.buyerOccasions.values()) {
      if (set.size >= 2) repeatBuyers += 1;
    }

    const overlapBuyCount = occasions.filter((o) => o.hasSectorOverlap).length;
    const distinctOverlapBuyers = acc.overlapBuyers.size;
    const downtrendBuyCount = occasions.filter(
      (o) => o.boughtDuringDowntrend,
    ).length;
    const distinctDowntrendBuyers = acc.downtrendBuyers.size;

    let maxConsecutiveStreak = 0;
    let averagingDownBuyers = 0;
    for (const meta of acc.buyerMeta.values()) {
      if (meta.maxStreak > maxConsecutiveStreak) {
        maxConsecutiveStreak = meta.maxStreak;
      }
      if (meta.isAveragingDown) averagingDownBuyers += 1;
    }

    const buyersLast14d = new Set(
      occasions
        .filter((o) => (o.disclosureDate ?? o.transactionDate) >= d14)
        .map((o) => o.personKey),
    ).size;
    const buyersLast30d = new Set(
      occasions
        .filter((o) => (o.disclosureDate ?? o.transactionDate) >= d30)
        .map((o) => o.personKey),
    ).size;
    const buysLast14d = occasions.filter(
      (o) => (o.disclosureDate ?? o.transactionDate) >= d14,
    ).length;
    const buysLast30d = occasions.filter(
      (o) => (o.disclosureDate ?? o.transactionDate) >= d30,
    ).length;

    const unusuallyLargeBuyCount = occasions.filter(
      (o) => o.isUnusuallyLarge,
    ).length;
    const newPositionBuyers = new Set(
      occasions.filter((o) => o.positionKind === "new").map((o) => o.personKey),
    ).size;
    const addingBuyers = new Set(
      occasions
        .filter((o) => o.positionKind === "adding")
        .map((o) => o.personKey),
    ).size;

    const sourceTypes = [...new Set(occasions.map((o) => o.source))];
    const avgRecencyWeight =
      occasions.reduce((s, o) => s + o.recencyWeight, 0) /
      Math.max(1, occasions.length);

    // Activity ratio: recent 30d buys vs historical expected per 30d
    const histCount = tickerHistOccasions.get(acc.ticker)?.size ?? 0;
    // Approximate history span from oldest loaded trade for this ticker
    const allDisc = chrono
      .filter((t) => t.tickerNorm === acc.ticker)
      .map((t) => t.discDate);
    const oldest = allDisc.length ? allDisc.reduce((a, b) => (a < b ? a : b)) : d30;
    const histDays = Math.max(30, daysBetween(oldest, d30));
    const expectedPer30d = Math.max(
      FEED_ACTIVITY_BASELINE_FLOOR,
      (histCount / histDays) * 30,
    );
    const activityRatio = buysLast30d / expectedPer30d;

    const series = seriesByTicker.get(acc.ticker) ?? [];
    const currentTrendReturn = currentTradingDayReturn(series);
    const isCurrentDowntrend =
      currentTrendReturn != null && currentTrendReturn < 0;

    const sectorPeers = generalSector
      ? (tickersBySector.get(generalSector) ?? []).filter((t) => t !== acc.ticker)
      : [];
    const sectorBench = sectorBenchmarkReturn(
      seriesByTicker,
      generalSector,
      sectorPeers,
    );

    const relativeMarketReturn =
      currentTrendReturn != null && marketBench.returnPct != null
        ? currentTrendReturn - marketBench.returnPct
        : null;
    const relativeSectorReturn =
      currentTrendReturn != null && sectorBench.returnPct != null
        ? currentTrendReturn - sectorBench.returnPct
        : null;

    // Prefer sector-relative weakness for scoring when available
    const relativeWeaknessPct =
      relativeSectorReturn ?? relativeMarketReturn;

    if (filters.trend === "down" && !isCurrentDowntrend) continue;
    if (
      filters.trend === "up" &&
      !(currentTrendReturn != null && currentTrendReturn > 0)
    ) {
      continue;
    }
    if (filters.overlap === "has_overlap" && distinctOverlapBuyers === 0) {
      continue;
    }
    if (distinctBuyers < filters.minBuyers) continue;
    if (occasions.length < Math.max(minOccasions, filters.minBuys)) continue;
    if (repeatBuyers < filters.minRepeatBuyers) continue;
    if (distinctOverlapBuyers < filters.minOverlapBuyers) continue;
    if (buyersLast30d < filters.minBuyers30d) continue;
    if (
      filters.minActivityRatio > 0 &&
      (activityRatio == null || activityRatio < filters.minActivityRatio)
    ) {
      continue;
    }
    if (filters.averagingDown === "yes" && averagingDownBuyers === 0) continue;
    if (filters.averagingDown === "no" && averagingDownBuyers > 0) continue;
    if (filters.crossSource === "yes" && sourceTypes.length < 2) continue;
    if (filters.crossSource === "no" && sourceTypes.length >= 2) continue;
    if (
      filters.maxRelativeSectorPct != null &&
      (relativeSectorReturn == null ||
        relativeSectorReturn > filters.maxRelativeSectorPct)
    ) {
      continue;
    }

    const breakdown = computeScore({
      buyOccasions: occasions.length,
      distinctBuyers,
      repeatBuyers,
      maxConsecutiveStreak,
      distinctOverlapBuyers,
      downtrendBuyCount,
      isCurrentDowntrend,
      buyersLast14d,
      buyersLast30d,
      unusuallyLargeBuyCount,
      averagingDownBuyers,
      relativeWeaknessPct,
      activityRatio,
      avgRecencyWeight,
      extraSourceTypes: Math.max(0, sourceTypes.length - 1),
    });

    const components: FeedScoreComponents = {
      buy_occasions: occasions.length,
      distinct_buyers: distinctBuyers,
      repeat_buyers: repeatBuyers,
      max_consecutive_streak: maxConsecutiveStreak,
      sector_overlap_buyers: distinctOverlapBuyers,
      downtrend_buys: downtrendBuyCount,
      buyers_last_14d: buyersLast14d,
      buyers_last_30d: buyersLast30d,
      buys_last_14d: buysLast14d,
      buys_last_30d: buysLast30d,
      unusually_large_buys: unusuallyLargeBuyCount,
      averaging_down_buyers: averagingDownBuyers,
      new_position_buyers: newPositionBuyers,
      adding_buyers: addingBuyers,
      return_20d: currentTrendReturn,
      benchmark_return_20d: marketBench.returnPct,
      relative_market_return_20d: relativeMarketReturn,
      sector_benchmark_return_20d: sectorBench.returnPct,
      relative_sector_return_20d: relativeSectorReturn,
      activity_ratio: activityRatio,
      active_source_types: sourceTypes.map(sourceLabel),
      avg_recency_weight: avgRecencyWeight,
    };

    const buyerStreaks: FeedBuyerStreak[] = [];
    for (const [personKey, occKeys] of acc.buyerOccasions) {
      const meta = acc.buyerMeta.get(personKey);
      const buyerOccasions = [...occKeys]
        .map((k) => acc.occasions.get(k)!)
        .filter(Boolean)
        .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
      buyerStreaks.push({
        person: meta?.person ?? buyerOccasions[0]?.person ?? null,
        personKey,
        source: meta?.source ?? buyerOccasions[0]?.source ?? "house",
        memberSlug: meta?.memberSlug ?? null,
        occasions: buyerOccasions,
        maxStreak: meta?.maxStreak ?? buyerOccasions.length,
        currentStreak: meta?.currentStreak ?? 0,
        hasOverlap: meta?.hasOverlap ?? false,
        isAveragingDown: meta?.isAveragingDown ?? false,
        lowerPriceTransitions: meta?.lowerPriceTransitions ?? 0,
        maxDeclineFirstToLatest: meta?.maxDeclineFirstToLatest ?? null,
      });
    }
    buyerStreaks.sort((a, b) => {
      if (b.maxStreak !== a.maxStreak) return b.maxStreak - a.maxStreak;
      return b.occasions.length - a.occasions.length;
    });

    rows.push({
      ticker: acc.ticker,
      company: acc.company,
      generalSector,
      industryLabels,
      score: breakdown.total,
      breakdown,
      components,
      whyNoteworthy: buildWhyNoteworthy(components),
      buyOccasions: occasions.length,
      distinctBuyers,
      repeatBuyers,
      overlapBuyCount,
      distinctOverlapBuyers,
      downtrendBuyCount,
      distinctDowntrendBuyers,
      maxConsecutiveStreak,
      buyersLast14d,
      buyersLast30d,
      buysLast14d,
      buysLast30d,
      unusuallyLargeBuyCount,
      averagingDownBuyers,
      newPositionBuyers,
      addingBuyers,
      activityRatio,
      activeSourceTypes: sourceTypes,
      currentTrendReturn,
      isCurrentDowntrend,
      marketBenchmarkReturn: marketBench.returnPct,
      relativeMarketReturn,
      sectorBenchmarkReturn: sectorBench.returnPct,
      relativeSectorReturn,
      latestBuyDisclosure: latest.disclosureDate,
      latestBuyTransaction: latest.transactionDate,
      occasions,
      buyerStreaks,
    });
  }

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.distinctOverlapBuyers !== a.distinctOverlapBuyers) {
      return b.distinctOverlapBuyers - a.distinctOverlapBuyers;
    }
    if (b.distinctBuyers !== a.distinctBuyers) {
      return b.distinctBuyers - a.distinctBuyers;
    }
    const da = a.latestBuyDisclosure ?? "";
    const db = b.latestBuyDisclosure ?? "";
    return db.localeCompare(da);
  });

  return rows;
}
