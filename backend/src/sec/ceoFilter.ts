/**
 * Named-officer title detection for SEC REPORTINGOWNER rows.
 * Requires OFFICER relationship and a C-suite / president-level title
 * (CEO, CFO, COO, CTO, and other Chief * Officer roles — not VP-only).
 */

const CEO_POSITIVE =
  /\bchief\s+executive\s+officer\b|\bceo\b|\bpresident\s*(?:&|and|\/)\s*ceo\b|\bceo\s*(?:&|and|\/)\s*president\b/i;

const CEO_NEGATIVE =
  /\bvice\s+ceo\b|\bdeputy\s+ceo\b|\bassistant\s+ceo\b|\bact(?:ing)?\s+ceo\b|\binterim\s+ceo\b/i;

/** CFO, COO, CTO, and other common C-suite abbreviations / spelled-out titles. */
const NAMED_OFFICER_POSITIVE =
  /\bchief\s+[a-z][a-z\s/&-]*\s+officer\b|\bcfo\b|\bcoo\b|\bcto\b|\bcmo\b|\bclo\b|\bcio\b|\bcao\b|\bcco\b|\bcro\b|\bcpo\b|\bceo\b|\bpresident\b|\bgeneral\s+counsel\b|\btreasurer\b|\bsecretary\b|\bcontroller\b/i;

export function isOfficerRelationship(relationship: string | null | undefined): boolean {
  const parts = String(relationship ?? "")
    .split(/[,|/;]/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  return parts.includes("OFFICER");
}

export function isCeoOfficerTitle(
  title: string | null | undefined,
  relationship: string | null | undefined,
): boolean {
  if (!isOfficerRelationship(relationship)) return false;
  const t = String(title ?? "").trim();
  if (!t) return false;
  if (!CEO_POSITIVE.test(t)) return false;
  if (CEO_NEGATIVE.test(t)) return false;
  return true;
}

/**
 * CEO, CFO, COO, and other named officers (not director-only / VP-only).
 * Used when ingesting Form 4 rows into ceo_stock_purchases.
 */
export function isNamedOfficerTitle(
  title: string | null | undefined,
  relationship: string | null | undefined,
): boolean {
  if (!isOfficerRelationship(relationship)) return false;
  const t = String(title ?? "").trim();
  if (!t) return false;
  if (isCeoOfficerTitle(t, relationship)) return true;

  // Interim / acting C-suite or president — skip until confirmed permanent.
  if (
    /\b(?:act(?:ing)?|interim)\s+(?:ceo|cfo|coo|cto|cmo|clo|cio|cao|cco|cro|cpo|president)\b/i.test(
      t,
    )
  ) {
    return false;
  }

  // VP-only (no concurrent C-suite token).
  if (
    /\bvice\s+president\b|\b\sv\.?\s*p\.?\b/i.test(t) &&
    !/\bchief\b|\bcfo\b|\bcoo\b|\bcto\b|\bcmo\b|\bclo\b|\bcio\b|\bceo\b/i.test(t)
  ) {
    return false;
  }

  return NAMED_OFFICER_POSITIVE.test(t);
}

/** Non-derivative Table I titles that look like publicly traded stock. */
const STOCKISH =
  /\bcommon\s+stock\b|\bordinary\s+shares?\b|\bclass\s+[a-z]\s+common\b|\bcommon\s+shares?\b|\bordinary\s+share\b/i;

const NONSTOCK =
  /\b(option|warrant|rsu|restricted\s+stock\s+unit|phantom|preferred|debt|note|bond|convertible|right to buy|depositary)\b/i;

export function isPublicStockSecurityTitle(title: string | null | undefined): boolean {
  const t = String(title ?? "").trim();
  if (!t) return false;
  if (NONSTOCK.test(t) && !STOCKISH.test(t)) return false;
  return STOCKISH.test(t) || /\bcommon\b|\bordinary\b|\bclass\s+[a-z]\b/i.test(t);
}
