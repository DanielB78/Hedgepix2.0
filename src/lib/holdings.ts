import type { MemberHolding, MemberTab } from "./types";

export type { MemberTab };

export const HOLDINGS_DISCLAIMER =
  "Estimated holdings based on disclosed transactions since 2012. These are not exact portfolio values — disclosures use dollar ranges, may omit share counts, and can include spouse or joint account activity.";

export function memberHref(slug: string, tab?: MemberTab): string {
  if (tab === "holdings") {
    return `/members/${encodeURIComponent(slug)}?tab=holdings`;
  }
  return `/members/${encodeURIComponent(slug)}`;
}

export function parseMemberTab(
  value: string | string[] | undefined,
): MemberTab {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return raw === "holdings" ? "holdings" : "activity";
}

function compactMoney(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `$${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return `$${value.toLocaleString("en-US")}`;
}

/** Format an estimated holdings range for display. */
export function formatHoldingsRange(
  low: number | null,
  high: number | null,
): string {
  const displayLow = Math.max(0, low ?? 0);
  const displayHigh = Math.max(0, high ?? displayLow);

  if (displayLow === 0 && displayHigh === 0) return "Estimated $0";
  if (displayLow === displayHigh) {
    return `Estimated ${compactMoney(displayHigh)}`;
  }
  return `Estimated ${compactMoney(displayLow)}–${compactMoney(displayHigh)}`;
}

export function formatActivityType(
  type: MemberHolding["last_activity_type"],
): string {
  if (type === "purchase") return "Purchase";
  if (type === "sale") return "Sale";
  return "Activity";
}

export function formatMemberDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
  } catch {
    return value;
  }
}
