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
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value)} shares`;
}

function formatPrice(value: number | null) {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value)} avg`;
}

function CeoActivityCardView({ card }: { card: CeoActivityCard }) {
  const [open, setOpen] = useState(false);
  const buy = card.side === "purchase";

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={`rounded-[18px] border px-4 py-4 text-left transition-all duration-300 ${
        open
          ? "border-[color:var(--mint)]/50 bg-[color:var(--panel-elevated)] shadow-[0_0_28px_var(--glow)]"
          : "border-[color:var(--line)] bg-[color:var(--panel)] hover:border-[color:var(--mint)]/30 hover:bg-[color:var(--panel-elevated)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-[family-name:var(--font-display)] text-lg font-bold text-[color:var(--fog)]">
            {card.ceo_name}
          </p>
          <p className="mt-1 truncate text-sm text-[color:var(--fog-dim)]">
            {card.issuer_name ?? "Issuer"}
          </p>
        </div>
        {card.ticker ? (
          <TickerLink
            ticker={card.ticker}
            className="shrink-0 font-semibold tracking-tight text-[color:var(--fog)] hover:text-[color:var(--mint)]"
          />
        ) : (
          <span className="text-[color:var(--fog-dim)]">—</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span
          className={`font-semibold uppercase tracking-wide ${
            buy ? "text-[color:var(--mint)]" : "text-[color:var(--coral)]"
          }`}
        >
          {buy ? "Bought" : "Sold"}
        </span>
        <span className="text-[color:var(--fog)]">
          {formatShares(card.shares)}
        </span>
        <span className="text-[color:var(--fog-dim)]">
          {formatPrice(card.price_per_share)}
        </span>
      </div>
      <p className="mt-2 text-xs text-[color:var(--fog-dim)]">
        {formatDate(card.transaction_date)}
        {card.transaction_count > 1
          ? ` · ${card.transaction_count} filings combined`
          : ""}
      </p>

      {open ? (
        <div
          className="mt-4 space-y-2 border-t border-[color:var(--line)] pt-3 text-sm text-[color:var(--fog-dim)]"
          onClick={(event) => event.stopPropagation()}
        >
          {card.officer_title ? <p>Title · {card.officer_title}</p> : null}
          {card.security_title ? <p>Security · {card.security_title}</p> : null}
          <p>Filed · {formatDate(card.filing_date)}</p>
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
      ) : null}
    </button>
  );
}

export function CeoBuysList({ rows }: Props) {
  const empty = useMemo(() => rows.length === 0, [rows.length]);

  if (empty) {
    return (
      <div className="rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel)] px-5 py-8 text-center text-sm text-[color:var(--fog-dim)]">
        No matching CEO buys or sales.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((card) => (
        <CeoActivityCardView key={card.id} card={card} />
      ))}
    </div>
  );
}
