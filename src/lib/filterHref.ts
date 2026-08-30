import type { TradeFilters } from "@/lib/types";

export function buildHref(filters: TradeFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.member) params.set("member", filters.member);
  if (filters.ticker) params.set("ticker", filters.ticker);
  if (filters.chamber) params.set("chamber", filters.chamber);
  if (filters.type) params.set("type", filters.type);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}
