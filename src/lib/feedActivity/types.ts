import type { SectorOverlapMatchType } from "@/lib/sectorOverlap";

export type FeedTimeframe = "3m" | "6m" | "1y";

export type FeedSourceFilter =
  | "all"
  | "congress"
  | "house"
  | "senate"
  | "insiders";

export type FeedTrendFilter = "all" | "down" | "up";

export type FeedOverlapFilter = "all" | "has_overlap";

export type FeedYesNoFilter = "all" | "yes" | "no";

export type FeedTradeSource = "house" | "senate" | "insider";

export type FeedPositionKind = "new" | "adding" | "unknown";

export type FeedOverlapBand =
  | "direct"
  | "very_high"
  | "high"
  | "moderate"
  | "none";

export type FeedBuyOccasion = {
  key: string;
  person: string | null;
  personKey: string;
  memberSlug: string | null;
  source: FeedTradeSource;
  ticker: string;
  company: string | null;
  transactionDate: string;
  disclosureDate: string | null;
  amountRange: string | null;
  disclosedMin: number | null;
  disclosedMax: number | null;
  exactValue: number | null;
  purchaseEstimate: number | null;
  purchaseEstimateIsApproximate: boolean;
  priceAtTrade: number | null;
  return20dBefore: number | null;
  boughtDuringDowntrend: boolean;
  personSizeRatio: number | null;
  isUnusuallyLarge: boolean;
  positionKind: FeedPositionKind;
  isAveragingDownStep: boolean;
  hasSectorOverlap: boolean;
  overlapMatchType: SectorOverlapMatchType | "semantic" | null;
  overlapSimilarity: number | null;
  overlapMemberLabel: string | null;
  overlapTickerLabel: string | null;
  officerTitle: string | null;
  filingUrl: string | null;
  recencyWeight: number;
};

export type FeedBuyerTickerSignal = {
  person: string | null;
  personKey: string;
  source: FeedTradeSource;
  memberSlug: string | null;
  officerTitle: string | null;
  score: number;
  hasSectorOverlap: boolean;
  overlapBand: FeedOverlapBand;
  overlapMatchType: SectorOverlapMatchType | "semantic" | null;
  overlapSimilarity: number | null;
  overlapMemberLabel: string | null;
  overlapTickerLabel: string | null;
  buyCount: number;
  consecutiveStreak: number;
  lowerPriceRepeatBuys: number;
  declineSinceFirstBuyPct: number | null;
  isAveragingDown: boolean;
  downtrendBuys: number;
  unusuallyLargeBuys: number;
  avgRecencyWeight: number;
  latestDisclosure: string | null;
  occasions: FeedBuyOccasion[];
  whyLines: string[];
};

export type FeedBuyerStreak = {
  person: string | null;
  personKey: string;
  source: FeedTradeSource;
  memberSlug: string | null;
  occasions: FeedBuyOccasion[];
  maxStreak: number;
  currentStreak: number;
  hasOverlap: boolean;
  isAveragingDown: boolean;
  lowerPriceTransitions: number;
  maxDeclineFirstToLatest: number | null;
};

export type FeedScoreBreakdown = {
  bestBuyerScore: number;
  secondBuyerContribution: number;
  additionalBuyerContribution: number;
  distinctBuyerContext: number;
  total: number;
};

export type FeedScoreComponents = {
  buy_occasions: number;
  distinct_buyers: number;
  repeat_buyers: number;
  max_consecutive_streak: number;
  sector_overlap_buyers: number;
  downtrend_buys: number;
  buyers_last_14d: number;
  buyers_last_30d: number;
  buys_last_14d: number;
  buys_last_30d: number;
  unusually_large_buys: number;
  averaging_down_buyers: number;
  new_position_buyers: number;
  adding_buyers: number;
  return_20d: number | null;
  benchmark_return_20d: number | null;
  relative_market_return_20d: number | null;
  sector_benchmark_return_20d: number | null;
  relative_sector_return_20d: number | null;
  activity_ratio: number | null;
  active_source_types: string[];
  avg_recency_weight: number;
  strongest_buyer: string | null;
  strongest_buyer_score: number;
  overlap_band: FeedOverlapBand | null;
  overlap_similarity: number | null;
};

