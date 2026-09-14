import { createBrowserSupabase, hasPublicSupabaseConfig } from "@/lib/supabase";

export type Sec13fChange = {
  id: string;
  manager_cik: string;
  manager_name: string | null;
  report_period: string | null;
  ticker: string | null;
  issuer_name: string | null;
  change_type: string;
  shares: number | null;
  share_change: number | null;
  share_change_pct: number | null;
  value_usd: number | null;
};

export type SecOwnership = {
  id: string;
  reporting_person: string | null;
  ticker: string | null;
  target_company: string | null;
  form_type: string;
  ownership_pct: number | null;
  shares_beneficially_owned: number | null;
  filing_date: string | null;
  filing_url: string | null;
  change_type: string | null;
};

export type SecForm144 = {
  id: string;
  filer_name: string | null;
  ticker: string | null;
  issuer_name: string | null;
  shares_proposed: number | null;
  aggregate_market_value: number | null;
  proposed_sale_date: string | null;
  filing_date: string | null;
  filing_url: string | null;
};

export type SecCompanyFiling = {
  id: string;
  company_name: string | null;
  ticker: string | null;
  form_type: string;
  filing_date: string | null;
  items: string | null;
  description: string | null;
  filing_url: string | null;
};

export type SecOffering = {
  id: string;
  issuer_name: string | null;
  ticker: string | null;
  form_type: string;
  filing_date: string | null;
  shares_offered: number | null;
  price: number | null;
  offering_size: number | null;
  filing_url: string | null;
};

export type SecFundamental = {
  id: string;
  ticker: string | null;
  company_name: string | null;
  form_type: string | null;
  period_end: string | null;
  revenue: number | null;
  net_income: number | null;
  eps: number | null;
  revenue_yoy_pct: number | null;
  net_income_yoy_pct: number | null;
  eps_yoy_pct: number | null;
  filing_url: string | null;
};

export type SecNportHolding = {
  id: string;
  fund_name: string | null;
  ticker: string | null;
  issuer_name: string | null;
  shares: number | null;
  value_usd: number | null;
  pct_portfolio: number | null;
  report_date: string | null;
};

function emptyResult<T>(error: string | null = null) {
  return { configured: hasPublicSupabaseConfig(), error, rows: [] as T[] };
}

export async function fetch13fChanges(limit = 100): Promise<{
  configured: boolean;
  error: string | null;
  rows: Sec13fChange[];
}> {
  if (!hasPublicSupabaseConfig()) return emptyResult("Configuration incomplete.");
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("sec_13f_position_changes")
    .select(
      "id,manager_cik,manager_name,report_period,ticker,issuer_name,change_type,shares,share_change,share_change_pct,value_usd",
    )
    .neq("change_type", "UNCHANGED")
    .order("report_period", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    return emptyResult(
      error.message.includes("schema cache") || error.message.includes("sec_13f")
        ? "SEC 13F tables are not set up yet. Apply supabase/migrations/20260914120000_sec_additional_filings.sql."
        : error.message,
    );
  }
  return { configured: true, error: null, rows: (data ?? []) as Sec13fChange[] };
}

export async function fetch13fHoldingsForManager(
  managerCik: string,
  limit = 200,
): Promise<{ configured: boolean; error: string | null; rows: Sec13fChange[] }> {
  // Reuse change shape lightly via holdings query mapped for portfolio view
  if (!hasPublicSupabaseConfig()) return emptyResult("Configuration incomplete.");
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("sec_13f_holdings")
    .select(
      "id,manager_cik,manager_name,report_period,ticker,issuer_name,shares,value_usd",
    )
    .eq("manager_cik", managerCik)
    .order("value_usd", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return emptyResult(error.message);
  const rows = (data ?? []).map((r) => ({
    id: String(r.id),
    manager_cik: String(r.manager_cik),
    manager_name: r.manager_name as string | null,
    report_period: r.report_period as string | null,
    ticker: r.ticker as string | null,
    issuer_name: r.issuer_name as string | null,
    change_type: "HOLDING",
    shares: r.shares as number | null,
    share_change: null,
    share_change_pct: null,
    value_usd: r.value_usd as number | null,
  }));
  return { configured: true, error: null, rows };
}

export async function fetchOwnershipFilings(limit = 100) {
  if (!hasPublicSupabaseConfig()) return emptyResult<SecOwnership>("Configuration incomplete.");
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("sec_large_ownership_filings")
    .select(
      "id,reporting_person,ticker,target_company,form_type,ownership_pct,shares_beneficially_owned,filing_date,filing_url,change_type",
    )
    .order("filing_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    return emptyResult<SecOwnership>(
      error.message.includes("schema cache") || error.message.includes("sec_large")
        ? "SEC ownership tables are not set up yet. Apply the SEC filings migration."
        : error.message,
    );
  }
  return { configured: true, error: null, rows: (data ?? []) as SecOwnership[] };
}

