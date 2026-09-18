/**
 * Universal Find Trades row + query model.
 * Derived market/activity metrics are computed server-side once per load.
 */

export type FindTradeSource = "house" | "senate" | "insider";
export type FindTxSide = "buy" | "sale" | "other";
export type TrendDirection = "up" | "down" | "flat";
export type OverlapMatchType = "direct" | "semantic";

/** Precomputed windowed metrics keyed by day count (e.g. 5, 20). */
export type WindowNumberMap = Record<string, number | null>;
export type WindowTrendMap = Record<string, TrendDirection | null>;

export type FindTradeRow = {
  id: string;
  source: FindTradeSource;

  person: string | null;
  personKey: string;
  memberSlug: string | null;
  chamber: "house" | "senate" | null;
  state: string | null;
  officerTitle: string | null;

  ticker: string | null;
  company: string | null;

  transactionType: FindTxSide;
  transactionDate: string | null;
  disclosureDate: string | null;

  /** Congressional disclosure range (exact dollars unknown). */
  disclosedMin: number | null;
  disclosedMax: number | null;
  amountRange: string | null;
  /** Insider exact dollars when shares×price known. */
  exactValue: number | null;
  exactShares: number | null;
  exactPrice: number | null;

  tickerGeneralSector: string | null;
  tickerIndustryLabels: string[];
  memberIndustryLabels: string[];
  memberGeneralSectors: string[];

  hasSectorOverlap: boolean | null;
  overlapMatchType: OverlapMatchType | null;
  overlapSimilarity: number | null;
  overlapMemberLabel: string | null;
  overlapTickerLabel: string | null;

  priceAtTrade: number | null;
  returnSinceTrade: number | null;

  /** % return over N calendar days before/after trade date. */
  returnBefore: WindowNumberMap;
  returnAfter: WindowNumberMap;
  trendBefore: WindowTrendMap;
  trendAfter: WindowTrendMap;

  returnSincePreviousBuy: number | null;
  trendSincePreviousBuy: TrendDirection | null;
  daysSincePreviousBuy: number | null;
  daysSincePreviousSale: number | null;
  daysSinceFirstBuy: number | null;
  consecutiveBuys: number | null;
  additionalBuyAfterDecline: boolean | null;

  /** Prior buys/sales in the N days before this trade (same person+ticker). */
  priorBuys: WindowNumberMap;
  priorSales: WindowNumberMap;
  /** Prior buys that occurred while ticker was in an N-day down/up trend. */
  priorUptrendBuys: WindowNumberMap;
  priorDowntrendBuys: WindowNumberMap;

  /** Ticker-level distinct buyers in N days before this trade's date. */
  distinctCongressBuyers: WindowNumberMap;
  distinctInsiderBuyers: WindowNumberMap;
  distinctHouseBuyers: WindowNumberMap;
  distinctSenateBuyers: WindowNumberMap;
  totalBuysOnTicker: WindowNumberMap;

  filingUrl: string | null;
};

export type FilterFieldType =
  | "text"
  | "enum"
  | "number"
  | "percentage"
  | "money"
  | "date"
  | "boolean"
  | "trend";

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "one_of"
  | "not_one_of"
  | "contains"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "on"
  | "before"
  | "after"
  | "is_true"
  | "is_false"
  | "is_set"
  | "is_not_set";

export type FilterCategory =
  | "Trade"
  | "Person"
  | "Ticker"
  | "Sector"
  | "Sector overlap"
  | "Market behaviour"
  | "Trading activity"
  | "Ticker activity";

export type FilterFieldParam = {
  id: string;
  label: string;
  type: "number" | "enum";
  defaultValue: string | number;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
};

export type FilterFieldDef = {
  id: string;
  label: string;
  category: FilterCategory;
  type: FilterFieldType;
  operators: FilterOperator[];
  /** Path on FindTradeRow, or custom accessor id. */
  path: keyof FindTradeRow | string;
  enumValues?: Array<{ value: string; label: string }>;
  /** When set, value is looked up in a Window*Map using params.window. */
  windowed?: boolean;
  params?: FilterFieldParam[];
  /** Hide from picker until sources support the field. */
  sources?: FindTradeSource[];
  description?: string;
};

export type FilterCondition = {
  /** Stable instance id for React keys / removal. */
  id: string;
  fieldId: string;
  operator: FilterOperator;
  value: string | number | boolean | string[] | null;
  valueTo?: string | number | null;
  params?: Record<string, string | number>;
};

/** Root query: AND across nodes; OR within an or_group. */
export type QueryNode =
  | { type: "condition"; condition: FilterCondition }
  | { type: "or_group"; id: string; conditions: FilterCondition[] };

export type FindTradesQuery = {
  nodes: QueryNode[];
};

export type MatchExplanation = {
  fieldId: string;
  label: string;
  display: string;
  ok: boolean;
};
