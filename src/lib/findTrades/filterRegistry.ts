/**
 * Central filter field registry for Find Trades.
 * UI and engine are driven from this list — add fields here to extend.
 */

import type { FilterFieldDef, FilterOperator } from "./types";

const TEXT_OPS: FilterOperator[] = [
  "equals",
  "not_equals",
  "one_of",
  "not_one_of",
  "contains",
  "is_set",
  "is_not_set",
];

const ENUM_OPS: FilterOperator[] = [
  "equals",
  "not_equals",
  "one_of",
  "not_one_of",
  "is_set",
  "is_not_set",
];

const NUM_OPS: FilterOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "is_set",
  "is_not_set",
];

const DATE_OPS: FilterOperator[] = [
  "on",
  "before",
  "after",
  "between",
  "is_set",
  "is_not_set",
];

const BOOL_OPS: FilterOperator[] = ["is_true", "is_false", "is_set", "is_not_set"];

const TREND_OPS: FilterOperator[] = ["equals", "not_equals", "is_set", "is_not_set"];

const WINDOW_PARAM = {
  id: "window",
  label: "Window (days)",
  type: "enum" as const,
  defaultValue: "20",
  options: [
    { value: "1", label: "1 day" },
    { value: "5", label: "5 days" },
    { value: "10", label: "10 days" },
    { value: "20", label: "20 days" },
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
    { value: "180", label: "180 days" },
  ],
};

const ACTIVITY_WINDOW_PARAM = {
  ...WINDOW_PARAM,
  defaultValue: "30",
};

const TREND_VALUES = [
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "flat", label: "Flat" },
];

