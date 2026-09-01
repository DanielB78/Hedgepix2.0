"use client";

import { useState } from "react";
import { TickerLink } from "@/components/TickerLink";
import type { MemberHolding } from "@/lib/types";
import {
  formatActivityType,
  formatHoldingsRange,
  formatMemberDate,
} from "@/lib/holdings";

type Props = {
  holdings: MemberHolding[];
};

export function MemberHoldingsList({ holdings }: Props) {
  if (holdings.length === 0) {
    return (
      <p className="rounded-[20px] bg-[color:var(--surface)] px-5 py-12 text-center text-[color:var(--muted)]">
        No estimated stock holdings from disclosures since 2012.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {holdings.map((holding) => (
        <MemberHoldingCard key={holding.id} holding={holding} />
      ))}
    </ul>
  );
}

function MemberHoldingCard({ holding }: { holding: MemberHolding }) {
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
        <div className="flex min-w-0 flex-1 items-baseline justify-between gap-4">
          <div className="min-w-0">
            <TickerLink ticker={holding.ticker} className="text-base font-medium" />
            <div className="mt-0.5 text-sm text-[color:var(--muted)]">
              {formatHoldingsRange(holding.position_low, holding.position_high)}
            </div>
          </div>
        </div>
      </summary>
      <div className="space-y-2 px-5 pb-4 text-sm text-[color:var(--navy)]">
        {holding.asset ? (
          <p className="text-[color:var(--muted)]">{holding.asset}</p>
        ) : null}
        <p>
          Last activity: {formatActivityType(holding.last_activity_type)} ·{" "}
          {formatMemberDate(holding.last_activity_date)}
        </p>
        <p className="text-[color:var(--muted)]">
          Household estimate (self, spouse, and joint disclosures combined)
        </p>
      </div>
    </details>
  );
}
