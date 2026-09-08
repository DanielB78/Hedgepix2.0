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
const STORAGE_PUBLIC =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string"
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/ceo-buys/purchases.json`
    : null;

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

async function fetchFromStorage(): Promise<CeoStockPurchaseRow[]> {
  if (!STORAGE_PUBLIC) return [];
  const res = await fetch(STORAGE_PUBLIC, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const data = (await res.json()) as CeoStockPurchaseRow[];
  if (!Array.isArray(data)) return [];
  return sortRows(data);
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

    if (!error) {
      return {
        configured: true,
        error: null,
        rows: (data as CeoStockPurchaseRow[] | null) ?? [],
        page,
        pageSize: PAGE_SIZE,
        totalCount: count ?? 0,
      };
    }

    // Table missing / not yet migrated — public Storage snapshot written by backfill.
    const all = await fetchFromStorage();
    const slice = all.slice(from, from + PAGE_SIZE);
    return {
      configured: true,
      error: null,
      rows: slice,
      page,
      pageSize: PAGE_SIZE,
      totalCount: all.length,
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