export const FILTER_FIELD_REGISTRY: FilterFieldDef[] = [
  // ── Trade ──────────────────────────────────────────────
  {
    id: "source",
    label: "Source",
    category: "Trade",
    type: "enum",
    operators: ENUM_OPS,
    path: "source",
    enumValues: [
      { value: "house", label: "House" },
      { value: "senate", label: "Senate" },
      { value: "insider", label: "Insiders" },
    ],
  },
  {
    id: "transaction_type",
    label: "Transaction type",
    category: "Trade",
    type: "enum",
    operators: ENUM_OPS,
    path: "transactionType",
    enumValues: [
      { value: "buy", label: "Buy" },
      { value: "sale", label: "Sale" },
      { value: "other", label: "Other" },
    ],
  },
  {
    id: "transaction_date",
    label: "Transaction date",
    category: "Trade",
    type: "date",
    operators: DATE_OPS,
    path: "transactionDate",
  },
  {
    id: "disclosure_date",
    label: "Filing / disclosure date",
    category: "Trade",
    type: "date",
    operators: DATE_OPS,
    path: "disclosureDate",
  },
  {
    id: "disclosed_min",
    label: "Disclosed value minimum",
    category: "Trade",
    type: "money",
    operators: NUM_OPS,
    path: "disclosedMin",
    description: "Lower bound of congressional disclosure range",
    sources: ["house", "senate"],
  },
  {
    id: "disclosed_max",
    label: "Disclosed value maximum",
    category: "Trade",
    type: "money",
    operators: NUM_OPS,
    path: "disclosedMax",
    description: "Upper bound of congressional disclosure range",
    sources: ["house", "senate"],
  },
  {
    id: "exact_value",
    label: "Exact trade value",
    category: "Trade",
    type: "money",
    operators: NUM_OPS,
    path: "exactValue",
    sources: ["insider"],
  },
  {
    id: "exact_shares",
    label: "Shares",
    category: "Trade",
    type: "number",
    operators: NUM_OPS,
    path: "exactShares",
    sources: ["insider"],
  },
  {
    id: "exact_price",
    label: "Execution price",
    category: "Trade",
    type: "money",
    operators: NUM_OPS,
    path: "exactPrice",
  },

  // ── Person ─────────────────────────────────────────────
  {
    id: "person",
    label: "Member / insider",
    category: "Person",
    type: "text",
    operators: TEXT_OPS,
    path: "person",
  },
  {
    id: "chamber",
    label: "Chamber",
    category: "Person",
    type: "enum",
    operators: ENUM_OPS,
    path: "chamber",
    enumValues: [
      { value: "house", label: "House" },
      { value: "senate", label: "Senate" },
    ],
    sources: ["house", "senate"],
  },
  {
    id: "state",
    label: "State",
    category: "Person",
    type: "text",
    operators: TEXT_OPS,
    path: "state",
    sources: ["house", "senate"],
  },
  {
    id: "officer_title",
    label: "Insider title",
    category: "Person",
    type: "text",
    operators: TEXT_OPS,
    path: "officerTitle",
    sources: ["insider"],
  },

  // ── Ticker ─────────────────────────────────────────────
  {
    id: "ticker",
    label: "Ticker",
    category: "Ticker",
    type: "text",
    operators: TEXT_OPS,
    path: "ticker",
  },
  {
    id: "company",
    label: "Company",
    category: "Ticker",
    type: "text",
    operators: TEXT_OPS,
    path: "company",
  },
  {
    id: "ticker_general_sector",
    label: "Ticker general sector",
    category: "Ticker",
    type: "enum",
    operators: ENUM_OPS,
    path: "tickerGeneralSector",
    enumValues: [
      "Technology",
      "Financials",
      "Healthcare",
      "Energy",
      "Industrials",
      "Consumer",
      "Communication / Media",
      "Real Estate",
      "Materials",
      "Utilities",
      "Other",
    ].map((v) => ({ value: v, label: v })),
  },
  {
    id: "ticker_industry",
    label: "Ticker industry label",
    category: "Ticker",
    type: "text",
    operators: [
      "equals",
      "not_equals",
      "one_of",
      "not_one_of",
      "contains",
      "is_set",
      "is_not_set",
    ],
    path: "tickerIndustryLabels",
    description: "Matches any niche industry label on the ticker",
  },

  // ── Sector ─────────────────────────────────────────────
  {
    id: "member_sector",
    label: "Member sector / industry",
    category: "Sector",
    type: "text",
    operators: TEXT_OPS,
    path: "memberIndustryLabels",
    sources: ["house", "senate"],
  },
  {
    id: "member_general_sector",
    label: "Member general sector",
    category: "Sector",
    type: "enum",
    operators: ENUM_OPS,
    path: "memberGeneralSectors",
    enumValues: [
      "Technology",
      "Financials",
      "Healthcare",
      "Energy",
      "Industrials",
      "Consumer",
      "Communication / Media",
      "Real Estate",
      "Materials",
      "Utilities",
      "Other",
    ].map((v) => ({ value: v, label: v })),
    sources: ["house", "senate"],
  },

  // ── Sector overlap ─────────────────────────────────────
  {
    id: "has_sector_overlap",
    label: "Has sector overlap",
    category: "Sector overlap",
    type: "boolean",
    operators: BOOL_OPS,
    path: "hasSectorOverlap",
    sources: ["house", "senate"],
  },
  {
    id: "overlap_match_type",
    label: "Overlap match type",
    category: "Sector overlap",
    type: "enum",
    operators: ENUM_OPS,
    path: "overlapMatchType",
    enumValues: [
      { value: "direct", label: "Direct" },
      { value: "semantic", label: "Semantic" },
    ],
    sources: ["house", "senate"],
  },
  {
    id: "overlap_similarity",
    label: "Overlap similarity",
    category: "Sector overlap",
    type: "number",
    operators: NUM_OPS,
    path: "overlapSimilarity",
    sources: ["house", "senate"],
  },

  // ── Market behaviour ───────────────────────────────────
  {
    id: "price_at_trade",
    label: "Stock price at trade",
    category: "Market behaviour",
    type: "money",
    operators: NUM_OPS,
    path: "priceAtTrade",
  },
  {
    id: "return_before",
    label: "Return before trade",
    category: "Market behaviour",
    type: "percentage",
    operators: NUM_OPS,
    path: "returnBefore",
    windowed: true,
    params: [WINDOW_PARAM],
  },
  {
    id: "return_after",
    label: "Return after trade",
    category: "Market behaviour",
    type: "percentage",
    operators: NUM_OPS,
    path: "returnAfter",
    windowed: true,
    params: [WINDOW_PARAM],
  },
  {
    id: "return_since_trade",
    label: "Return since trade",
    category: "Market behaviour",
    type: "percentage",
    operators: NUM_OPS,
    path: "returnSinceTrade",
  },
  {
    id: "trend_before",
    label: "Trend before trade",
    category: "Market behaviour",
    type: "trend",
    operators: TREND_OPS,
    path: "trendBefore",
    windowed: true,
    params: [WINDOW_PARAM],
    enumValues: TREND_VALUES,
  },
  {
    id: "trend_after",
    label: "Trend after trade",
    category: "Market behaviour",
    type: "trend",
    operators: TREND_OPS,
    path: "trendAfter",
    windowed: true,
    params: [WINDOW_PARAM],
    enumValues: TREND_VALUES,
  },
  {
    id: "return_since_previous_buy",
    label: "Return since previous buy",
    category: "Market behaviour",
    type: "percentage",
    operators: NUM_OPS,
    path: "returnSincePreviousBuy",
  },
  {
    id: "trend_since_previous_buy",
    label: "Trend since previous buy",
    category: "Market behaviour",
    type: "trend",
    operators: TREND_OPS,
    path: "trendSincePreviousBuy",
    enumValues: TREND_VALUES,
  },

  // ── Trading activity ───────────────────────────────────
  {
    id: "prior_buys",
    label: "Number of previous buys",
    category: "Trading activity",
    type: "number",
    operators: NUM_OPS,
    path: "priorBuys",
    windowed: true,
    params: [ACTIVITY_WINDOW_PARAM],
    description: "Buys of same ticker by same person in prior N days",
  },
  {
    id: "prior_sales",
    label: "Number of previous sales",
    category: "Trading activity",
    type: "number",
    operators: NUM_OPS,
    path: "priorSales",
    windowed: true,
    params: [ACTIVITY_WINDOW_PARAM],
  },
  {
    id: "prior_uptrend_buys",
    label: "Number of buys during uptrend",
    category: "Trading activity",
    type: "number",
    operators: NUM_OPS,
    path: "priorUptrendBuys",
    windowed: true,
    params: [
      {
        ...WINDOW_PARAM,
        id: "trendWindow",
        label: "Trend window (days)",
        defaultValue: "20",
      },
    ],
    description: "Prior buys while ticker was in an N-day uptrend",
  },
  {
    id: "prior_downtrend_buys",
    label: "Number of buys during downtrend",
    category: "Trading activity",
    type: "number",
    operators: NUM_OPS,
    path: "priorDowntrendBuys",
    windowed: true,
    params: [
      {
        ...WINDOW_PARAM,
        id: "trendWindow",
        label: "Trend window (days)",
        defaultValue: "20",
      },
    ],
    description: "Prior buys while ticker was in an N-day downtrend",
  },
  {
    id: "days_since_previous_buy",
    label: "Days since previous buy",
    category: "Trading activity",
    type: "number",
    operators: NUM_OPS,
    path: "daysSincePreviousBuy",
  },
  {
    id: "days_since_previous_sale",
    label: "Days since previous sale",
    category: "Trading activity",
    type: "number",
    operators: NUM_OPS,
    path: "daysSincePreviousSale",
  },
  {
    id: "days_since_first_buy",
    label: "Days since first position entry",
    category: "Trading activity",
    type: "number",
    operators: NUM_OPS,
    path: "daysSinceFirstBuy",
  },
  {
    id: "consecutive_buys",
    label: "Consecutive buys",
    category: "Trading activity",
    type: "number",
    operators: NUM_OPS,
    path: "consecutiveBuys",
    description: "Successive buys without an intervening sale",
  },
  {
    id: "additional_buy_after_decline",
    label: "Additional purchase after price decline",
    category: "Trading activity",
    type: "boolean",
    operators: BOOL_OPS,
    path: "additionalBuyAfterDecline",
  },

  // ── Ticker activity ────────────────────────────────────
  {
    id: "distinct_congress_buyers",
    label: "Distinct congressional buyers",
    category: "Ticker activity",
    type: "number",
    operators: NUM_OPS,
    path: "distinctCongressBuyers",
    windowed: true,
    params: [ACTIVITY_WINDOW_PARAM],
  },
  {
    id: "distinct_insider_buyers",
    label: "Distinct insider buyers",
    category: "Ticker activity",
    type: "number",
    operators: NUM_OPS,
    path: "distinctInsiderBuyers",
    windowed: true,
    params: [ACTIVITY_WINDOW_PARAM],
  },
  {
    id: "distinct_house_buyers",
    label: "House buyers",
    category: "Ticker activity",
    type: "number",
    operators: NUM_OPS,
    path: "distinctHouseBuyers",
    windowed: true,
    params: [ACTIVITY_WINDOW_PARAM],
  },
  {
    id: "distinct_senate_buyers",
    label: "Senate buyers",
    category: "Ticker activity",
    type: "number",
    operators: NUM_OPS,
    path: "distinctSenateBuyers",
    windowed: true,
    params: [ACTIVITY_WINDOW_PARAM],
  },
  {
    id: "total_buys_on_ticker",
    label: "Total qualifying buys",
    category: "Ticker activity",
    type: "number",
    operators: NUM_OPS,
    path: "totalBuysOnTicker",
    windowed: true,
    params: [ACTIVITY_WINDOW_PARAM],
  },
];

