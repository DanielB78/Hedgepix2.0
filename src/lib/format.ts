import type { FeedView } from "@/lib/feed";
import type { Chamber } from "@/lib/types";

export function formatShortDate(value: string | null | undefined): string {
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

export function formatAmountRange(
  low: number | null | undefined,
  high: number | null | undefined,
  label?: string | null,
): string {
  if (label?.trim()) return label.trim();
  if (low == null && high == null) return "—";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  if (low != null && high != null) return `${fmt(low)}–${fmt(high)}`;
  if (low != null) return `${fmt(low)}+`;
  return fmt(high!);
}

export function chamberLabel(chamber: Chamber | null | undefined): string {
  if (chamber === "house") return "House";
  if (chamber === "senate") return "Senate";
  return "Congress";
}

export function tradeVerb(
  type: string | null | undefined,
): "Bought" | "Sold" | "Traded" {
  if (type === "purchase") return "Bought";
  if (type === "sale") return "Sold";
  return "Traded";
}

export function viewHref(view: FeedView): string {
  if (view === "feed") return "/";
  return `/?view=${view}`;
}
