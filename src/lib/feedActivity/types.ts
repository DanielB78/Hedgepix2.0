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

export type FeedTradeSource = "house" | "senate" | "insider";

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
  /** 20 trading-day return before this purchase (%, null if unknown). */
  return20dBefore: number | null;
  boughtDuringDowntrend: boolean;
  hasSectorOverlap: boolean;
  overlapMatchType: SectorOverlapMatchType | "semantic" | null;
  overlapSimilarity: number | null;
  overlapMemberLabel: string | null;
  overlapTickerLabel: string | null;
  officerTitle: string | null;
  filingUrl: string | null;
};

export type FeedBuyerStreak = {
  person: string | null;
  personKey: string;
  source: FeedTradeSource;
  memberSlug: string | null;
  occasions: FeedBuyOccasion[];
  /** Longest consecutive buy streak intersecting the window (sale breaks). */
  maxStreak: number;
  /** Current open streak ending at the latest buy (0 if last was broken). */
  currentStreak: number;
  hasOverlap: boolean;
};

export type FeedScoreBreakdown = {
  buyOccasion: number;
  repeatBuyer: number;
  overlapBuyer: number;
  downtrendBuy: number;
  currentDowntrend: number;
  total: number;
};

export type FeedTickerRow = {
  ticker: string;
  company: string | null;
  generalSector: string | null;
  industryLabels: string[];
  score: number;
  breakdown: FeedScoreBreakdown;
  buyOccasions: number;
  distinctBuyers: number;
  repeatBuyers: number;
  overlapBuyCount: number;
  distinctOverlapBuyers: number;
  downtrendBuyCount: number;
  distinctDowntrendBuyers: number;
  maxConsecutiveStreak: number;
  currentTrendReturn: number | null;
  isCurrentDowntrend: boolean;
  latestBuyDisclosure: string | null;
  latestBuyTransaction: string | null;
  occasions: FeedBuyOccasion[];
  buyerStreaks: FeedBuyerStreak[];
};

export type FeedFilters = {
  source: FeedSourceFilter;
  /** Niche industry labels (OR). Empty = no sector constraint. */
  nicheLabels: string[];
  trend: FeedTrendFilter;
  overlap: FeedOverlapFilter;
  minBuyers: number;
  minBuys: number;
};

export const EMPTY_FEED_FILTERS: FeedFilters = {
  source: "all",
  nicheLabels: [],
  trend: "all",
  overlap: "all",
  minBuyers: 0,
  minBuys: 0,
};

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

  const minBuyers = Math.max(
    0,
    Number(typeof params.minBuyers === "string" ? params.minBuyers : 0) || 0,
  );
  const minBuys = Math.max(
    0,
    Number(typeof params.minBuys === "string" ? params.minBuys : 0) || 0,
  );

  const nicheLabels =
    typeof params.sectors === "string" && params.sectors.trim()
      ? params.sectors
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  return {
    ...EMPTY_FEED_FILTERS,
    source,
    trend,
    overlap,
    minBuyers,
    minBuys,
    nicheLabels,
  };
}
