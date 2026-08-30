"use client";

import { useState } from "react";
import { TickerLink } from "@/components/TickerLink";
import type { CongressTrade } from "@/lib/types";
import type { TradeDisclosureGroup } from "@/lib/groupTrades";

type Props = {
  group: TradeDisclosureGroup;
  defaultOpen: boolean;
};

function formatDate(value: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
      ...opts,
    }).format(new Date(`${value}T00:00:00Z`));
  } catch {
    return value;
  }
}

function activityHint(group: TradeDisclosureGroup) {
  const parts: string[] = [];
  if (group.purchaseCount > 0) parts.push(`${group.purchaseCount} buy`);
  if (group.saleCount > 0) parts.push(`${group.saleCount} sale`);
  return parts.join(" · ");
}

function TradeRows({ trades }: { trades: CongressTrade[] }) {
  return (
    <ul className="divide-y divide-[color:var(--oatmeal)]/40">
      {trades.map((trade) => (
        <li
          key={trade.id}
          className="flex flex-col gap-1 px-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {trade.ticker ? (
                <TickerLink ticker={trade.ticker} />
              ) : (
                <span className="text-[color:var(--muted)]">—</span>
              )}
              <span className="text-sm capitalize text-[color:var(--navy)]">
                {trade.transaction_type ?? "trade"}
              </span>
            </div>
            {trade.asset ? (
              <p className="line-clamp-1 text-sm text-[color:var(--muted)]">
                {trade.asset}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 space-y-0.5 text-sm sm:text-right">
            <div className="text-[color:var(--deep-navy)]">
              {trade.amount_range ?? "—"}
            </div>
            <div className="text-[color:var(--muted)]">
              {formatDate(trade.transaction_date)}
              {trade.filing_portal ? (
                <>
                  {" · "}
                  <a
                    href={trade.filing_portal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[color:var(--navy)] underline-offset-2 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Filing
                  </a>
                </>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TradeDisclosureGroupCard({ group, defaultOpen }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const count = group.trades.length;
  const hint = activityHint(group);

  return (
    <details
      className="group overflow-hidden rounded-[20px] bg-[color:var(--surface)] open:bg-[color:var(--surface-strong)] open:shadow-[var(--shadow-soft)]"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="text-lg text-[color:var(--muted)] transition-transform duration-200 group-open:rotate-90"
        >
          ›
        </span>
        <div className="flex min-w-0 flex-1 items-baseline justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-base font-medium text-[color:var(--deep-navy)]">
              {group.member ?? "Unknown member"}
            </div>
            <div className="mt-0.5 text-sm text-[color:var(--muted)]">
              {count} transaction{count === 1 ? "" : "s"}
              {hint ? ` · ${hint}` : ""}
            </div>
          </div>
          <div className="shrink-0 text-sm text-[color:var(--navy)]">
            {formatDate(group.disclosureDate)}
          </div>
        </div>
      </summary>
      <div className="px-5 pb-4">
        <TradeRows trades={group.trades} />
      </div>
    </details>
  );
}
