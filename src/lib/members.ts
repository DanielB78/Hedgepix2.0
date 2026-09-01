import type { CongressTrade, MemberHolding, MemberProfile } from "./types";
import { createBrowserSupabase, hasPublicSupabaseConfig } from "./supabase";
import { PUBLIC_TRADE_COLUMNS, PAGE_SIZE } from "./trades";
import {
  applyListedEquityFallback,
  isMissingListedEquityColumn,
} from "./stockFilter";

export type MemberPageData = {
  profile: MemberProfile | null;
  trades: CongressTrade[];
  holdings: MemberHolding[];
  totalTradeCount: number;
  configured: boolean;
  error: string | null;
};

const HOLDINGS_COLUMNS = [
  "id",
  "member_slug",
  "member",
  "ticker",
  "asset",
  "position_low",
  "position_high",
  "last_activity_type",
  "last_activity_date",
  "last_disclosure_date",
  "computed_at",
].join(", ");

export async function fetchMemberPage(
  slug: string,
  page = 1,
): Promise<MemberPageData> {
  const normalizedSlug = slug.trim().toLowerCase();

  if (!hasPublicSupabaseConfig()) {
    return {
      profile: null,
      trades: [],
      holdings: [],
      totalTradeCount: 0,
      configured: false,
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  const supabase = createBrowserSupabase();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [tradesResultRaw, holdingsResult, profileResultRaw] = await Promise.all([
    supabase
      .from("congress_trades")
      .select(PUBLIC_TRADE_COLUMNS, { count: "exact" })
      .eq("member_slug", normalizedSlug)
      .eq("is_listed_equity", true)
      .order("disclosure_date", { ascending: false, nullsFirst: false })
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .range(from, to),
    supabase
      .from("member_stock_holdings")
      .select(HOLDINGS_COLUMNS)
      .eq("member_slug", normalizedSlug)
      .order("position_high", { ascending: false, nullsFirst: false })
      .order("ticker", { ascending: true }),
    supabase
      .from("congress_trades")
      .select("member, member_slug, chamber, state")
      .eq("member_slug", normalizedSlug)
      .eq("is_listed_equity", true)
      .order("disclosure_date", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let tradesResult = tradesResultRaw;
  if (isMissingListedEquityColumn(tradesResult.error)) {
    tradesResult = await supabase
      .from("congress_trades")
      .select(PUBLIC_TRADE_COLUMNS, { count: "exact" })
      .eq("member_slug", normalizedSlug)
      .order("disclosure_date", { ascending: false, nullsFirst: false })
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (!tradesResult.error && tradesResult.data) {
      const filtered = applyListedEquityFallback(
        tradesResult.data as unknown as CongressTrade[],
        tradesResult.count,
      );
      tradesResult = {
        ...tradesResult,
        data: filtered.rows as unknown as typeof tradesResult.data,
        count: filtered.count,
      };
    }
  }

  let profileResult = profileResultRaw;
  if (isMissingListedEquityColumn(profileResult.error)) {
    profileResult = await supabase
      .from("congress_trades")
      .select("member, member_slug, chamber, state")
      .eq("member_slug", normalizedSlug)
      .order("disclosure_date", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
  }

  if (tradesResult.error) {
    return {
      profile: null,
      trades: [],
      holdings: [],
      totalTradeCount: 0,
      configured: true,
      error: tradesResult.error.message,
    };
  }

  const profileRow = profileResult.data;
  const profile: MemberProfile | null = profileRow
    ? {
        slug: normalizedSlug,
        name: profileRow.member ?? normalizedSlug,
        chamber:
          profileRow.chamber === "house" || profileRow.chamber === "senate"
            ? profileRow.chamber
            : null,
        state: profileRow.state,
      }
    : null;

  if (!profile) {
    return {
      profile: null,
      trades: [],
      holdings: [],
      totalTradeCount: 0,
      configured: true,
      error: null,
    };
  }

  return {
    profile,
    trades: (tradesResult.data ?? []) as unknown as CongressTrade[],
    holdings: (holdingsResult.error
      ? []
      : ((holdingsResult.data ?? []) as unknown as MemberHolding[])),
    totalTradeCount: tradesResult.count ?? 0,
    configured: true,
    error: holdingsResult.error ? holdingsResult.error.message : null,
  };
}
