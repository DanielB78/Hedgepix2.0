/**
 * Feed ranking: buyer+ticker sector-overlap signals first, then aggregate to ticker.
 * Distinct multi-buyer counts are display context only (near-zero weight).
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
  FEED_MIN_BUY_OCCASIONS_NO_OVERLAP,
  FEED_TICKER_AGGREGATION,
  FEED_TREND_TRADING_DAYS,
  FEED_UNUSUAL_SIZE_RATIO,
  FEED_WEIGHTS,
  capCount,
  overlapStrengthWeight,
  recencyWeight,
} from "./weights";
import type {
  FeedBuyOccasion,
  FeedBuyerStreak,
  FeedBuyerTickerSignal,
  FeedFilters,
  FeedOverlapBand,
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

/** Temporary draft for buyer/ticker scoring between passes. */
type BuyerScoreDraft = {
  occasions: FeedBuyOccasion[];
  consecutiveStreak: number;
  lowerPriceRepeatBuys: number;
  declineSinceFirstBuyPct: number | null;
  isAveragingDown: boolean;
  hasSectorOverlap: boolean;
  overlapBand: FeedOverlapBand;
  overlapWeight: number;
  relativeWeaknessPct: number | null;
  isCurrentDowntrend: boolean;
  activityRatio: number | null;
  source: FeedTradeSource;
  officerTitle: string | null;
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

export function purchaseSizeEstimate(trade: {
  exactValue: number | null;
  disclosedMin: number | null;
  disclosedMax: number | null;
}): { value: number | null; approximate: boolean } {
  if (
    trade.exactValue != null &&
    Number.isFinite(trade.exactValue) &&
    trade.exactValue > 0
  ) {
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

function isSeniorInsiderTitle(title: string | null | undefined): boolean {
  const t = (title ?? "").toLowerCase();
  if (!t) return false;
  return (
    /\bceo\b/.test(t) ||
    /\bcfo\b/.test(t) ||
    /\bcoo\b/.test(t) ||
    /\bchief\b/.test(t) ||
    /\bdirector\b/.test(t) ||
    /\bpresident\b/.test(t)
  );
}

function overlapBandLabel(band: FeedOverlapBand): string {
  switch (band) {
    case "direct":
      return "direct exact match";
    case "very_high":
      return "very high semantic match";
    case "high":
      return "strong semantic match";
    case "moderate":
      return "moderate semantic match";
    default:
      return "no overlap";
  }
}

export function buildBuyerWhyLines(signal: {
  person: string | null;
  source: FeedTradeSource;
  hasSectorOverlap: boolean;
  overlapBand: FeedOverlapBand;
  overlapSimilarity: number | null;
  overlapMemberLabel: string | null;
  overlapTickerLabel: string | null;
  buyCount: number;
  consecutiveStreak: number;
  lowerPriceRepeatBuys: number;
  declineSinceFirstBuyPct: number | null;
  downtrendBuys: number;
  unusuallyLargeBuys: number;
  latestDisclosure: string | null;
  relativeSectorReturn: number | null;
  relativeMarketReturn: number | null;
  return20d: number | null;
  officerTitle: string | null;
}): string[] {
  const lines: string[] = [];
  const who = signal.person ?? "This buyer";

  if (signal.hasSectorOverlap) {
    lines.push(
      `${who}'s congressional sector exposure overlaps the ticker's industry (${overlapBandLabel(signal.overlapBand)})`,
    );
    if (
      signal.overlapMemberLabel &&
      signal.overlapTickerLabel
    ) {
      lines.push(
        `Overlap: ${signal.overlapMemberLabel} ↔ ${signal.overlapTickerLabel}`,
      );
    }
    if (signal.overlapSimilarity != null) {
      lines.push(`Sector similarity: ${signal.overlapSimilarity.toFixed(2)}`);
    }
  } else if (signal.source === "insider") {
    lines.push(
      `${who} is a corporate insider${signal.officerTitle ? ` (${signal.officerTitle})` : ""} — no congressional sector overlap`,
    );
  }

  if (signal.consecutiveStreak >= 2 || signal.buyCount >= 2) {
    lines.push(
      `Same ${signal.source === "insider" ? "insider" : "member"} has purchased this ticker ${signal.buyCount} time${signal.buyCount === 1 ? "" : "s"}` +
        (signal.consecutiveStreak >= 2
          ? ` (${signal.consecutiveStreak} consecutive)`
          : ""),
    );
  }

  if (signal.lowerPriceRepeatBuys > 0) {
    lines.push(
      `${signal.lowerPriceRepeatBuys} later purchase${signal.lowerPriceRepeatBuys === 1 ? "" : "s"} occurred at lower prices`,
    );
  }
  if (
    signal.declineSinceFirstBuyPct != null &&
    signal.declineSinceFirstBuyPct < 0
  ) {
    lines.push(
      `Stock fell ${Math.abs(signal.declineSinceFirstBuyPct).toFixed(0)}% during the buying sequence`,
    );
  }
  if (signal.relativeSectorReturn != null && signal.relativeSectorReturn < 0) {
    lines.push(
      `Stock underperformed its sector by ${Math.abs(signal.relativeSectorReturn).toFixed(0)}%`,
    );
  } else if (
    signal.relativeMarketReturn != null &&
    signal.relativeMarketReturn < 0
  ) {
    lines.push(
      `Stock underperformed the market by ${Math.abs(signal.relativeMarketReturn).toFixed(0)}%`,
    );
  } else if (signal.return20d != null && signal.return20d < 0) {
    lines.push(
      `Stock is currently ${signal.return20d.toFixed(1)}% over 20 trading days`,
    );
  }
  if (signal.downtrendBuys > 0) {
    lines.push(
      `${signal.downtrendBuys} purchase${signal.downtrendBuys === 1 ? "" : "s"} occurred while the stock was already falling`,
    );
  }
  if (signal.unusuallyLargeBuys > 0) {
    lines.push(
      `Purchase size was unusually large relative to that ${signal.source === "insider" ? "insider" : "member"}'s history`,
    );
  }
  if (signal.latestDisclosure) {
    const age = daysBetween(
      signal.latestDisclosure,
      cutoffDateFromDays(0),
    );
    if (age <= 0) lines.push("Latest disclosed purchase was today");
    else if (age === 1) lines.push("Latest disclosed purchase was 1 day ago");
    else lines.push(`Latest disclosed purchase was ${age} days ago`);
  }

  return lines;
}

export function buildWhyNoteworthy(
  strongest: FeedBuyerTickerSignal | null,
  extras: {
    additionalOverlapBuyers: number;
    relativeSectorReturn: number | null;
    relativeMarketReturn: number | null;
    return20d: number | null;
  },
): string[] {
  if (!strongest) return [];
  const lines = [...strongest.whyLines];
  if (extras.additionalOverlapBuyers > 0) {
    lines.push(
      `+${extras.additionalOverlapBuyers} additional sector-overlap buyer${extras.additionalOverlapBuyers === 1 ? "" : "s"}`,
    );
  }
  return lines;
}

export function scoreBuyerTicker(input: {
  occasions: FeedBuyOccasion[];
  consecutiveStreak: number;
  lowerPriceRepeatBuys: number;
  declineSinceFirstBuyPct: number | null;
  isAveragingDown: boolean;
  hasSectorOverlap: boolean;
  overlapBand: FeedOverlapBand;
  overlapWeight: number;
  relativeWeaknessPct: number | null;
  isCurrentDowntrend: boolean;
  activityRatio: number | null;
  source: FeedTradeSource;
  officerTitle: string | null;
}): number {
  const buys = input.occasions;
  if (buys.length === 0) return 0;

  let score = 0;

  // Overlap (congressional) or insider repeat base
  if (input.hasSectorOverlap) {
    score += input.overlapWeight;
  } else if (input.source === "insider" && buys.length >= 2) {
    score += FEED_WEIGHTS.insiderRepeatBase;
    if (isSeniorInsiderTitle(input.officerTitle)) {
      score += FEED_WEIGHTS.insiderSeniorRole;
    }
  } else if (input.source === "insider" && buys.length === 1) {
    // Single insider buy: small base only if unusual size or weakness
    score += 2;
    if (isSeniorInsiderTitle(input.officerTitle)) {
      score += FEED_WEIGHTS.insiderSeniorRole;
    }
  } else if (!input.hasSectorOverlap) {
    // Congress without overlap: weak signal — only repeat+weakness can lift
    score += 1;
  }

  const extraBuys = Math.max(0, buys.length - 1);
  score +=
    capCount(extraBuys, FEED_CAPS.repeatBuySamePerson) *
    FEED_WEIGHTS.repeatBuySamePerson;

  const streakSteps = Math.max(0, input.consecutiveStreak - 1);
  score +=
    capCount(streakSteps, FEED_CAPS.consecutiveStreakStep) *
    FEED_WEIGHTS.consecutiveStreakStep;

  score +=
    capCount(input.lowerPriceRepeatBuys, FEED_CAPS.averagingDownStep) *
    FEED_WEIGHTS.averagingDownStep;

  if (
    input.declineSinceFirstBuyPct != null &&
    input.declineSinceFirstBuyPct < 0
  ) {
    const pts = Math.min(
      Math.abs(input.declineSinceFirstBuyPct),
      FEED_CAPS.declineSinceFirstBuyPct,
    );
    score += pts * FEED_WEIGHTS.declineSinceFirstBuy;
  }

  if (input.relativeWeaknessPct != null && input.relativeWeaknessPct < 0) {
    const pts = Math.min(
      Math.abs(input.relativeWeaknessPct),
      FEED_CAPS.relativeWeaknessPct,
    );
    score += pts * FEED_WEIGHTS.relativeWeakness;
  }

  const downtrendBuys = buys.filter((b) => b.boughtDuringDowntrend).length;
  score +=
    capCount(downtrendBuys, FEED_CAPS.downtrendBuy) * FEED_WEIGHTS.downtrendBuy;

  if (input.isCurrentDowntrend) score += FEED_WEIGHTS.currentDowntrend;

  const large = buys.filter((b) => b.isUnusuallyLarge).length;
  score +=
    capCount(large, FEED_CAPS.unusuallyLargeBuy) *
    FEED_WEIGHTS.unusuallyLargeBuy;

  const avgRecency =
    buys.reduce((s, b) => s + b.recencyWeight, 0) / Math.max(1, buys.length);
  score += avgRecency * FEED_WEIGHTS.recency;

  if (input.activityRatio != null && input.activityRatio > 1) {
    const excess = Math.min(
      input.activityRatio - 1,
      FEED_CAPS.unusualActivityExcess,
    );
    score += excess * FEED_WEIGHTS.unusualActivity;
  }

  // Amplify when overlap + averaging down + repeats coincide
  if (
    input.hasSectorOverlap &&
    input.isAveragingDown &&
    buys.length >= 3
  ) {
    score *= 1.15;
  }

  return Math.round(score * 10) / 10;
}

export function aggregateTickerScore(
  buyers: Array<{ score: number; hasSectorOverlap: boolean }>,
  distinctBuyers: number,
): FeedScoreBreakdown {
  const sorted = [...buyers].sort((a, b) => b.score - a.score);
  const best = sorted[0] ?? null;
  const bestScore = best?.score ?? 0;

  // Second + additional contributions come from other OVERLAP buyers only,
  // so unrelated multi-buyer clusters cannot inflate the ticker score.
  const otherOverlap = sorted
    .slice(1)
    .filter((b) => b.hasSectorOverlap);

  const second = otherOverlap[0]?.score ?? 0;
  const additional = otherOverlap
    .slice(1)
    .filter((b) => b.score >= FEED_TICKER_AGGREGATION.additionalMinScore)
    .slice(0, FEED_TICKER_AGGREGATION.maxAdditional);

  const bestBuyerScore = bestScore * FEED_TICKER_AGGREGATION.bestWeight;
  const secondBuyerContribution =
    second * FEED_TICKER_AGGREGATION.secondWeight;
  const additionalBuyerContribution = additional.reduce(
    (s, v) => s + v.score * FEED_TICKER_AGGREGATION.additionalWeight,
    0,
  );
  const distinctBuyerContext =
    Math.max(0, distinctBuyers - 1) * FEED_WEIGHTS.distinctBuyerContext;

  const total =
    Math.round(
      (bestBuyerScore +
        secondBuyerContribution +
        additionalBuyerContribution +
        distinctBuyerContext) *
        10,
    ) / 10;

  return {
    bestBuyerScore: Math.round(bestBuyerScore * 10) / 10,
    secondBuyerContribution: Math.round(secondBuyerContribution * 10) / 10,
    additionalBuyerContribution:
      Math.round(additionalBuyerContribution * 10) / 10,
    distinctBuyerContext: Math.round(distinctBuyerContext * 10) / 10,
    total,
  };
}

export function rankFeedTickers(
  trades: FeedRawTrade[],
  seriesByTicker: Map<string, PriceSeries>,
  opts: {
    timeframe: FeedTimeframe;
    filters?: Partial<FeedFilters>;
    now?: Date;
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

  const tickerHistOccasions = new Map<string, Set<string>>();
  for (const t of chrono) {
    if (normalizeTransactionType(t.transactionType) !== "buy") continue;
    if (t.discDate >= d30) continue;
    const key = occasionKey(t.personKey, t.tickerNorm, t.txDate);
    let set = tickerHistOccasions.get(t.tickerNorm);
    if (!set) {
      set = new Set();
      tickerHistOccasions.set(t.tickerNorm, set);
    }
    set.add(key);
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

  const tickersBySector = new Map<string, string[]>();
  const marketBench = marketBenchmarkReturn(seriesByTicker);

  // Build per-ticker collections of window-qualifying occasions + buyer signals
  type TickerAcc = {
    ticker: string;
    company: string | null;
    occasions: Map<string, FeedBuyOccasion>;
    buyerSignals: FeedBuyerTickerSignal[];
  };
  const byTicker = new Map<string, TickerAcc>();
  const draftStore = new Map<string, BuyerScoreDraft>();

  for (const [, list] of byPersonTicker) {
    const streakInput = list.map((t) => ({
      txDate: t.txDate,
      isBuy: normalizeTransactionType(t.transactionType) === "buy",
      occasionKey: occasionKey(t.personKey, t.tickerNorm, t.txDate),
    }));
    const streaks = computeBuyStreaks(streakInput);

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
      buyOccasionsChrono.push({
        key: oKey,
        txDate: t.txDate,
        price,
        positionKind: openPosition ? "adding" : "new",
      });
      openPosition = true;
    }

    let lowerPriceTransitions = 0;
    for (let i = 1; i < buyOccasionsChrono.length; i++) {
      const prev = buyOccasionsChrono[i - 1]!;
      const cur = buyOccasionsChrono[i]!;
      if (prev.price != null && cur.price != null && cur.price < prev.price) {
        lowerPriceTransitions += 1;
      }
    }
    const firstPx = buyOccasionsChrono[0]?.price ?? null;
    const lastPx =
      buyOccasionsChrono[buyOccasionsChrono.length - 1]?.price ?? null;
    let declineSinceFirst: number | null = null;
    if (firstPx != null && lastPx != null && firstPx > 0) {
      declineSinceFirst = ((lastPx - firstPx) / firstPx) * 100;
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
      if (prev.price != null && cur.price != null && cur.price < prev.price) {
        avgDownStepKeys.add(cur.key);
      }
    }

    const windowOccasions: FeedBuyOccasion[] = [];
    let bestOverlap = {
      has: false,
      matchType: null as FeedBuyOccasion["overlapMatchType"],
      similarity: null as number | null,
      memberLabel: null as string | null,
      tickerLabel: null as string | null,
    };

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

      let overlapMatchType: FeedBuyOccasion["overlapMatchType"] = null;
      if (t.overlapMatchType === "direct") overlapMatchType = "direct";
      else if (
        t.overlapMatchType === "embedding" ||
        t.overlapMatchType === "semantic"
      ) {
        overlapMatchType = "semantic";
      }

      if (hasOverlap) {
        bestOverlap = {
          has: true,
          matchType: overlapMatchType,
          similarity: t.overlapSimilarity,
          memberLabel: t.overlapMemberLabel,
          tickerLabel: t.overlapTickerLabel,
        };
      }

      const oKey = occasionKey(t.personKey, t.tickerNorm, t.txDate);
      const pos = positionByKey.get(oKey);
      const ageDays = Math.max(0, daysBetween(t.discDate, today));

      const occasion: FeedBuyOccasion = {
        key: oKey,
        person: t.person,
        personKey: t.personKey,
        memberSlug: t.memberSlug,
        source: t.source,
        ticker: t.tickerNorm,
        company: getTickerIndustryLabel(t.tickerNorm)?.company ?? t.company,
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
        isUnusuallyLarge:
          sizeRatio != null && sizeRatio >= FEED_UNUSUAL_SIZE_RATIO,
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
      };

      if (!windowOccasions.some((o) => o.key === oKey)) {
        windowOccasions.push(occasion);
      } else {
        const existing = windowOccasions.find((o) => o.key === oKey)!;
        if (hasOverlap && !existing.hasSectorOverlap) {
          existing.hasSectorOverlap = true;
          existing.overlapMatchType = overlapMatchType;
          existing.overlapSimilarity = t.overlapSimilarity;
          existing.overlapMemberLabel = t.overlapMemberLabel;
          existing.overlapTickerLabel = t.overlapTickerLabel;
        }
      }
    }

    if (windowOccasions.length === 0) continue;

    windowOccasions.sort((a, b) =>
      a.transactionDate.localeCompare(b.transactionDate),
    );

    const ticker = windowOccasions[0]!.ticker;
    const series = seriesByTicker.get(ticker) ?? [];
    const currentTrendReturn = currentTradingDayReturn(series);
    const isCurrentDowntrend =
      currentTrendReturn != null && currentTrendReturn < 0;

    const industryLabels = tickerIndustryLabelsForFilter(ticker);
    const generalParents = new Set<string>();
    for (const label of industryLabels) {
      for (const p of parentsForNicheLabel(label)) generalParents.add(p);
    }
    const generalSector =
      generalParents.size > 0 ? [...generalParents][0]! : null;
    if (generalSector) {
      const peers = tickersBySector.get(generalSector) ?? [];
      if (!peers.includes(ticker)) {
        peers.push(ticker);
        tickersBySector.set(generalSector, peers);
      }
    }

    // Relative weakness filled after sector maps are complete — use provisional now,
    // recompute at ticker aggregation with full peer set.
    const overlapInfo = overlapStrengthWeight({
      hasOverlap: bestOverlap.has,
      matchType: bestOverlap.matchType,
      similarity: bestOverlap.similarity,
    });

    const histCount = tickerHistOccasions.get(ticker)?.size ?? 0;
    const allDisc = chrono
      .filter((t) => t.tickerNorm === ticker)
      .map((t) => t.discDate);
    const oldest = allDisc.length
      ? allDisc.reduce((a, b) => (a < b ? a : b))
      : d30;
    const histDays = Math.max(30, daysBetween(oldest, d30));
    const expectedPer30d = Math.max(
      FEED_ACTIVITY_BASELINE_FLOOR,
      (histCount / histDays) * 30,
    );
    const buysLast30d = windowOccasions.filter(
      (o) => (o.disclosureDate ?? o.transactionDate) >= d30,
    ).length;
    const activityRatio = buysLast30d / expectedPer30d;

    // Placeholder relative weakness — refined in second pass
    const signalDraft = {
      occasions: windowOccasions,
      consecutiveStreak: streaks.maxStreak,
      lowerPriceRepeatBuys: lowerPriceTransitions,
      declineSinceFirstBuyPct: declineSinceFirst,
      isAveragingDown,
      hasSectorOverlap: bestOverlap.has,
      overlapBand: overlapInfo.band,
      overlapWeight: overlapInfo.weight,
      relativeWeaknessPct: null as number | null,
      isCurrentDowntrend,
      activityRatio,
      source: windowOccasions[0]!.source,
      officerTitle: windowOccasions[0]!.officerTitle,
    };

    let acc = byTicker.get(ticker);
    if (!acc) {
      acc = {
        ticker,
        company: windowOccasions[0]!.company,
        occasions: new Map(),
        buyerSignals: [],
      };
      byTicker.set(ticker, acc);
    }
    for (const o of windowOccasions) {
      if (!acc.occasions.has(o.key)) acc.occasions.set(o.key, o);
    }

    // Store draft on a temp field via buyerSignals after scoring with provisional relative=null;
    // we'll rescore after sector benchmarks are ready.
    acc.buyerSignals.push({
      person: windowOccasions[0]!.person,
      personKey: windowOccasions[0]!.personKey,
      source: windowOccasions[0]!.source,
      memberSlug: windowOccasions[0]!.memberSlug,
      officerTitle: windowOccasions[0]!.officerTitle,
      score: 0, // filled in second pass
      hasSectorOverlap: bestOverlap.has,
      overlapBand: overlapInfo.band,
      overlapMatchType: bestOverlap.matchType,
      overlapSimilarity: bestOverlap.similarity,
      overlapMemberLabel: bestOverlap.memberLabel,
      overlapTickerLabel: bestOverlap.tickerLabel,
      buyCount: windowOccasions.length,
      consecutiveStreak: streaks.maxStreak,
      lowerPriceRepeatBuys: lowerPriceTransitions,
      declineSinceFirstBuyPct: declineSinceFirst,
      isAveragingDown,
      downtrendBuys: windowOccasions.filter((o) => o.boughtDuringDowntrend)
        .length,
      unusuallyLargeBuys: windowOccasions.filter((o) => o.isUnusuallyLarge)
        .length,
      avgRecencyWeight:
        windowOccasions.reduce((s, o) => s + o.recencyWeight, 0) /
        windowOccasions.length,
      latestDisclosure:
        windowOccasions
          .map((o) => o.disclosureDate ?? o.transactionDate)
          .sort()
          .at(-1) ?? null,
      occasions: windowOccasions,
      whyLines: [],
      // stash draft fields on object via scoreBuyerTicker later
    });

    // Attach draft for second pass via a side map
    const draftKey = `${windowOccasions[0]!.personKey}|${ticker}`;
    draftStore.set(draftKey, signalDraft);
  }

  const rows: FeedTickerRow[] = [];

  for (const acc of byTicker.values()) {
    const occasions = [...acc.occasions.values()].sort((a, b) =>
      b.transactionDate.localeCompare(a.transactionDate),
    );
    if (occasions.length === 0) continue;

    const industryLabels = tickerIndustryLabelsForFilter(acc.ticker);
    if (!matchesNiche(industryLabels, filters.nicheLabels)) continue;

    const generalParents = new Set<string>();
    for (const label of industryLabels) {
      for (const p of parentsForNicheLabel(label)) generalParents.add(p);
    }
    const generalSector =
      generalParents.size > 0 ? [...generalParents][0]! : null;

    const series = seriesByTicker.get(acc.ticker) ?? [];
    const currentTrendReturn = currentTradingDayReturn(
      series,
      FEED_TREND_TRADING_DAYS,
    );
    const isCurrentDowntrend =
      currentTrendReturn != null && currentTrendReturn < 0;

    const sectorPeers = generalSector
      ? (tickersBySector.get(generalSector) ?? []).filter(
          (t) => t !== acc.ticker,
        )
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
    const relativeWeaknessPct =
      relativeSectorReturn ?? relativeMarketReturn;

    // Rescore each buyer signal with relative weakness
    const rescored: FeedBuyerTickerSignal[] = [];
    for (const sig of acc.buyerSignals) {
      const draftKey = `${sig.personKey}|${acc.ticker}`;
      const draft = draftStore.get(draftKey);
      if (!draft) continue;
      draft.relativeWeaknessPct = relativeWeaknessPct;
      draft.isCurrentDowntrend = isCurrentDowntrend;
      const score = scoreBuyerTicker(draft);
      const whyLines = buildBuyerWhyLines({
        person: sig.person,
        source: sig.source,
        hasSectorOverlap: sig.hasSectorOverlap,
        overlapBand: sig.overlapBand,
        overlapSimilarity: sig.overlapSimilarity,
        overlapMemberLabel: sig.overlapMemberLabel,
        overlapTickerLabel: sig.overlapTickerLabel,
        buyCount: sig.buyCount,
        consecutiveStreak: sig.consecutiveStreak,
        lowerPriceRepeatBuys: sig.lowerPriceRepeatBuys,
        declineSinceFirstBuyPct: sig.declineSinceFirstBuyPct,
        downtrendBuys: sig.downtrendBuys,
        unusuallyLargeBuys: sig.unusuallyLargeBuys,
        latestDisclosure: sig.latestDisclosure,
        relativeSectorReturn,
        relativeMarketReturn,
        return20d: currentTrendReturn,
        officerTitle: sig.officerTitle,
      });
      rescored.push({ ...sig, score, whyLines });
    }

    rescored.sort((a, b) => b.score - a.score);
    if (rescored.length === 0) continue;

    const strongest = rescored[0]!;
    const hasAnyOverlap = rescored.some((s) => s.hasSectorOverlap);

    // Eligibility: overlap patterns can be 1 buy; others need ≥2
    if (!hasAnyOverlap && occasions.length < FEED_MIN_BUY_OCCASIONS_NO_OVERLAP) {
      continue;
    }
    // Prefer overlap-focused feed when filter says so
    if (filters.overlap === "has_overlap" && !hasAnyOverlap) continue;

    const latest = occasions.reduce((best, o) => {
      const d = o.disclosureDate ?? o.transactionDate;
      const bd = best.disclosureDate ?? best.transactionDate;
      return d >= bd ? o : best;
    }, occasions[0]!);
    if ((latest.disclosureDate ?? latest.transactionDate) < windowCutoff) {
      continue;
    }

    const distinctBuyers = new Set(occasions.map((o) => o.personKey)).size;
    let repeatBuyers = 0;
    const byBuyer = new Map<string, number>();
    for (const o of occasions) {
      byBuyer.set(o.personKey, (byBuyer.get(o.personKey) ?? 0) + 1);
    }
    for (const n of byBuyer.values()) {
      if (n >= 2) repeatBuyers += 1;
    }

    const distinctOverlapBuyers = new Set(
      occasions.filter((o) => o.hasSectorOverlap).map((o) => o.personKey),
    ).size;
    const overlapBuyCount = occasions.filter((o) => o.hasSectorOverlap).length;
    const downtrendBuyCount = occasions.filter(
      (o) => o.boughtDuringDowntrend,
    ).length;
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
    const averagingDownBuyers = rescored.filter((s) => s.isAveragingDown).length;
    const newPositionBuyers = new Set(
      occasions.filter((o) => o.positionKind === "new").map((o) => o.personKey),
    ).size;
    const addingBuyers = new Set(
      occasions
        .filter((o) => o.positionKind === "adding")
        .map((o) => o.personKey),
    ).size;
    const sourceTypes = [...new Set(occasions.map((o) => o.source))];
    const maxConsecutiveStreak = Math.max(
      ...rescored.map((s) => s.consecutiveStreak),
      0,
    );

    const histCount = tickerHistOccasions.get(acc.ticker)?.size ?? 0;
    const allDisc = chrono
      .filter((t) => t.tickerNorm === acc.ticker)
      .map((t) => t.discDate);
    const oldest = allDisc.length
      ? allDisc.reduce((a, b) => (a < b ? a : b))
      : d30;
    const histDays = Math.max(30, daysBetween(oldest, d30));
    const expectedPer30d = Math.max(
      FEED_ACTIVITY_BASELINE_FLOOR,
      (histCount / histDays) * 30,
    );
    const activityRatio = buysLast30d / expectedPer30d;

    if (filters.trend === "down" && !isCurrentDowntrend) continue;
    if (
      filters.trend === "up" &&
      !(currentTrendReturn != null && currentTrendReturn > 0)
    ) {
      continue;
    }
    if (distinctBuyers < filters.minBuyers) continue;
    if (occasions.length < filters.minBuys) continue;
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

    const breakdown = aggregateTickerScore(
      rescored.map((s) => ({
        score: s.score,
        hasSectorOverlap: s.hasSectorOverlap,
      })),
      distinctBuyers,
    );

    const additionalOverlap = Math.max(0, distinctOverlapBuyers - (strongest.hasSectorOverlap ? 1 : 0));
    const whyNoteworthy = buildWhyNoteworthy(strongest, {
      additionalOverlapBuyers: additionalOverlap,
      relativeSectorReturn,
      relativeMarketReturn,
      return20d: currentTrendReturn,
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
      avg_recency_weight: strongest.avgRecencyWeight,
      strongest_buyer: strongest.person,
      strongest_buyer_score: strongest.score,
      overlap_band: strongest.overlapBand,
      overlap_similarity: strongest.overlapSimilarity,
    };

    const buyerStreaks: FeedBuyerStreak[] = rescored.map((s) => ({
      person: s.person,
      personKey: s.personKey,
      source: s.source,
      memberSlug: s.memberSlug,
      occasions: s.occasions,
      maxStreak: s.consecutiveStreak,
      currentStreak: s.consecutiveStreak,
      hasOverlap: s.hasSectorOverlap,
      isAveragingDown: s.isAveragingDown,
      lowerPriceTransitions: s.lowerPriceRepeatBuys,
      maxDeclineFirstToLatest: s.declineSinceFirstBuyPct,
    }));

    rows.push({
      ticker: acc.ticker,
      company: acc.company,
      generalSector,
      industryLabels,
      score: breakdown.total,
      breakdown,
      components,
      whyNoteworthy,
      strongestBuyer: strongest,
      buyerSignals: rescored,
      buyOccasions: occasions.length,
      distinctBuyers,
      repeatBuyers,
      overlapBuyCount,
      distinctOverlapBuyers,
      downtrendBuyCount,
      distinctDowntrendBuyers: new Set(
        occasions
          .filter((o) => o.boughtDuringDowntrend)
          .map((o) => o.personKey),
      ).size,
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
    const sa = a.strongestBuyer?.score ?? 0;
    const sb = b.strongestBuyer?.score ?? 0;
    if (sb !== sa) return sb - sa;
    if (b.distinctOverlapBuyers !== a.distinctOverlapBuyers) {
      return b.distinctOverlapBuyers - a.distinctOverlapBuyers;
    }
    return (b.latestBuyDisclosure ?? "").localeCompare(
      a.latestBuyDisclosure ?? "",
    );
  });

  return rows;
}