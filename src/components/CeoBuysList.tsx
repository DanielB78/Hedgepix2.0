"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CeoActivityCard } from "@/lib/ceoAggregate";
import { TickerLink } from "@/components/TickerLink";

type Props = {
  rows: CeoActivityCard[];
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

function formatShares(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPrice(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function CeoActivityRow({ card }: { card: CeoActivityCard }) {
  const [open, setOpen] = useState(false);
  const buy = card.side === "purchase";

  return (
    <>
      <tr
        className="cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <td>
          <div className="font-medium text-[color:var(--fog)]">
            {card.ceo_name}
          </div>
          {card.officer_title ? (
            <div className="hx-meta mt-0.5 truncate">{card.officer_title}</div>
          ) : null}
        </td>
        <td>
          <div className="truncate text-[color:var(--fog)]">
            {card.issuer_name ?? "Issuer"}
          </div>
          {card.ticker ? (
            <TickerLink
              ticker={card.ticker}
              className="mt-0.5 inline-block text-xs font-medium text-[color:var(--mint)] hover:opacity-80"
            />
          ) : (
            <span className="hx-meta">—</span>
          )}
        </td>
        <td>
          <span className={buy ? "hx-buy" : "hx-sell"}>
            {buy ? "Buy" : "Sell"}
          </span>
        </td>
        <td className="num">{formatShares(card.shares)}</td>
        <td className="num">{formatPrice(card.price_per_share)}</td>
        <td className="whitespace-nowrap">{formatDate(card.transaction_date)}</td>
      </tr>
      {open ? (
        <tr className="animate-expand bg-[color:var(--panel-elevated)]">
          <td colSpan={6} onClick={(event) => event.stopPropagation()}>
            <div className="space-y-1.5 text-sm text-[color:var(--fog-dim)]">
              {card.security_title ? (
                <p>Security · {card.security_title}</p>
              ) : null}
              <p>Filed · {formatDate(card.filing_date)}</p>
              {card.transaction_count > 1 ? (
                <p>{card.transaction_count} filings combined</p>
              ) : null}
              {card.filing_url ? (
                <p>
                  <a
                    href={card.filing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[color:var(--mint)] hover:opacity-80"
                  >
                    View latest Form 4 filing
                  </a>
                </p>
              ) : null}
              {card.ticker ? (
                <p>
                  <Link
                    href={`/stocks/${encodeURIComponent(card.ticker)}`}
                    className="text-[color:var(--mint)] hover:opacity-80"
                  >
                    Open {card.ticker} chart
                  </Link>
                </p>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function CeoBuysList({ rows }: Props) {
  const empty = useMemo(() => rows.length === 0, [rows.length]);

  if (empty) {
    return (
      <div className="hx-section px-5 py-8 text-center text-sm text-[color:var(--fog-dim)]">
        No matching CEO buys or sales.
      </div>
    );
  }

  return (
    <div className="hx-table-wrap">
      <table className="hx-table">
        <thead>
          <tr>
            <th>Executive</th>
            <th>Company / Ticker</th>
            <th>Type</th>
            <th className="num">Shares</th>
            <th className="num">Price</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((card) => (
            <CeoActivityRow key={card.id} card={card} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
