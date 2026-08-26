import Link from "next/link";
import type { TradeFilters } from "@/lib/types";

type Props = {
  filters: TradeFilters;
};

function buildHref(filters: TradeFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.member) params.set("member", filters.member);
  if (filters.ticker) params.set("ticker", filters.ticker);
  if (filters.chamber) params.set("chamber", filters.chamber);
  if (filters.type) params.set("type", filters.type);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function TradeFiltersForm({ filters }: Props) {
  return (
    <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">Member</span>
        <input
          name="member"
          defaultValue={filters.member ?? ""}
          placeholder="e.g. Pelosi"
          className="rounded border border-stone-300 bg-white px-3 py-2 text-stone-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">Ticker</span>
        <input
          name="ticker"
          defaultValue={filters.ticker ?? ""}
          placeholder="e.g. NVDA"
          className="rounded border border-stone-300 bg-white px-3 py-2 uppercase text-stone-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">Chamber</span>
        <select
          name="chamber"
          defaultValue={filters.chamber ?? ""}
          className="rounded border border-stone-300 bg-white px-3 py-2 text-stone-900"
        >
          <option value="">Any</option>
          <option value="house">House</option>
          <option value="senate">Senate</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">Type</span>
        <select
          name="type"
          defaultValue={filters.type ?? ""}
          className="rounded border border-stone-300 bg-white px-3 py-2 text-stone-900"
        >
          <option value="">Any</option>
          <option value="purchase">Purchase</option>
          <option value="sale">Sale</option>
          <option value="exchange">Exchange</option>
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          Apply filters
        </button>
        <Link
          href="/"
          className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}

export { buildHref };
