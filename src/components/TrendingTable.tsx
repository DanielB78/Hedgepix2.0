import { TickerLink } from "@/components/TickerLink";
import type { TrendingTicker } from "@/lib/types";

type Props = {
  rows: TrendingTicker[];
};

function membersLabel(count: number) {
  return `${count} member${count === 1 ? "" : "s"}`;
}

export function TrendingTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[20px] bg-[color:var(--surface)] px-5 py-10 text-center text-[color:var(--muted)]">
        No activity in this window.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {rows.map((row, index) => (
        <li key={row.ticker}>
          <div className="flex items-center gap-4 rounded-[20px] bg-[color:var(--surface)] px-5 py-4 transition-colors duration-200 hover:bg-[color:var(--surface-strong)]">
            <span className="w-8 shrink-0 text-sm tabular-nums text-[color:var(--muted)]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <TickerLink
                ticker={row.ticker}
                className="inline-flex items-center gap-1 text-lg font-medium tracking-tight text-[color:var(--deep-navy)] transition-opacity duration-200 hover:opacity-70"
              />
              {row.asset ? (
                <p className="mt-0.5 truncate text-sm text-[color:var(--muted)]">
                  {row.asset}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-sm text-[color:var(--navy)]">
              {membersLabel(row.uniqueMembers)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
