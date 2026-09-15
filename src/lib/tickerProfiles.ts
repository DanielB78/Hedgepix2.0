import { createBrowserSupabase, hasPublicSupabaseConfig } from "./supabase";

export type TickerProfile = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  naics_code: string | null;
  sic_code: string | null;
  source: string | null;
};

/** Prefer detailed industry; fall back to broad sector. */
export function tickerSectorLabel(
  profile: Pick<TickerProfile, "industry" | "sector"> | null | undefined,
): string | null {
  if (!profile) return null;
  return profile.industry?.trim() || profile.sector?.trim() || null;
}

export async function fetchTickerProfiles(
  tickers: string[],
): Promise<Map<string, TickerProfile>> {
  const out = new Map<string, TickerProfile>();
  if (!hasPublicSupabaseConfig()) return out;

  const unique = [
    ...new Set(
      tickers
        .map((t) => t.trim().toUpperCase())
        .filter((t) => t.length > 0 && t.length <= 10),
    ),
  ];
  if (unique.length === 0) return out;

  const supabase = createBrowserSupabase();
  const chunk = 200;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("ticker_profiles")
      .select("ticker, company_name, sector, industry, naics_code, sic_code, source")
      .in("ticker", slice);
    if (error) {
      console.warn("ticker_profiles fetch failed:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const ticker = String(row.ticker ?? "").toUpperCase();
      if (!ticker) continue;
      out.set(ticker, {
        ticker,
        company_name: (row.company_name as string | null) ?? null,
        sector: (row.sector as string | null) ?? null,
        industry: (row.industry as string | null) ?? null,
        naics_code: (row.naics_code as string | null) ?? null,
        sic_code: (row.sic_code as string | null) ?? null,
        source: (row.source as string | null) ?? null,
      });
    }
  }
  return out;
}