export const FILTER_FIELD_BY_ID = new Map(
  FILTER_FIELD_REGISTRY.map((f) => [f.id, f]),
);

export const FILTER_CATEGORIES = [
  "Trade",
  "Person",
  "Ticker",
  "Sector",
  "Sector overlap",
  "Market behaviour",
  "Trading activity",
  "Ticker activity",
] as const;

export function searchFilterFields(query: string): FilterFieldDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return FILTER_FIELD_REGISTRY;
  return FILTER_FIELD_REGISTRY.filter((f) => {
    const hay = `${f.label} ${f.category} ${f.id} ${f.description ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

export function operatorLabel(op: FilterOperator): string {
  switch (op) {
    case "equals":
      return "equals";
    case "not_equals":
      return "does not equal";
    case "one_of":
      return "is one of";
    case "not_one_of":
      return "is not one of";
    case "contains":
      return "contains";
    case "eq":
      return "=";
    case "neq":
      return "≠";
    case "gt":
      return ">";
    case "gte":
      return "≥";
    case "lt":
      return "<";
    case "lte":
      return "≤";
    case "between":
      return "between";
    case "on":
      return "on";
    case "before":
      return "before";
    case "after":
      return "after";
    case "is_true":
      return "is yes";
    case "is_false":
      return "is no";
    case "is_set":
      return "is set";
    case "is_not_set":
      return "is not set";
    default:
      return op;
  }
}

export const RETURN_WINDOWS = [1, 5, 10, 20, 30, 90, 180] as const;
export const TREND_WINDOWS = [5, 10, 20, 30, 90] as const;
export const ACTIVITY_WINDOWS = [7, 14, 30, 90, 180] as const;
export const FLAT_THRESHOLD_PCT = 0.5;
