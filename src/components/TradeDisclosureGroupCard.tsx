"use client";

import { useState } from "react";
import { TickerLink } from "@/components/TickerLink";
import type { CongressTrade } from "@/lib/types";
import type { TradeDisclosureGroup } from "@/lib/groupTrades";

type Props = {
  group: TradeDisclosureGroup;
  defaultOpen: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
  } catch {
    return value;
  }
}

function formatChamberState(group: TradeDisclosureGroup) {
  const parts: string[] = [];
  if (group.chamber) {
    parts.push(group.chamber === "house" ? "House" : "Senate");
  }
  if (group.state) parts.push(group.state);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function activitySummary(group: TradeDisclosureGroup) {
  const parts: string[] = [];
  if (group.purchaseCount > 0) {
    parts.push(
      `${group.purchaseCount} purchase${group.purchaseCount === 1 ? "" : "s"}`,
    );
  }
  if (group.saleCount > 0) {
    parts.push(`${group.saleCount} sale${group.saleCount === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function TradeRows({ trades }: { trades: CongressTrade[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs tracking-wide text-stone-500 uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Ticker</th>
            <th className="px-3 py-2 font-medium">Asset</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Txn date</th>
            <th className="px-3 py-2 font-medium">Filing</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {trades.map((trade) => (
            <tr key={trade.id} className="align-top">
              <td className="px-3 py-2 font-mono font-medium whitespace-nowrap text-stone-900">
                {trade.ticker ? <TickerLink ticker={trade.ticker} /> : "—"}
              </td>
              <td className="max-w-[14rem] px-3 py-2 text-stone-700 sm:max-w-xs">
                <span className="line-clamp-2">{trade.asset ?? "—"}</span>
              </td>
              <td className="px-3 py-2 capitalize whitespace-nowrap text-stone-700">
                {trade.transaction_type ?? "—"}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-stone-700">
                {trade.amount_range ?? "—"}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-stone-700">
                {formatDate(trade.transaction_date)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {trade.filing_portal ? (
                  <a
                    href={trade.filing_portal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-800 underline hover:text-teal-950"
                  >
                    Open
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TradeDisclosureGroupCard({ group, defaultOpen }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const chamberState = formatChamberState(group);
  const summary = activitySummary(group);
  const count = group.trades.length;

  return (
    <details
      className="group overflow-hidden rounded border border-stone-200 bg-white open:shadow-sm"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden hover:bg-stone-50">
        <span
          aria-hidden
          className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-stone-300 text-xs text-stone-600 transition group-open:rotate-90"
        >
          ▸
        </span>
        <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-0.5">
            <div className="font-medium text-stone-900">
              {group.member ?? "Unknown member"}
            </div>
            <div className="text-sm text-stone-600">
              {[chamberState, `Disclosed ${formatDate(group.disclosureDate)}`]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          <div className="shrink-0 text-sm text-stone-700 sm:text-right">
            <div className="font-medium text-stone-900">
              {count} transaction{count === 1 ? "" : "s"}
            </div>
            {summary ? <div className="text-stone-600">{summary}</div> : null}
          </div>
        </div>
        <span className="mt-1 shrink-0 text-xs font-medium text-teal-800 sm:mt-0.5">
          {open ? "Hide" : "Show transactions"}
        </span>
      </summary>
      <div className="border-t border-stone-100 bg-stone-50/60 px-1 py-1 sm:px-2 sm:py-2">
        <TradeRows trades={group.trades} />
      </div>
    </details>
  );
}
