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
    <div className="inline-flex gap-1 rounded-lg border border-stone-200 bg-white p-1">
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
                ? "rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-md px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-200/80"
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