export async function fetchForm144(limit = 100) {
  if (!hasPublicSupabaseConfig()) return emptyResult<SecForm144>("Configuration incomplete.");
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("sec_form144_sales")
    .select(
      "id,filer_name,ticker,issuer_name,shares_proposed,aggregate_market_value,proposed_sale_date,filing_date,filing_url",
    )
    .order("filing_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    return emptyResult<SecForm144>(
      error.message.includes("schema cache") || error.message.includes("sec_form144")
        ? "Form 144 tables are not set up yet. Apply the SEC filings migration."
        : error.message,
    );
  }
  return { configured: true, error: null, rows: (data ?? []) as SecForm144[] };
}

export async function fetchCompanyFilings(opts?: {
  formPrefix?: string;
  ticker?: string;
  limit?: number;
}) {
  if (!hasPublicSupabaseConfig()) return emptyResult<SecCompanyFiling>("Configuration incomplete.");
  const supabase = createBrowserSupabase();
  let q = supabase
    .from("sec_company_filings")
    .select(
      "id,company_name,ticker,form_type,filing_date,items,description,filing_url",
    )
    .order("filing_date", { ascending: false, nullsFirst: false })
    .limit(opts?.limit ?? 100);
  if (opts?.ticker) q = q.eq("ticker", opts.ticker.toUpperCase());
  if (opts?.formPrefix) q = q.ilike("form_type", `${opts.formPrefix}%`);
  const { data, error } = await q;
  if (error) {
    return emptyResult<SecCompanyFiling>(
      error.message.includes("schema cache") || error.message.includes("sec_company")
        ? "SEC company filings tables are not set up yet. Apply the SEC filings migration."
        : error.message,
    );
  }
  return { configured: true, error: null, rows: (data ?? []) as SecCompanyFiling[] };
}

export async function fetchOfferings(limit = 100) {
  if (!hasPublicSupabaseConfig()) return emptyResult<SecOffering>("Configuration incomplete.");
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("sec_offerings")
    .select(
      "id,issuer_name,ticker,form_type,filing_date,shares_offered,price,offering_size,filing_url",
    )
    .order("filing_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    return emptyResult<SecOffering>(
      error.message.includes("schema cache") || error.message.includes("sec_offerings")
        ? "SEC offerings tables are not set up yet. Apply the SEC filings migration."
        : error.message,
    );
  }
  return { configured: true, error: null, rows: (data ?? []) as SecOffering[] };
}

export async function fetchFundamentals(limit = 50) {
  if (!hasPublicSupabaseConfig()) return emptyResult<SecFundamental>("Configuration incomplete.");
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("sec_company_fundamentals")
    .select(
      "id,ticker,company_name,form_type,period_end,revenue,net_income,eps,revenue_yoy_pct,net_income_yoy_pct,eps_yoy_pct,filing_url",
    )
    .order("period_end", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    return emptyResult<SecFundamental>(
      error.message.includes("schema cache") || error.message.includes("fundamentals")
        ? "SEC fundamentals tables are not set up yet. Apply the SEC filings migration."
        : error.message,
    );
  }
  return { configured: true, error: null, rows: (data ?? []) as SecFundamental[] };
}

export async function fetchNportHoldings(limit = 100) {
  if (!hasPublicSupabaseConfig()) return emptyResult<SecNportHolding>("Configuration incomplete.");
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("sec_nport_holdings")
    .select(
      "id,fund_name,ticker,issuer_name,shares,value_usd,pct_portfolio,report_date",
    )
    .order("report_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    return emptyResult<SecNportHolding>(
      error.message.includes("schema cache") || error.message.includes("nport")
        ? "N-PORT tables are not set up yet. Apply the SEC filings migration."
        : error.message,
    );
  }
  return { configured: true, error: null, rows: (data ?? []) as SecNportHolding[] };
}

export function formatShares(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}b`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: absNotation(value),
    maximumFractionDigits: 1,
  }).format(value);
}

function absNotation(value: number): "standard" | "compact" {
  return Math.abs(value) >= 10_000 ? "compact" : "standard";
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  } catch {
    return value;
  }
}

export function changeLabel(changeType: string): string {
  switch (changeType) {
    case "NEW_POSITION":
      return "New Position";
    case "INCREASED":
      return "Increased";
    case "REDUCED":
      return "Reduced";
    case "EXITED":
      return "Exited";
    case "UNCHANGED":
      return "Unchanged";
    case "NEW_STAKE":
      return "New Stake";
    case "STAKE_INCREASED":
      return "Stake Increased";
    case "STAKE_REDUCED":
      return "Stake Reduced";
    case "STAKE_EXITED":
      return "Stake Exited";
    default:
      return changeType.replaceAll("_", " ");
  }
}
