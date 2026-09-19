"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatShortDate, formatAmountRange } from "@/lib/format";
import {
  GENERAL_SECTOR_ORDER,
  nicheLabelsForParent,
} from "@/lib/generalSectors";
import { FEED_TREND_TRADING_DAYS, FEED_WEIGHTS } from "@/lib/feedActivity/weights";
import type {
  FeedFilters,
  FeedSourceFilter,
  FeedTickerRow,
  FeedTimeframe,
  FeedTrendFilter,
  FeedOverlapFilter,
} from "@/lib/feedActivity/types";

const TIMEFRAMES: Array<{ id: FeedTimeframe; label: string }> = [
  { id: "3m", label: "3 Months" },
  { id: "6m", label: "6 Months" },
  { id: "1y", label: "1 Year" },
];

function sourceLabel(source: string): string {
  if (source === "house") return "House";
  if (source === "senate") return "Senate";
  return "Insider";
}

function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function buildHref(
  timeframe: FeedTimeframe,
  filters: FeedFilters,
): string {
  const params = new URLSearchParams();
  if (timeframe !== "3m") params.set("tf", timeframe);
  if (filters.source !== "all") params.set("src", filters.source);
  if (filters.trend !== "all") params.set("trend", filters.trend);
  if (filters.overlap !== "all") params.set("overlap", "1");
  if (filters.minBuyers > 0) params.set("minBuyers", String(filters.minBuyers));
  if (filters.minBuys > 0) params.set("minBuys", String(filters.minBuys));
  if (filters.nicheLabels.length) {
    params.set("sectors", filters.nicheLabels.join("|"));
  }
  const qs = params.toString();
  return qs ? `/feed?${qs}` : "/feed";
}

