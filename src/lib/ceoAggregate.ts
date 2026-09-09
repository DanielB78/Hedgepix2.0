import type { CeoStockPurchaseRow } from "@/lib/types";

export type CeoActivitySide = "purchase" | "sale";

export type CeoActivityCard = {
  id: string;
  ceo_name: string;
  officer_title: string | null;
  issuer_name: string | null;
  ticker: string | null;
  security_title: string | null;
  transaction_date: string | null;
  filing_date: string | null;
  shares: number | null;
  price_per_share: number | null;
  filing_url: string | null;
  side: CeoActivitySide;
  transaction_count: number;
  legs: CeoStockPurchaseRow[];
};

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function rowSide(row: CeoStockPurchaseRow): CeoActivitySide {
  const code = (row.transaction_code ?? "P").toUpperCase();
  return code === "S" ? "sale" : "purchase";
}

/** Combine same CEO + ticker + side into one card, summing shares. */
export function aggregateCeoActivity(
  rows: CeoStockPurchaseRow[],
): CeoActivityCard[] {
  type Acc = {
    key: string;
    ceo_name: string;
    officer_title: string | null;
    issuer_name: string | null;
    ticker: string | null;
    security_title: string | null;
    transaction_date: string | null;
    filing_date: string | null;
    shares: number;
    priceWeighted: number;
    priceWeight: number;
    filing_url: string | null;
    side: CeoActivitySide;
    legs: CeoStockPurchaseRow[];
  };

  const byKey = new Map<string, Acc>();

  for (const row of rows) {
    const ticker = (row.ticker ?? "").trim().toUpperCase() || null;
    const side = rowSide(row);
    const key = `${normalizeName(row.ceo_name)}|${ticker ?? ""}|${side}`;
    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        key,
        ceo_name: row.ceo_name,
        officer_title: row.officer_title,
        issuer_name: row.issuer_name,
        ticker,
        security_title: row.security_title,
        transaction_date: row.transaction_date,
        filing_date: row.filing_date,
        shares: 0,
        priceWeighted: 0,
        priceWeight: 0,
        filing_url: row.filing_url,
        side,
        legs: [],
      };
      byKey.set(key, acc);
    }

    acc.legs.push(row);
    const shares = row.shares_purchased;
    if (shares != null && Number.isFinite(shares)) {
      acc.shares += shares;
      if (row.price_per_share != null && Number.isFinite(row.price_per_share)) {
        acc.priceWeighted += row.price_per_share * shares;
        acc.priceWeight += shares;
      }
    }

    const tx = row.transaction_date;
    if (tx && (!acc.transaction_date || tx > acc.transaction_date)) {
      acc.transaction_date = tx;
      acc.filing_url = row.filing_url ?? acc.filing_url;
      acc.officer_title = row.officer_title ?? acc.officer_title;
      acc.issuer_name = row.issuer_name ?? acc.issuer_name;
      acc.security_title = row.security_title ?? acc.security_title;
    }
    const fd = row.filing_date;
    if (fd && (!acc.filing_date || fd > acc.filing_date)) {
      acc.filing_date = fd;
    }
  }

  return [...byKey.values()]
    .map((acc) => ({
      id: acc.key,
      ceo_name: acc.ceo_name,
      officer_title: acc.officer_title,
      issuer_name: acc.issuer_name,
      ticker: acc.ticker,
      security_title: acc.security_title,
      transaction_date: acc.transaction_date,
      filing_date: acc.filing_date,
      shares: acc.shares > 0 ? acc.shares : null,
      price_per_share:
        acc.priceWeight > 0 ? acc.priceWeighted / acc.priceWeight : null,
      filing_url: acc.filing_url,
      side: acc.side,
      transaction_count: acc.legs.length,
      legs: acc.legs,
    }))
    .sort((a, b) => {
      const fd = String(b.filing_date ?? "").localeCompare(
        String(a.filing_date ?? ""),
      );
      if (fd !== 0) return fd;
      return String(b.transaction_date ?? "").localeCompare(
        String(a.transaction_date ?? ""),
      );
    });
}

export function filterCeoActivity(
  cards: CeoActivityCard[],
  query: string | undefined,
): CeoActivityCard[] {
  const q = query?.trim().toLowerCase();
  if (!q) return cards;
  const tickerQ = q.toUpperCase();
  return cards.filter((card) => {
    if (card.ticker && card.ticker.toUpperCase().includes(tickerQ)) return true;
    if (card.ceo_name.toLowerCase().includes(q)) return true;
    if (card.issuer_name?.toLowerCase().includes(q)) return true;
    return false;
  });
}
