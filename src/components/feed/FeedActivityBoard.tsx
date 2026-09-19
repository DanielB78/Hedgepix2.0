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
  FeedYesNoFilter,
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

function daysAgoLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "—";
  const ms =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 60) return `${days} days ago`;
  return formatShortDate(iso);
}

function buildHref(timeframe: FeedTimeframe, filters: FeedFilters): string {
  const params = new URLSearchParams();
  if (timeframe !== "3m") params.set("tf", timeframe);
  if (filters.source !== "all") params.set("src", filters.source);
  if (filters.trend !== "all") params.set("trend", filters.trend);
  if (filters.overlap !== "all") params.set("overlap", "1");
  if (filters.minBuyers > 0) params.set("minBuyers", String(filters.minBuyers));
  if (filters.minBuys > 0) params.set("minBuys", String(filters.minBuys));
  if (filters.minRepeatBuyers > 0) {
    params.set("minRepeat", String(filters.minRepeatBuyers));
  }
  if (filters.minOverlapBuyers > 0) {
    params.set("minOverlap", String(filters.minOverlapBuyers));
  }
  if (filters.minBuyers30d > 0) {
    params.set("minBuyers30d", String(filters.minBuyers30d));
  }
  if (filters.minActivityRatio > 0) {
    params.set("minAct", String(filters.minActivityRatio));
  }
  if (filters.averagingDown !== "all") {
    params.set("avgDown", filters.averagingDown);
  }
  if (filters.maxRelativeSectorPct != null) {
    params.set("maxRelSector", String(filters.maxRelativeSectorPct));
  }
  if (filters.crossSource !== "all") {
    params.set("crossSrc", filters.crossSource);
  }
  if (filters.nicheLabels.length) {
    params.set("sectors", filters.nicheLabels.join("|"));
  }
  const qs = params.toString();
  return qs ? `/feed?${qs}` : "/feed";
}