function FilterBar({
  timeframe,
  filters,
  onNavigate,
}: {
  timeframe: FeedTimeframe;
  filters: FeedFilters;
  onNavigate: (href: string) => void;
}) {
  const [sectorOpen, setSectorOpen] = useState(false);
  const [localMinBuyers, setLocalMinBuyers] = useState(
    String(filters.minBuyers || ""),
  );
  const [localMinBuys, setLocalMinBuys] = useState(
    String(filters.minBuys || ""),
  );

  function apply(next: Partial<FeedFilters>, tf = timeframe) {
    onNavigate(buildHref(tf, { ...filters, ...next }));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {TIMEFRAMES.map((tf) => {
          const active = timeframe === tf.id;
          return (
            <button
              key={tf.id}
              type="button"
              data-testid={`feed-tf-${tf.id}`}
              className={[
                "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--fog-dim)] hover:text-[var(--ink)]",
              ].join(" ")}
              onClick={() => apply({}, tf.id)}
            >
              {tf.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
          Source
          <select
            data-testid="feed-source"
            className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)]"
            value={filters.source}
            onChange={(e) =>
              apply({ source: e.target.value as FeedSourceFilter })
            }
          >
            <option value="all">All</option>
            <option value="congress">Congress</option>
            <option value="house">House</option>
            <option value="senate">Senate</option>
            <option value="insiders">Insiders</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
          Trend
          <select
            data-testid="feed-trend"
            className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)]"
            value={filters.trend}
            onChange={(e) =>
              apply({ trend: e.target.value as FeedTrendFilter })
            }
          >
            <option value="all">All</option>
            <option value="down">Down</option>
            <option value="up">Up</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
          Overlap
          <select
            data-testid="feed-overlap"
            className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)]"
            value={filters.overlap}
            onChange={(e) =>
              apply({
                overlap: e.target.value as FeedOverlapFilter,
              })
            }
          >
            <option value="all">All</option>
            <option value="has_overlap">Has overlap</option>
          </select>
        </label>

        <div className="relative">
          <button
            type="button"
            className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--fog-dim)] hover:text-[var(--ink)]"
            onClick={() => setSectorOpen((v) => !v)}
          >
            Sector
            {filters.nicheLabels.length
              ? ` (${filters.nicheLabels.length})`
              : ""}
          </button>
          {sectorOpen ? (
            <div className="absolute left-0 z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--panel)] p-2 shadow-lg">
              {GENERAL_SECTOR_ORDER.map((parent) => (
                <div key={parent} className="mb-2">
                  <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
                    {parent}
                  </div>
                  {nicheLabelsForParent(parent)
                    .slice(0, 8)
                    .map((label) => {
                      const on = filters.nicheLabels.includes(label);
                      return (
                        <button
                          key={label}
                          type="button"
                          className={[
                            "block w-full rounded px-1.5 py-0.5 text-left text-[11px]",
                            on
                              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                              : "text-[var(--ink)] hover:bg-[var(--panel-muted)]",
                          ].join(" ")}
                          onClick={() => {
                            const next = on
                              ? filters.nicheLabels.filter((x) => x !== label)
                              : [...filters.nicheLabels, label];
                            apply({ nicheLabels: next });
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                </div>
              ))}
              {filters.nicheLabels.length > 0 ? (
                <button
                  type="button"
                  className="mt-1 w-full text-left text-[11px] text-[var(--fog-dim)]"
                  onClick={() => {
                    apply({ nicheLabels: [] });
                    setSectorOpen(false);
                  }}
                >
                  Clear sectors
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
          Min buyers
          <input
            data-testid="feed-min-buyers"
            type="number"
            min={0}
            className="w-14 rounded border border-[var(--line)] bg-[var(--panel)] px-1.5 py-1 text-[12px]"
            value={localMinBuyers}
            onChange={(e) => setLocalMinBuyers(e.target.value)}
            onBlur={() =>
              apply({
                minBuyers: Math.max(0, Number(localMinBuyers) || 0),
              })
            }
          />
        </label>

        <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
          Min buys
          <input
            data-testid="feed-min-buys"
            type="number"
            min={0}
            className="w-14 rounded border border-[var(--line)] bg-[var(--panel)] px-1.5 py-1 text-[12px]"
            value={localMinBuys}
            onChange={(e) => setLocalMinBuys(e.target.value)}
            onBlur={() =>
              apply({
                minBuys: Math.max(0, Number(localMinBuys) || 0),
              })
            }
          />
        </label>
      </div>
    </div>
  );
}

function TickerExpand({ row }: { row: FeedTickerRow }) {
  const b = row.breakdown;
  return (
    <div className="grid gap-4 border-t border-[var(--line)] bg-[var(--panel-muted)] px-3 py-3 md:grid-cols-2">
      <div className="space-y-3 text-[12px]">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
            Why this ranked
          </div>
          <dl className="grid grid-cols-[9rem_1fr] gap-x-2 gap-y-1">
            <dt className="text-[var(--fog-dim)]">
              Current {FEED_TREND_TRADING_DAYS}D trend
            </dt>
            <dd className="tabular-nums">
              {pct(row.currentTrendReturn)}
              {row.isCurrentDowntrend ? (
                <span className="ml-1.5 text-[var(--fog-dim)]">Downtrend</span>
              ) : null}
            </dd>
            <dt className="text-[var(--fog-dim)]">Purchase occasions</dt>
            <dd>{row.buyOccasions}</dd>
            <dt className="text-[var(--fog-dim)]">Distinct buyers</dt>
            <dd>{row.distinctBuyers}</dd>
            <dt className="text-[var(--fog-dim)]">Repeat buyers</dt>
            <dd>{row.repeatBuyers}</dd>
            <dt className="text-[var(--fog-dim)]">Overlap buyers</dt>
            <dd>
              {row.distinctOverlapBuyers}
              {row.overlapBuyCount
                ? ` · ${row.overlapBuyCount} overlap purchases`
                : ""}
            </dd>
            <dt className="text-[var(--fog-dim)]">Buys into weakness</dt>
            <dd>
              {row.downtrendBuyCount} of {row.buyOccasions} during a negative{" "}
              {FEED_TREND_TRADING_DAYS}D trend
            </dd>
          </dl>
        </div>

        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
            Score breakdown
          </div>
          <ul className="space-y-0.5 text-[var(--fog-dim)]">
            <li>
              Buy occasions × {FEED_WEIGHTS.buyOccasion} → {b.buyOccasion}
            </li>
            <li>
              Repeat buyers × {FEED_WEIGHTS.repeatBuyer} → {b.repeatBuyer}
            </li>
            <li>
              Overlap buyers × {FEED_WEIGHTS.overlapBuyer} → {b.overlapBuyer}
            </li>
            <li>
              Downtrend buys × {FEED_WEIGHTS.downtrendBuy} → {b.downtrendBuy}
            </li>
            <li>
              Current downtrend → {b.currentDowntrend}
            </li>
            <li className="font-medium text-[var(--ink)]">
              Total score {b.total}
            </li>
          </ul>
        </div>
      </div>

      <div className="space-y-3 text-[12px]">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
            Buy streaks
          </div>
          <div className="space-y-2">
            {row.buyerStreaks.slice(0, 8).map((streak) => (
              <div
                key={streak.personKey}
                className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-[var(--ink)]">
                    {streak.person ?? "Unknown"}
                    <span className="ml-1.5 font-normal text-[var(--fog-mute)]">
                      {sourceLabel(streak.source)}
                      {streak.hasOverlap ? " · overlap" : ""}
                    </span>
                  </span>
                  <span className="text-[11px] text-[var(--fog-dim)]">
                    Streak {streak.currentStreak || streak.maxStreak}
                    {streak.maxStreak !== streak.currentStreak
                      ? ` (max ${streak.maxStreak})`
                      : ""}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--fog-dim)]">
                  {streak.occasions.map((o) => (
                    <li key={o.key} className="flex gap-2 tabular-nums">
                      <span className="w-20 shrink-0">
                        {formatShortDate(o.transactionDate)}
                      </span>
                      <span className="hx-buy">Buy</span>
                      {o.boughtDuringDowntrend ? (
                        <span>{pct(o.return20dBefore)} pre</span>
                      ) : (
                        <span>{pct(o.return20dBefore)} pre</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
            Purchases (newest first)
          </div>
          <ul className="space-y-1.5">
            {row.occasions.slice(0, 20).map((o) => (
              <li
                key={o.key}
                className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="tabular-nums text-[var(--fog-dim)]">
                      {formatShortDate(o.transactionDate)}
                    </span>
                    <span className="mx-1.5 font-medium text-[var(--ink)]">
                      {o.person}
                    </span>
                    <span className="text-[var(--fog-mute)]">
                      {sourceLabel(o.source)}
                    </span>
                    {o.officerTitle ? (
                      <span className="text-[var(--fog-mute)]">
                        {" "}
                        · {o.officerTitle}
                      </span>
                    ) : null}
                  </span>
                  <span className="hx-buy text-[11px]">Buy</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-[var(--fog-dim)]">
                  <span>
                    {formatAmountRange(
                      o.disclosedMin,
                      o.disclosedMax,
                      o.amountRange,
                    )}
                  </span>
                  <span>
                    {FEED_TREND_TRADING_DAYS}D at purchase:{" "}
                    {pct(o.return20dBefore)}
                    {o.boughtDuringDowntrend ? " · into weakness" : ""}
                  </span>
                  {o.hasSectorOverlap ? (
                    <span className="text-[var(--accent)]">
                      Sector overlap
                      {o.overlapMemberLabel && o.overlapTickerLabel
                        ? `: ${o.overlapMemberLabel} ↔ ${o.overlapTickerLabel}`
                        : ""}
                      {o.overlapSimilarity != null
                        ? ` (${o.overlapSimilarity.toFixed(2)})`
                        : ""}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FeedRow({ row }: { row: FeedTickerRow }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        data-testid={`feed-row-${row.ticker}`}
        className="cursor-pointer border-b border-[var(--line)] hover:bg-[var(--panel-muted)]"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="whitespace-nowrap py-2 pl-3 pr-2 text-[12px]">
          <span className="inline-flex items-center gap-1 font-mono font-semibold text-[var(--ink)]">
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {row.ticker}
          </span>
          {row.company ? (
            <div className="pl-4 text-[11px] text-[var(--fog-mute)]">
              {row.company}
            </div>
          ) : null}
        </td>
        <td className="num py-2 pr-3 text-right text-[13px] font-semibold tabular-nums text-[var(--ink)]">
          {row.score}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums">
          {row.buyOccasions}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums">
          {row.distinctBuyers}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums">
          {row.repeatBuyers}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums">
          {row.distinctOverlapBuyers}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums">
          {row.downtrendBuyCount}
        </td>
        <td className="py-2 pr-3 text-[12px] tabular-nums">
          {row.isCurrentDowntrend ? (
            <span className="text-[var(--fog-dim)]">
              ↓ {pct(row.currentTrendReturn)} / {FEED_TREND_TRADING_DAYS}D
            </span>
          ) : (
            <span className="text-[var(--fog-mute)]">
              {pct(row.currentTrendReturn)} / {FEED_TREND_TRADING_DAYS}D
            </span>
          )}
        </td>
        <td className="py-2 pr-3 text-[12px] text-[var(--fog-dim)]">
          {formatShortDate(
            row.latestBuyDisclosure ?? row.latestBuyTransaction,
          )}
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-[var(--line)]">
          <td colSpan={9} className="p-0">
            <TickerExpand row={row} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function FeedActivityBoard({
  rows,
  timeframe,
  filters,
  error,
  tradeCount,
}: {
  rows: FeedTickerRow[];
  timeframe: FeedTimeframe;
  filters: FeedFilters;
  error: string | null;
  tradeCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onNavigate(href: string) {
    startTransition(() => {
      router.push(href);
    });
  }

  const visible = useMemo(() => rows, [rows]);

  return (
    <div className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
      <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 sm:p-4">
        <div className="mb-3">
          <h2 className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[var(--ink)]">
            Notable buying activity
          </h2>
          <p className="mt-0.5 max-w-2xl text-[12px] text-[var(--fog-dim)]">
            Tickers with repeated purchases, multiple buyers, and buying into
            weakness — with congressional sector overlap highlighted when
            available. Observable patterns only; not evidence of private
            information.
          </p>
        </div>
        <FilterBar
          timeframe={timeframe}
          filters={filters}
          onNavigate={onNavigate}
        />
      </div>

      {error ? (
        <div className="rounded-md border border-[var(--coral)]/30 bg-[color-mix(in_srgb,var(--coral)_6%,white)] px-3 py-2 text-[13px] text-[var(--coral)]">
          {error}
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2
            data-testid="feed-result-count"
            className="text-[13px] font-semibold text-[var(--ink)]"
          >
            {visible.length.toLocaleString()} ticker
            {visible.length === 1 ? "" : "s"}
          </h2>
          <span className="text-[11px] text-[var(--fog-mute)]">
            from {tradeCount.toLocaleString()} trades · sorted by Feed score
          </span>
        </div>

        <div className="hx-table-wrap overflow-x-auto rounded-md border border-[var(--line)]">
          <table className="hx-table w-full min-w-[56rem]">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[11px] uppercase tracking-wide text-[var(--fog-mute)]">
                <th className="px-3 py-2 font-medium">Ticker</th>
                <th className="num py-2 pr-3 text-right font-medium">Score</th>
                <th className="num py-2 pr-3 text-right font-medium">Buys</th>
                <th className="num py-2 pr-3 text-right font-medium">Buyers</th>
                <th className="num py-2 pr-3 text-right font-medium">
                  Repeat
                </th>
                <th className="num py-2 pr-3 text-right font-medium">
                  Overlap
                </th>
                <th className="num py-2 pr-3 text-right font-medium">
                  ↓ Buys
                </th>
                <th className="py-2 pr-3 font-medium">Current trend</th>
                <th className="py-2 pr-3 font-medium">Latest buy</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-8 text-center text-[13px] text-[var(--fog-dim)]"
                  >
                    No tickers match the current Feed criteria.
                  </td>
                </tr>
              ) : (
                visible.map((row) => <FeedRow key={row.ticker} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
