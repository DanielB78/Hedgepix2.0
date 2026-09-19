/**
 * Curated ticker → industry labels (user-provided classifications).
 * Prefer these for UI chips and sector mix charts over heuristic SEC maps.
 */
import labels from "@/data/tickerIndustryLabels.json";

export type TickerIndustryLabel = {
  company: string;
  industries: string[];
  primary_industry: string;
};

const LABEL_MAP = labels as Record<string, TickerIndustryLabel>;

/** Broad buckets for market-share charts. */
export type IndustrySector =
  | "Technology"
  | "Financials"
  | "Health Care"
  | "Consumer"
  | "Industrials"
  | "Energy"
  | "Real Estate"
  | "Funds"
  | "Other";

const SECTOR_RULES: Array<{ re: RegExp; sector: IndustrySector }> = [
  {
    re: /\b(bank|lending|credit|broker|exchange|asset management|investment|insurance|fintech|payment|capital market|mortgage|wealth|securities)\b/i,
    sector: "Financials",
  },
  {
    re: /\b(software|semiconductor|chip|cloud|cyber|artificial intelligence|\bai\b|it consulting|saas|data.?center|electronics|computer|technology|internet|e-?commerce|digital|advertising tech|video game|streaming|data storage)\b/i,
    sector: "Technology",
  },
  {
    re: /\b(pharma|biotech|medical|health|hospital|diagnostic|therapeut|drug|life.?science|clinical)\b/i,
    sector: "Health Care",
  },
  {
    re: /\b(oil|gas|energy|pipeline|fuel|solar|wind|nuclear|utility|utilities|power)\b/i,
    sector: "Energy",
  },
  {
    re: /\b(aerospace|defense|industrial|machinery|construction|manufactur|logistics|rail|airline|shipping|equipment|chemical|materials|mining|steel|copper|metal|plumbing|packaging|pest control|water-infrastructure|funeral|education)\b/i,
    sector: "Industrials",
  },
  {
    re: /\b(retail|consumer|apparel|food|beverage|restaurant|hotel|travel|auto|cosmetic|household|grocery|entertainment|media|telecom|communication)\b/i,
    sector: "Consumer",
  },
  {
    re: /\b(real estate|property|reit|lodging)\b/i,
    sector: "Real Estate",
  },
  {
    re: /\b(etf|fund|index)\b/i,
    sector: "Funds",
  },
];

export function getTickerIndustryLabel(
  ticker: string | null | undefined,
): TickerIndustryLabel | null {
  if (!ticker) return null;
  return LABEL_MAP[ticker.trim().toUpperCase()] ?? null;
}

export function industrySectorFromText(
  primary: string | null | undefined,
  industries: string[] | null | undefined = [],
): IndustrySector {
  const text = [primary ?? "", ...(industries ?? [])].join(" ").trim();
  if (!text) return "Other";
  for (const rule of SECTOR_RULES) {
    if (rule.re.test(text)) return rule.sector;
  }
  return "Other";
}

/** Chip text next to a ticker — primary industry from curated map. */
export function curatedIndustryChip(
  ticker: string | null | undefined,
): string | null {
  const row = getTickerIndustryLabel(ticker);
  const label = row?.primary_industry?.trim();
  return label || null;
}

export function curatedSector(
  ticker: string | null | undefined,
): IndustrySector | null {
  const row = getTickerIndustryLabel(ticker);
  if (!row) return null;
  return industrySectorFromText(row.primary_industry, row.industries);
}

export function allCuratedTickers(): string[] {
  return Object.keys(LABEL_MAP);
}

export function curatedLabelEntries(): Array<
  [string, TickerIndustryLabel]
> {
  return Object.entries(LABEL_MAP);
}
