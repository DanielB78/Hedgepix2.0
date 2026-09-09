import {
  aggregateCeoActivity,
  filterCeoActivity,
  type CeoActivityCard,
} from "@/lib/ceoAggregate";
import type { CeoStockPurchaseRow } from "@/lib/types";
import { createBrowserSupabase, hasPublicSupabaseConfig } from "@/lib/supabase";

export type CeoBuysFilters = {
  page?: number;
  q?: string;
};

export type CeoBuysResult = {
  configured: boolean;
  error: string | null;
  rows: CeoActivityCard[];
  page: number;
  pageSize: number;
  totalCount: number;
};

/** Two cards per page to match House/Senate layout. */
export const CEO_PAGE_SIZE = 2;

const SELECT_COLUMNS =
  "id, source_id, accession_number, ceo_name, officer_title, issuer_name, ticker, security_title, transaction_date, filing_date, shares_purchased, price_per_share, shares_owned_after, ownership_type, filing_url, form_type, quarter, created_at, raw_source";

function publicObjectUrl(objectPath: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/ceo-buys/${objectPath}`;
}

export function parseCeoBuysFilters(
  params: Record<string, string | string[] | undefined>,
): CeoBuysFilters {
  const pageRaw = typeof params.page === "string" ? params.page : "1";
  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);
  const qRaw = typeof params.q === "string" ? params.q.trim() : "";
  return { page, q: qRaw || undefined };
}

function sortRows(rows: CeoStockPurchaseRow[]): CeoStockPurchaseRow[] {
  return [...rows].sort((a, b) => {
    const fd = String(b.filing_date ?? "").localeCompare(
      String(a.filing_date ?? ""),
    );
    if (fd !== 0) return fd;
    return String(b.transaction_date ?? "").localeCompare(
      String(a.transaction_date ?? ""),
    );
  });
}

function normalizeRow(row: CeoStockPurchaseRow): CeoStockPurchaseRow {
  const fromRaw =
    typeof row.raw_source === "object" &&
    row.raw_source &&
    "trans_code" in row.raw_source
      ? String(
          (row.raw_source as { trans_code?: string }).trans_code ?? "",
        ).toUpperCase()
      : "";
  const fromCol = String(row.transaction_code ?? "").toUpperCase();
  const code = fromCol === "S" || fromRaw === "S" ? "S" : "P";
  return { ...row, transaction_code: code };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchFromStorage(limitQuarters = 8): Promise<CeoStockPurchaseRow[]> {
  const quartersUrl = publicObjectUrl("quarters.json");
  if (!quartersUrl) return [];
  const quarters = await fetchJson<Record<string, { status?: string }>>(
    quartersUrl,
  );
  if (!quarters) return [];

  const successQuarters = Object.entries(quarters)
    .filter(([, meta]) => meta?.status === "success")
    .map(([q]) => q)
    .sort()
    .reverse()
    .slice(0, limitQuarters);

  const chunks = await Promise.all(
    successQuarters.map(async (quarter) => {
      const url = publicObjectUrl(`by-quarter/${quarter}.json`);
      if (!url) return [] as CeoStockPurchaseRow[];
      const rows = await fetchJson<CeoStockPurchaseRow[]>(url);
      return rows ?? [];
    }),
  );

  const seen = new Set<string>();
  const all: CeoStockPurchaseRow[] = [];
  for (const rows of chunks) {
    for (const row of rows) {
      const id = row.source_id || row.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      all.push(normalizeRow(row));
    }
  }
  return sortRows(all);
}

async function fetchFromTable(q?: string): Promise<CeoStockPurchaseRow[] | null> {
  const supabase = createBrowserSupabase();
  const pageSize = q ? 1000 : 800;
  const maxRows = q ? 3000 : 800;
  const all: CeoStockPurchaseRow[] = [];
  let from = 0;
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 9);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  for (;;) {
    let query = supabase
      .from("ceo_stock_purchases")
      .select(SELECT_COLUMNS)
      .order("filing_date", { ascending: false, nullsFirst: false })
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);

    if (q) {
      const safe = q.replace(/[%(),]/g, " ").trim();
      if (safe) {
        query = query.or(
          `ceo_name.ilike.%${safe}%,ticker.ilike.%${safe}%,issuer_name.ilike.%${safe}%`,
        );
      }
    } else {
      query = query.gte("filing_date", cutoffDate);
    }

    const { data, error } = await query;
    if (error) {
      return null;
    }

    const rows = ((data as CeoStockPurchaseRow[] | null) ?? []).map(normalizeRow);
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
    if (from >= maxRows) break;
  }

  return all;
}

export async function fetchCeoBuys(
  filters: CeoBuysFilters = {},
): Promise<CeoBuysResult> {
  const page = filters.page ?? 1;
  if (!hasPublicSupabaseConfig()) {
    return {
      configured: false,
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      rows: [],
      page,
      pageSize: CEO_PAGE_SIZE,
      totalCount: 0,
    };
  }

  try {
    let raw: CeoStockPurchaseRow[] | null = null;
    if (filters.q) {
      raw = await fetchFromTable(filters.q);
      if (!raw || raw.length === 0) {
        // Keep storage fallback tiny to avoid OOM on multi-MB quarter files.
        raw = await fetchFromStorage(2);
        const q = filters.q.toLowerCase();
        raw = raw.filter(
          (row) =>
            row.ceo_name.toLowerCase().includes(q) ||
            (row.ticker ?? "").toLowerCase().includes(q) ||
            (row.issuer_name ?? "").toLowerCase().includes(q),
        );
      }
    } else {
      // Prefer Postgres recent window; avoid loading multi-MB storage blobs by default.
      raw = await fetchFromTable();
      if (!raw || raw.length === 0) {
        raw = await fetchFromStorage(2);
      }
    }

    const cards = filterCeoActivity(aggregateCeoActivity(raw), filters.q);
    const from = (page - 1) * CEO_PAGE_SIZE;

    return {
      configured: true,
      error: null,
      rows: cards.slice(from, from + CEO_PAGE_SIZE),
      page,
      pageSize: CEO_PAGE_SIZE,
      totalCount: cards.length,
    };
  } catch (err) {
    return {
      configured: true,
      error: err instanceof Error ? err.message : "Failed to load CEO activity",
      rows: [],
      page,
      pageSize: CEO_PAGE_SIZE,
      totalCount: 0,
    };
  }
}
