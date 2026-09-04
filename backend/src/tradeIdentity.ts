import { createHash } from "node:crypto";
import { memberSlug } from "./normalize.js";
import type { Chamber, CongressTrade } from "./types.js";

export type TradeIdentityFields = {
  chamber: Chamber;
  member: string;
  /** Prefer a precomputed slug when the source provides one. */
  memberSlug?: string | null;
  ticker: string | null;
  transactionType: "purchase" | "sale";
  amountLow: number | null;
  amountHigh: number | null;
  transactionDate: string;
  owner: CongressTrade["owner"];
};

/**
 * Cross-source stable id so Kadoa historical rows and InsiderWatch updates
 * collide on the same `source_hash` when the underlying trade matches.
 */
export function stableContentSourceId(fields: TradeIdentityFields): string {
  const slug =
    (fields.memberSlug?.trim() || memberSlug(fields.member)).toLowerCase();
  const basis = [
    fields.chamber,
    slug,
    fields.transactionDate,
    (fields.ticker ?? "").toUpperCase(),
    fields.transactionType,
    fields.amountLow == null ? "" : String(fields.amountLow),
    fields.amountHigh == null ? "" : String(fields.amountHigh),
    fields.owner ?? "",
  ].join("|");
  const hash = createHash("sha256").update(basis).digest("hex").slice(0, 32);
  return `trade:${hash}`;
}

/** Parse US-style or ISO calendar dates into YYYY-MM-DD. */
export function parseFlexibleDate(
  raw: string | null | undefined,
): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

export function parseAmountRangeLabel(raw: string | null | undefined): {
  low: number | null;
  high: number | null;
} {
  if (!raw || typeof raw !== "string") return { low: null, high: null };
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return { low: null, high: null };

  const over = cleaned.match(/^over\s*\$?\s*([\d.]+)/i);
  if (over) {
    const n = Number(over[1]);
    return { low: Number.isFinite(n) ? Math.round(n) : null, high: null };
  }

  const range = cleaned.match(/\$?\s*([\d.]+)\s*[-–—]\s*\$?\s*([\d.]+)/);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    return {
      low: Number.isFinite(low) ? Math.round(low) : null,
      high: Number.isFinite(high) ? Math.round(high) : null,
    };
  }

  const single = cleaned.match(/\$?\s*([\d.]+)/);
  if (single) {
    const n = Number(single[1]);
    if (!Number.isFinite(n)) return { low: null, high: null };
    const rounded = Math.round(n);
    return { low: rounded, high: rounded };
  }
  return { low: null, high: null };
}

export function addUtcDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function utcTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
