"use client";

import { useState } from "react";
import { TickerLink } from "@/components/TickerLink";
import type { CeoStockPurchaseRow } from "@/lib/types";

type Props = {
  rows: CeoStockPurchaseRow[];
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
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value)} shares`;
}

function formatPrice(value: number | null) {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value)} per share`;
}

function CeoBuyCard({ row }: { row: CeoStockPurchaseRow }) {
  const [open, setOpen] = useState(false);

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
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="truncate text-base font-medium text-[color:var(--deep-navy)]">
              {row.ceo_name}
            </p>
            <div className="shrink-0">
              {row.ticker ? (
                <TickerLink
                  ticker={row.ticker}
                  className="inline-flex items-center gap-1 font-medium tracking-tight text-[color:var(--deep-navy)] transition-opacity duration-200 hover:opacity-70"
                />
              ) : (
                <span className="text-[color:var(--muted)]">—</span>
              )}
            </div>
          </div>
          {row.issuer_name ? (
            <p className="truncate text-sm text-[color:var(--muted)]">
              {row.issuer_name}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[color:var(--navy)]">
            <span>{formatShares(row.shares_purchased)}</span>
            <span>{formatPrice(row.price_per_share)}</span>
            <span className="text-[color:var(--muted)]">
              {formatDate(row.transaction_date)}
            </span>
          </div>
        </div>
      </summary>

      <div className="space-y-2 border-t border-[color:var(--oatmeal)]/40 px-5 py-4 text-sm text-[color:var(--navy)]">
        {row.officer_title ? (
          <p>
            <span className="text-[color:var(--muted)]">Title · </span>
            {row.officer_title}
          </p>
        ) : null}
        {row.security_title ? (
          <p>
            <span className="text-[color:var(--muted)]">Security · </span>
            {row.security_title}
          </p>
        ) : null}
        <p>
          <span className="text-[color:var(--muted)]">Filed · </span>
          {formatDate(row.filing_date)}
        </p>
        {row.shares_owned_after != null ? (
          <p>
            <span className="text-[color:var(--muted)]">Owned after · </span>
            {new Intl.NumberFormat("en-US", {
              maximumFractionDigits: 2,
            }).format(row.shares_owned_after)}
          </p>
        ) : null}
        {row.ownership_type ? (
          <p>
            <span className="text-[color:var(--muted)]">Ownership · </span>
            {row.ownership_type}
          </p>
        ) : null}
        <p>
          <span className="text-[color:var(--muted)]">Accession · </span>
          {row.accession_number}
        </p>
        {row.filing_url ? (
          <p>
            <a
              href={row.filing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--deep-navy)] underline-offset-2 hover:underline"
            >
              View Form 4 filing
            </a>
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function CeoBuysList({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[16px] bg-[color:var(--surface)] px-4 py-8 text-center text-sm text-[color:var(--muted)]">
        No CEO purchases yet. Run{" "}
        <code className="text-[color:var(--deep-navy)]">npm run backfill-ceo-buys</code>{" "}
        after applying the CEO buys migration.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <CeoBuyCard key={row.id} row={row} />
      ))}
    </div>
  );
}
