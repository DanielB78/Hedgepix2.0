/**
 * High-confidence CEO title detection for SEC REPORTINGOWNER rows.
 * Requires OFFICER relationship and a title that clearly indicates CEO.
 */

const CEO_POSITIVE =
  /\bchief\s+executive\s+officer\b|\bceo\b|\bpresident\s*(?:&|and|\/)\s*ceo\b|\bceo\s*(?:&|and|\/)\s*president\b/i;

const CEO_NEGATIVE =
  /\bvice\s+ceo\b|\bdeputy\s+ceo\b|\bassistant\s+ceo\b|\bact(?:ing)?\s+ceo\b|\binterim\s+ceo\b/i;

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
