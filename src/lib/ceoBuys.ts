import type { CeoStockPurchaseRow } from "@/lib/types";
import { createBrowserSupabase, hasPublicSupabaseConfig } from "@/lib/supabase";

export type CeoBuysFilters = {
  page?: number;
};

export type CeoBuysResult = {
  configured: boolean;
  error: string | null;
  rows: CeoStockPurchaseRow[];
  page: number;
  pageSize: number;
  totalCount: number;
};

const PAGE_SIZE = 50;

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
  return { page };
}

function sortRows(rows: CeoStockPurchaseRow[]): CeoStockPurchaseRow[] {
  return [...rows].sort((a, b) => {
    const fd = String(b.filing_date ?? "").localeCompare(String(a.filing_date ?? ""));
    if (fd !== 0) return fd;
    return String(b.transaction_date ?? "").localeCompare(
      String(a.transaction_date ?? ""),
    );
  });
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { next: { revalidate: 120 } });
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchFromStorage(): Promise<CeoStockPurchaseRow[]> {
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
    .reverse();

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
      all.push(row);
    }
  }
  return sortRows(all);
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
      pageSize: PAGE_SIZE,
      totalCount: 0,
    };
  }

  try {
    const supabase = createBrowserSupabase();
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabase
      .from("ceo_stock_purchases")
      .select(
        "id, source_id, accession_number, ceo_name, officer_title, issuer_name, ticker, security_title, transaction_date, filing_date, shares_purchased, price_per_share, shares_owned_after, ownership_type, filing_url, form_type, quarter, created_at",
        { count: "exact" },
      )
      .order("filing_date", { ascending: false, nullsFirst: false })
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .range(from, to);

    // Prefer Postgres when populated. An empty table still succeeds, so fall
    // back to the public ceo-buys storage snapshot used for historical backfill.
    const tableRows = (data as CeoStockPurchaseRow[] | null) ?? [];
    const tableCount = count ?? 0;
    if (!error && tableCount > 0) {
      return {
        configured: true,
        error: null,
        rows: tableRows,
        page,
        pageSize: PAGE_SIZE,
        totalCount: tableCount,
      };
    }

    const all = await fetchFromStorage();
    if (all.length > 0) {
      return {
        configured: true,
        error: null,
        rows: all.slice(from, from + PAGE_SIZE),
        page,
        pageSize: PAGE_SIZE,
        totalCount: all.length,
      };
    }

    if (!error) {
      return {
        configured: true,
        error: null,
        rows: tableRows,
        page,
        pageSize: PAGE_SIZE,
        totalCount: tableCount,
      };
    }

    return {
      configured: true,
      error: error.message,
      rows: [],
      page,
      pageSize: PAGE_SIZE,
      totalCount: 0,
    };
  } catch (err) {
    return {
      configured: true,
      error: err instanceof Error ? err.message : "Failed to load CEO buys",
      rows: [],
      page,
      pageSize: PAGE_SIZE,
      totalCount: 0,
    };
  }
}
