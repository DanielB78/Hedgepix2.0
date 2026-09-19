/**
 * Aggregate trades into ticker-level Feed rankings.
 * Transparent score from FEED_WEIGHTS — no ML.
 */

import { normalizeTransactionType } from "@/lib/advancedTradeFilters";
import { parentsForNicheLabel } from "@/lib/generalSectors";
import { tickerIndustryLabelsForFilter } from "@/lib/advancedTradeFilters";
import { getTickerIndustryLabel } from "@/lib/tickerIndustry";
import type { PriceSeries } from "@/lib/findTrades/derivedMetrics";
import type { SectorOverlapResult } from "@/lib/sectorOverlap";
import {
  FEED_MIN_BUY_OCCASIONS,
  FEED_WEIGHTS,
} from "./weights";
import {
  currentTradingDayReturn,
  tradingDayReturnBefore,
} from "./priceTrend";
import type {
  FeedBuyOccasion,
  FeedBuyerStreak,
  FeedFilters,
  FeedScoreBreakdown,
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

type ChronoTrade = FeedRawTrade & {
  txDate: string;
  discDate: string;
  tickerNorm: string;
};

/**
 * Compute consecutive buy streaks for one person+ticker chronology.
 * Sales break streaks. Same-day buys collapse to one occasion for streak length.
 */
export function computeBuyStreaks(
  chrono: Array<{ txDate: string; isBuy: boolean; occasionKey: string }>,
): { maxStreak: number; currentStreak: number; occasionOrder: string[] } {
  // Collapse to unique occasion keys in date order
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
  // Current streak = trailing buy run
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

function scoreRow(input: {
  buyOccasions: number;
  repeatBuyers: number;
  distinctOverlapBuyers: number;
  downtrendBuyCount: number;
  isCurrentDowntrend: boolean;
}): FeedScoreBreakdown {
  const buyOccasion = input.buyOccasions * FEED_WEIGHTS.buyOccasion;
  const repeatBuyer = input.repeatBuyers * FEED_WEIGHTS.repeatBuyer;
  const overlapBuyer =
    input.distinctOverlapBuyers * FEED_WEIGHTS.overlapBuyer;
  const downtrendBuy = input.downtrendBuyCount * FEED_WEIGHTS.downtrendBuy;
  const currentDowntrend = input.isCurrentDowntrend
    ? FEED_WEIGHTS.currentDowntrend
    : 0;
  return {
    buyOccasion,
    repeatBuyer,
    overlapBuyer,
    downtrendBuy,
    currentDowntrend,
    total:
      buyOccasion +
      repeatBuyer +
      overlapBuyer +
      downtrendBuy +
      currentDowntrend,
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
  };
  const minOccasions = opts.minBuyOccasions ?? FEED_MIN_BUY_OCCASIONS;
  const windowCutoff = cutoffDateFromDays(
    timeframeDays(opts.timeframe),
    opts.now,
  );

  // Normalize + keep buys/sales with dates for streak continuity
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

  // Group all trades by person+ticker for streak calc
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
      }
    >;
  };

  const byTicker = new Map<string, Acc>();

  for (const [ptKey, list] of byPersonTicker) {
    const streakInput = list.map((t) => ({
      txDate: t.txDate,
      isBuy: normalizeTransactionType(t.transactionType) === "buy",
      occasionKey: occasionKey(t.personKey, t.tickerNorm, t.txDate),
    }));
    const streaks = computeBuyStreaks(streakInput);

    for (const t of list) {
      if (normalizeTransactionType(t.transactionType) !== "buy") continue;

      // Qualifying window: disclosure_date inside timeframe
      if (t.discDate < windowCutoff) continue;

      const series = seriesByTicker.get(t.tickerNorm) ?? [];
      const ret20 = tradingDayReturnBefore(series, t.txDate);
      const boughtDuringDowntrend = ret20 != null && ret20 < 0;
      const hasOverlap = t.hasSectorOverlap === true;

      let overlapMatchType: FeedBuyOccasion["overlapMatchType"] = null;
      if (t.overlapMatchType === "direct") overlapMatchType = "direct";
      else if (
        t.overlapMatchType === "embedding" ||
        t.overlapMatchType === "semantic"
      ) {
        overlapMatchType = "semantic";
      }

      const oKey = occasionKey(t.personKey, t.tickerNorm, t.txDate);
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
          return20dBefore: ret20,
          boughtDuringDowntrend,
          hasSectorOverlap: hasOverlap,
          overlapMatchType,
          overlapSimilarity: t.overlapSimilarity,
          overlapMemberLabel: t.overlapMemberLabel,
          overlapTickerLabel: t.overlapTickerLabel,
          officerTitle: t.officerTitle,
          filingUrl: t.filingUrl,
        });
      } else if (hasOverlap) {
        // Prefer overlap annotation if duplicate lots
        const existing = acc.occasions.get(oKey)!;
        if (!existing.hasSectorOverlap) {
          existing.hasSectorOverlap = true;
          existing.overlapMatchType = overlapMatchType;
          existing.overlapSimilarity = t.overlapSimilarity;
          existing.overlapMemberLabel = t.overlapMemberLabel;
          existing.overlapTickerLabel = t.overlapTickerLabel;
        }
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
      });
    }

    void ptKey;
  }

  const rows: FeedTickerRow[] = [];

  for (const acc of byTicker.values()) {
    const occasions = [...acc.occasions.values()].sort((a, b) =>
      b.transactionDate.localeCompare(a.transactionDate),
    );
    if (occasions.length < minOccasions) continue;

    // Latest qualifying buy must be in window (already filtered), but
    // double-check disclosure
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
    for (const meta of acc.buyerMeta.values()) {
      if (meta.maxStreak > maxConsecutiveStreak) {
        maxConsecutiveStreak = meta.maxStreak;
      }
    }

    const series = seriesByTicker.get(acc.ticker) ?? [];
    const currentTrendReturn = currentTradingDayReturn(series);
    const isCurrentDowntrend =
      currentTrendReturn != null && currentTrendReturn < 0;

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

    const breakdown = scoreRow({
      buyOccasions: occasions.length,
      repeatBuyers,
      distinctOverlapBuyers,
      downtrendBuyCount,
      isCurrentDowntrend,
    });

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
      });
    }
    buyerStreaks.sort((a, b) => {
      if (b.maxStreak !== a.maxStreak) return b.maxStreak - a.maxStreak;
      return b.occasions.length - a.occasions.length;
    });

    rows.push({
      ticker: acc.ticker,
      company: acc.company,
      generalSector:
        generalParents.size > 0 ? [...generalParents][0]! : null,
      industryLabels,
      score: breakdown.total,
      breakdown,
      buyOccasions: occasions.length,
      distinctBuyers,
      repeatBuyers,
      overlapBuyCount,
      distinctOverlapBuyers,
      downtrendBuyCount,
      distinctDowntrendBuyers,
      maxConsecutiveStreak,
      currentTrendReturn,
      isCurrentDowntrend,
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

/** Map FindTradeRow-like / overlap map into FeedRawTrade. */
export function toFeedRawTrade(
  row: {
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
    overlapMatchType: "direct" | "semantic" | null;
    overlapSimilarity: number | null;
    overlapMemberLabel: string | null;
    overlapTickerLabel: string | null;
  },
  overlap?: SectorOverlapResult | null,
): FeedRawTrade {
  const has =
    overlap?.has_sector_overlap === true || row.hasSectorOverlap === true;
  let matchType: FeedRawTrade["overlapMatchType"] = row.overlapMatchType;
  if (overlap?.match_type === "direct") matchType = "direct";
  if (overlap?.match_type === "embedding") matchType = "embedding";

  return {
    id: row.id,
    source: row.source,
    person: row.person,
    personKey: row.personKey,
    memberSlug: row.memberSlug,
    ticker: row.ticker,
    company: row.company,
    transactionType: row.transactionType,
    transactionDate: row.transactionDate,
    disclosureDate: row.disclosureDate,
    amountRange: row.amountRange,
    disclosedMin: row.disclosedMin,
    disclosedMax: row.disclosedMax,
    exactValue: row.exactValue,
    officerTitle: row.officerTitle,
    filingUrl: row.filingUrl,
    hasSectorOverlap: has ? true : row.hasSectorOverlap,
    overlapMatchType: matchType,
    overlapSimilarity: overlap?.similarity ?? row.overlapSimilarity,
    overlapMemberLabel: overlap?.member_label ?? row.overlapMemberLabel,
    overlapTickerLabel: overlap?.ticker_label ?? row.overlapTickerLabel,
  };
}