export type FeedTickerRow = {
  ticker: string;
  company: string | null;
  generalSector: string | null;
  industryLabels: string[];
  score: number;
  breakdown: FeedScoreBreakdown;
  components: FeedScoreComponents;
  whyNoteworthy: string[];
  strongestBuyer: FeedBuyerTickerSignal | null;
  buyerSignals: FeedBuyerTickerSignal[];
  buyOccasions: number;
  distinctBuyers: number;
  repeatBuyers: number;
  overlapBuyCount: number;
  distinctOverlapBuyers: number;
  downtrendBuyCount: number;
  distinctDowntrendBuyers: number;
  maxConsecutiveStreak: number;
  buyersLast14d: number;
  buyersLast30d: number;
  buysLast14d: number;
  buysLast30d: number;
  unusuallyLargeBuyCount: number;
  averagingDownBuyers: number;
  newPositionBuyers: number;
  addingBuyers: number;
  activityRatio: number | null;
  activeSourceTypes: FeedTradeSource[];
  currentTrendReturn: number | null;
  isCurrentDowntrend: boolean;
  marketBenchmarkReturn: number | null;
  relativeMarketReturn: number | null;
  sectorBenchmarkReturn: number | null;
  relativeSectorReturn: number | null;
  latestBuyDisclosure: string | null;
  latestBuyTransaction: string | null;
  occasions: FeedBuyOccasion[];
  buyerStreaks: FeedBuyerStreak[];
};

export type FeedFilters = {
  source: FeedSourceFilter;
  nicheLabels: string[];
  trend: FeedTrendFilter;
  overlap: FeedOverlapFilter;
  minBuyers: number;
  minBuys: number;
  minRepeatBuyers: number;
  minOverlapBuyers: number;
  minBuyers30d: number;
  minActivityRatio: number;
  averagingDown: FeedYesNoFilter;
  maxRelativeSectorPct: number | null;
  crossSource: FeedYesNoFilter;
};

export const EMPTY_FEED_FILTERS: FeedFilters = {
  source: "all",
  nicheLabels: [],
  trend: "all",
  overlap: "all",
  minBuyers: 0,
  minBuys: 0,
  minRepeatBuyers: 0,
  minOverlapBuyers: 0,
  minBuyers30d: 0,
  minActivityRatio: 0,
  averagingDown: "all",
  maxRelativeSectorPct: null,
  crossSource: "all",
};

function parseYesNo(raw: string): FeedYesNoFilter {
  if (raw === "yes" || raw === "1" || raw === "true") return "yes";
  if (raw === "no" || raw === "0" || raw === "false") return "no";
  return "all";
}

export function parseFeedFilters(
  params: Record<string, string | string[] | undefined>,
): FeedFilters {
  const src =
    typeof params.src === "string" ? params.src.trim().toLowerCase() : "all";
  const source: FeedSourceFilter =
    src === "congress" ||
    src === "house" ||
    src === "senate" ||
    src === "insiders"
      ? src
      : "all";

  const trendRaw =
    typeof params.trend === "string" ? params.trend.trim().toLowerCase() : "";
  const trend: FeedTrendFilter =
    trendRaw === "down" || trendRaw === "up" ? trendRaw : "all";

  const overlap: FeedOverlapFilter =
    params.overlap === "1" || params.overlap === "has_overlap"
      ? "has_overlap"
      : "all";

  const num = (key: string) =>
    Math.max(
      0,
      Number(typeof params[key] === "string" ? params[key] : 0) || 0,
    );

  const nicheLabels =
    typeof params.sectors === "string" && params.sectors.trim()
      ? params.sectors
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const relRaw =
    typeof params.maxRelSector === "string" ? params.maxRelSector.trim() : "";
  const maxRelativeSectorPct =
    relRaw === ""
      ? null
      : Number.isFinite(Number(relRaw))
        ? Number(relRaw)
        : null;

  return {
    ...EMPTY_FEED_FILTERS,
    source,
    trend,
    overlap,
    minBuyers: num("minBuyers"),
    minBuys: num("minBuys"),
    minRepeatBuyers: num("minRepeat"),
    minOverlapBuyers: num("minOverlap"),
    minBuyers30d: num("minBuyers30d"),
    minActivityRatio: num("minAct"),
    averagingDown: parseYesNo(
      typeof params.avgDown === "string" ? params.avgDown.toLowerCase() : "",
    ),
    maxRelativeSectorPct,
    crossSource: parseYesNo(
      typeof params.crossSrc === "string" ? params.crossSrc.toLowerCase() : "",
    ),
    nicheLabels,
  };
}
