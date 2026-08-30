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
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
];

function chipClass(active: boolean) {
  return active
    ? "rounded-[12px] bg-[#1B2632] px-3 py-1.5 text-sm font-medium !text-[#EEE9DF]"
    : "rounded-[12px] px-3 py-1.5 text-sm font-medium text-[#2C3B4D] hover:bg-[#C9C1B1]/45";
}

export function TrendingControls({ filters }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex gap-1 rounded-[16px] bg-[color:var(--surface)] p-1">
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
      <div className="inline-flex gap-1 rounded-[16px] bg-[color:var(--surface)] p-1">
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
  );
}
