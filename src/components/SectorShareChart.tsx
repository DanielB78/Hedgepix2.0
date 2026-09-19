"use client";

import type { SectorShareSlice } from "@/lib/sectorShare";
import { SECTOR_COLORS } from "@/lib/sectorShare";

export function SectorShareChart({
  title,
  subtitle,
  slices,
}: {
  title: string;
  subtitle: string;
  slices: SectorShareSlice[];
}) {
  const totalTrades = slices.reduce((s, row) => s + row.tradeCount, 0);
  const totalBuys = slices.reduce((s, row) => s + row.buyCount, 0);
  const totalSales = slices.reduce((s, row) => s + row.saleCount, 0);

  return (
    <section className="animate-rise space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight text-[color:var(--fog)]">
          {title}
        </h2>
        <p className="text-sm text-[color:var(--fog-dim)]">{subtitle}</p>
      </div>

      {slices.length === 0 ? (
        <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] px-4 py-6 text-center text-sm text-[color:var(--fog-dim)]">
          No sector data for this chamber window yet.
        </div>
      ) : (
        <div className="space-y-4 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
                Sector mix
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[color:var(--fog)]">
                {slices.length} sectors
              </p>
            </div>
            <p className="text-sm text-[color:var(--fog-dim)]">
              {totalTrades} trades · {totalBuys} buys · {totalSales} sales
            </p>
          </div>

          {/* Stacked market-share bar */}
          <div
            className="flex h-4 w-full overflow-hidden rounded-full bg-[color:var(--panel-elevated)]"
            role="img"
            aria-label="Sector market share"
          >
            {slices.map((slice) => (
              <div
                key={slice.sector}
                title={`${slice.sector}: ${slice.pct.toFixed(1)}%`}
                style={{
                  width: `${Math.max(slice.pct, 0.6)}%`,
                  background: SECTOR_COLORS[slice.sector],
                }}
                className="h-full transition-[width] duration-500"
              />
            ))}
          </div>

          <ul className="space-y-3">
            {slices.map((slice) => (
              <li key={slice.sector} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: SECTOR_COLORS[slice.sector] }}
                      aria-hidden
                    />
                    <span className="truncate font-medium text-[color:var(--fog)]">
                      {slice.sector}
                    </span>
                    <span className="text-xs text-[color:var(--fog-dim)]">
                      {slice.tickerCount} ticker
                      {slice.tickerCount === 1 ? "" : "s"} · {slice.buyCount} buy
                      {slice.buyCount === 1 ? "" : "s"} / {slice.saleCount} sale
                      {slice.saleCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="shrink-0 font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[color:var(--fog)]">
                    {slice.pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--panel-elevated)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(slice.pct, 1))}%`,
                      background: SECTOR_COLORS[slice.sector],
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
