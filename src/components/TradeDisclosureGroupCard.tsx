"use client";

import Link from "next/link";
import { useState } from "react";
import { TickerLink } from "@/components/TickerLink";
import type { CongressTrade } from "@/lib/types";
import type { TradeDisclosureGroup } from "@/lib/groupTrades";
import { memberHref } from "@/lib/holdings";

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
    <ul className="divide-y divide-[color:var(--line)]">
      {trades.map((trade) => (
        <li
          key={trade.id}
          className="flex flex-col gap-1 px-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {trade.ticker ? (
                <TickerLink ticker={trade.ticker} />
              ) : (
                <span className="text-[color:var(--fog-dim)]">—</span>
              )}
              <span
                className={`text-sm capitalize ${
                  trade.transaction_type === "purchase"
                    ? "hx-buy"
                    : trade.transaction_type === "sale"
                      ? "hx-sell"
                      : "text-[color:var(--fog)]"
                }`}
              >
                {trade.transaction_type ?? "trade"}
              </span>
            </div>
            {trade.asset ? (
              <p className="line-clamp-1 text-sm text-[color:var(--fog-dim)]">
                {trade.asset}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 space-y-0.5 text-sm sm:text-right">
            <div className="text-[color:var(--fog)]">
              {trade.amount_range ?? "—"}
            </div>
            <div className="hx-meta">
              {formatDate(trade.transaction_date)}
              {trade.filing_portal ? (
                <>
                  {" · "}
                  <a
                    href={trade.filing_portal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[color:var(--fog)] underline-offset-2 hover:underline"
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
      className="group"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 marker:content-none hover:bg-[#f8faf9] [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="text-sm text-[color:var(--fog-dim)] transition-transform duration-200 group-open:rotate-90"
        >
          ›
        </span>
        <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
          <div className="min-w-0">
            {group.memberSlug ? (
              <Link
                href={memberHref(group.memberSlug)}
                className="block truncate text-sm font-medium text-[color:var(--fog)] transition hover:text-[color:var(--mint)]"
                onClick={(event) => event.stopPropagation()}
              >
                {group.member ?? "Unknown member"}
              </Link>
            ) : (
              <div className="truncate text-sm font-medium text-[color:var(--fog)]">
                {group.member ?? "Unknown member"}
              </div>
            )}
            <div className="hx-meta mt-0.5">
              {count} transaction{count === 1 ? "" : "s"}
              {hint ? ` · ${hint}` : ""}
            </div>
          </div>
          <div className="hx-meta shrink-0">
            {formatDate(group.disclosureDate)}
          </div>
        </div>
      </summary>
      <div className="border-t border-[color:var(--line)] bg-[color:var(--panel-elevated)] px-3 py-2">
        <TradeRows trades={group.trades} />
      </div>
    </details>
  );
}
