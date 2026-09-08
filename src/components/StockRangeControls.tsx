import Link from "next/link";
import type { ChartRange } from "@/lib/types";

const RANGES: { value: ChartRange; label: string }[] = [
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
];

type Props = {
  ticker: string;
  range: ChartRange;
};

export function StockRangeControls({ ticker, range }: Props) {
  return (
    <div className="inline-flex gap-1 rounded-[16px] bg-[color:var(--surface)] p-1">
      {RANGES.map((item) => {
        const href =
          item.value === "1y"
            ? `/stocks/${encodeURIComponent(ticker)}`
            : `/stocks/${encodeURIComponent(ticker)}?range=${item.value}`;
        const active = range === item.value;
        return (
          <Link
            key={item.value}
            href={href}
            className={
              active
                ? "rounded-full bg-[color:var(--mint)] px-3 py-1.5 text-sm font-medium text-[color:var(--ink)]"
                : "rounded-full px-3 py-1.5 text-sm font-medium text-[color:var(--fog-dim)] hover:bg-[color:var(--panel-elevated)] hover:text-[color:var(--fog)]"
            }
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