function NumInput({
  label,
  testId,
  value,
  onCommit,
}: {
  label: string;
  testId: string;
  value: number;
  onCommit: (n: number) => void;
}) {
  const [local, setLocal] = useState(String(value || ""));
  return (
    <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
      {label}
      <input
        data-testid={testId}
        type="number"
        min={0}
        step="any"
        className="w-14 rounded border border-[var(--line)] bg-[var(--panel)] px-1.5 py-1 text-[12px]"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit(Math.max(0, Number(local) || 0))}
      />
    </label>
  );
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
  const [moreOpen, setMoreOpen] = useState(false);

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
              apply({ overlap: e.target.value as FeedOverlapFilter })
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

        <NumInput
          label="Min buyers"
          testId="feed-min-buyers"
          value={filters.minBuyers}
          onCommit={(n) => apply({ minBuyers: n })}
        />
        <NumInput
          label="Min buys"
          testId="feed-min-buys"
          value={filters.minBuys}
          onCommit={(n) => apply({ minBuys: n })}
        />

        <button
          type="button"
          className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--fog-dim)] hover:text-[var(--ink)]"
          onClick={() => setMoreOpen((v) => !v)}
        >
          {moreOpen ? "Fewer filters" : "More filters"}
        </button>
      </div>

      {moreOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-2 text-[12px]">
          <NumInput
            label="Min repeat"
            testId="feed-min-repeat"
            value={filters.minRepeatBuyers}
            onCommit={(n) => apply({ minRepeatBuyers: n })}
          />
          <NumInput
            label="Min overlap buyers"
            testId="feed-min-overlap"
            value={filters.minOverlapBuyers}
            onCommit={(n) => apply({ minOverlapBuyers: n })}
          />
          <NumInput
            label="Min buyers / 30D"
            testId="feed-min-buyers-30d"
            value={filters.minBuyers30d}
            onCommit={(n) => apply({ minBuyers30d: n })}
          />
          <NumInput
            label="Min activity ×"
            testId="feed-min-activity"
            value={filters.minActivityRatio}
            onCommit={(n) => apply({ minActivityRatio: n })}
          />
          <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
            Averaging down
            <select
              data-testid="feed-avg-down"
              className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)]"
              value={filters.averagingDown}
              onChange={(e) =>
                apply({ averagingDown: e.target.value as FeedYesNoFilter })
              }
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
            Cross-source
            <select
              data-testid="feed-cross-source"
              className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)]"
              value={filters.crossSource}
              onChange={(e) =>
                apply({ crossSource: e.target.value as FeedYesNoFilter })
              }
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
            Rel. sector ≤
            <input
              data-testid="feed-max-rel-sector"
              type="number"
              className="w-16 rounded border border-[var(--line)] bg-[var(--panel)] px-1.5 py-1 text-[12px]"
              placeholder="%"
              defaultValue={
                filters.maxRelativeSectorPct != null
                  ? String(filters.maxRelativeSectorPct)
                  : ""
              }
              onBlur={(e) => {
                const raw = e.target.value.trim();
                apply({
                  maxRelativeSectorPct:
                    raw === "" || !Number.isFinite(Number(raw))
                      ? null
                      : Number(raw),
                });
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function TickerExpand({ row }: { row: FeedTickerRow }) {
  const b = row.breakdown;
  const c = row.components;

  return (
    <div className="grid gap-4 border-t border-[var(--line)] bg-[var(--panel-muted)] px-3 py-3 lg:grid-cols-2">
      <div className="space-y-3 text-[12px]">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
            Why noteworthy
          </div>
          {row.whyNoteworthy.length > 0 ? (
            <ul className="space-y-1 text-[var(--ink)]">
              {row.whyNoteworthy.map((line) => (
                <li key={line} className="flex gap-1.5">
                  <span className="text-[var(--fog-mute)]">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--fog-dim)]">No highlight summary.</p>
          )}
        </div>

        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
            Relative weakness
          </div>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-2 gap-y-1 tabular-nums">
            <dt className="text-[var(--fog-dim)]">20D</dt>
            <dd>{pct(c.return_20d)}</dd>
            <dt className="text-[var(--fog-dim)]">vs sector</dt>
            <dd>{pct(c.relative_sector_return_20d)}</dd>
            <dt className="text-[var(--fog-dim)]">vs market</dt>
            <dd>{pct(c.relative_market_return_20d)}</dd>
          </dl>
        </div>

        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
            Score breakdown
          </div>
          <ul className="space-y-0.5 text-[var(--fog-dim)]">
            <li>
              Distinct buyers × {FEED_WEIGHTS.distinctBuyer} →{" "}
              {b.distinctBuyer.toFixed(1)}
            </li>
            <li>
              Repeat / streak → {(b.repeatBuyer + b.consecutiveStreak).toFixed(1)}
            </li>
            <li>
              Overlap buyers × {FEED_WEIGHTS.overlapBuyer} →{" "}
              {b.overlapBuyer.toFixed(1)}
            </li>
            <li>
              Buyer clustering → {b.buyerCluster.toFixed(1)}
            </li>
            <li>
              Downtrend / relative weakness →{" "}
              {(b.downtrendBuy + b.currentDowntrend + b.relativeWeakness).toFixed(
                1,
              )}
            </li>
            <li>
              Averaging down / large buys →{" "}
              {(b.averagingDown + b.unusuallyLargeBuy).toFixed(1)}
            </li>
            <li>
              Unusual activity / recency / cross-source →{" "}
              {(b.unusualActivity + b.recency + b.crossSource).toFixed(1)}
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
                      {streak.isAveragingDown ? " · averaging down" : ""}
                    </span>
                  </span>
                  <span className="text-[11px] text-[var(--fog-dim)]">
                    Streak {streak.currentStreak || streak.maxStreak}
                    {streak.maxDeclineFirstToLatest != null &&
                    streak.maxDeclineFirstToLatest < 0
                      ? ` · ${pct(streak.maxDeclineFirstToLatest)} first→latest`
                      : ""}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--fog-dim)]">
                  {streak.occasions.map((o) => (
                    <li key={o.key} className="flex flex-wrap gap-2 tabular-nums">
                      <span className="w-20 shrink-0">
                        {formatShortDate(o.transactionDate)}
                      </span>
                      <span className="hx-buy">Buy</span>
                      <span>{pct(o.return20dBefore)} pre</span>
                      {o.priceAtTrade != null ? (
                        <span>~${o.priceAtTrade.toFixed(2)}</span>
                      ) : null}
                      {o.isAveragingDownStep ? (
                        <span>lower price</span>
                      ) : null}
                      {o.isUnusuallyLarge ? <span>large vs person</span> : null}
                      {o.positionKind === "adding" ? (
                        <span>adding</span>
                      ) : o.positionKind === "new" ? (
                        <span>new</span>
                      ) : null}
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
                    {o.purchaseEstimateIsApproximate && o.purchaseEstimate != null
                      ? " · est. midpoint used for size ranking only"
                      : ""}
                  </span>
                  <span>
                    {FEED_TREND_TRADING_DAYS}D at purchase:{" "}
                    {pct(o.return20dBefore)}
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
          {row.distinctOverlapBuyers}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums">
          {row.repeatBuyers}
        </td>
        <td className="py-2 pr-3 text-[12px] tabular-nums">
          {row.isCurrentDowntrend ? (
            <span className="text-[var(--fog-dim)]">
              ↓ {pct(row.currentTrendReturn)}
            </span>
          ) : (
            <span className="text-[var(--fog-mute)]">
              {pct(row.currentTrendReturn)}
            </span>
          )}
        </td>
        <td className="py-2 pr-3 text-[12px] tabular-nums text-[var(--fog-dim)]">
          {row.relativeSectorReturn != null
            ? pct(row.relativeSectorReturn)
            : pct(row.relativeMarketReturn)}
        </td>
        <td className="py-2 pr-3 text-[12px] tabular-nums text-[var(--fog-dim)]">
          {row.buyersLast30d} / 30D
          {row.activityRatio != null && row.activityRatio >= 1.5
            ? ` · ${row.activityRatio.toFixed(1)}×`
            : ""}
        </td>
        <td className="py-2 pr-3 text-[12px] text-[var(--fog-dim)]">
          {daysAgoLabel(row.latestBuyDisclosure ?? row.latestBuyTransaction)}
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-[var(--line)]">
          <td colSpan={10} className="p-0">
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
            Noteworthy activity
          </h2>
          <p className="mt-0.5 max-w-2xl text-[12px] text-[var(--fog-dim)]">
            Unusual combinations of disclosed buying and market weakness —
            repeated purchases, clustered buyers, sector overlap, averaging
            down, and relative underperformance. Observable patterns only; not
            evidence of private information.
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
          <table className="hx-table w-full min-w-[62rem]">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[11px] uppercase tracking-wide text-[var(--fog-mute)]">
                <th className="px-3 py-2 font-medium">Ticker</th>
                <th className="num py-2 pr-3 text-right font-medium">Score</th>
                <th className="num py-2 pr-3 text-right font-medium">Buys</th>
                <th className="num py-2 pr-3 text-right font-medium">Buyers</th>
                <th className="num py-2 pr-3 text-right font-medium">
                  Overlap
                </th>
                <th className="num py-2 pr-3 text-right font-medium">
                  Repeat
                </th>
                <th className="py-2 pr-3 font-medium">Trend</th>
                <th className="py-2 pr-3 font-medium">Rel. trend</th>
                <th className="py-2 pr-3 font-medium">Recent</th>
                <th className="py-2 pr-3 font-medium">Latest</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
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
