import type { Chamber, CongressTrade, UpstreamTransaction } from "./types.js";

export function memberSlug(member: string): string {
  return member
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function amountRange(
  low: number | null,
  high: number | null,
): string | null {
  if (low === null && high === null) return null;
  if (low !== null && high === null) return `Over $${low.toLocaleString("en-US")}`;
  if (low !== null && high !== null && low === high) {
    return `$${low.toLocaleString("en-US")}`;
  }
  if (low !== null && high !== null) {
    return `$${low.toLocaleString("en-US")} - $${high.toLocaleString("en-US")}`;
  }
  return null;
}

/**
 * Map an upstream House/Senate Transaction into our canonical CongressTrade.
 * Prefixed sourceId becomes the Supabase source_hash.
 */
export function toCongressTrade(
  upstream: UpstreamTransaction,
  chamber: Chamber,
): CongressTrade {
  const upstreamId = upstream.id;
  if (!upstreamId) {
    throw new Error("Upstream transaction missing id (SHA-256)");
  }

  return {
    sourceId: `${chamber}:${upstreamId}`,
    chamber,
    member: upstream.politician,
    ticker: upstream.ticker,
    assetName: upstream.asset_name,
    assetType: upstream.asset_type?.trim() ? upstream.asset_type : null,
    transactionType: upstream.type === "buy" ? "purchase" : "sale",
    amountLow: upstream.amount_min,
    amountHigh: upstream.amount_max,
    transactionDate: upstream.transaction_date,
    disclosureDate: upstream.filing_date,
    owner: upstream.owner ?? null,
    rawSource: upstream,
  };
}

export function normalizeAll(
  upstreams: UpstreamTransaction[],
  chamber: Chamber,
): CongressTrade[] {
  const out: CongressTrade[] = [];
  for (const t of upstreams) {
    try {
      out.push(toCongressTrade(t, chamber));
    } catch (err) {
      console.warn(
        `[${chamber}] Skipping trade without id: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return out;
}
