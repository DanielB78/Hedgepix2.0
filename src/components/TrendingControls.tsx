import Link from "next/link";
import { trendingHref } from "@/lib/trending";
import type { TrendingFilters, TrendingMode, TrendingPeriodDays } from "@/lib/types";

type Props = {
  filters: TrendingFilters;
};

const MODES: { value: TrendingMode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "buys", label: "Buys" },
  { value: "sales", label: "Sales" },
];

const PERIODS: { value: TrendingPeriodDays; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

function chipClass(active: boolean) {
  return active
    ? "rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white"
    : "rounded-md px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-200/80";
}

export function TrendingControls({ filters }: Props) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="text-xs font-medium tracking-wide text-stone-500 uppercase">
          Activity type
        </div>
        <div className="inline-flex gap-1 rounded-lg border border-stone-200 bg-white p-1">
          {MODES.map((mode) => (
            <Link
              key={mode.value}
              href={trendingHref({ ...filters, mode: mode.value })}
              className={chipClass(filters.mode === mode.value)}
              aria-current={filters.mode === mode.value ? "page" : undefined}
            >
              {mode.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-xs font-medium tracking-wide text-stone-500 uppercase">
          Disclosure window
        </div>
        <div className="inline-flex gap-1 rounded-lg border border-stone-200 bg-white p-1">
          {PERIODS.map((period) => (
            <Link
              key={period.value}
              href={trendingHref({ ...filters, periodDays: period.value })}
              className={chipClass(filters.periodDays === period.value)}
              aria-current={
                filters.periodDays === period.value ? "page" : undefined
              }
            >
              {period.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
