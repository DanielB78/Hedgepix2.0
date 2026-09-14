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
      <p className="hx-section px-4 py-8 text-center text-sm text-[color:var(--fog-dim)]">
        No estimated stock holdings from disclosures since 2012.
      </p>
    );
  }

  return (
    <div className="hx-table-wrap">
      <table className="hx-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th className="num">Position</th>
            <th>Last activity</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => (
            <MemberHoldingRow key={holding.id} holding={holding} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberHoldingRow({ holding }: { holding: MemberHolding }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <td>
          <TickerLink ticker={holding.ticker} className="font-medium" />
        </td>
        <td className="num">
          {formatHoldingsRange(holding.position_low, holding.position_high)}
        </td>
        <td className="whitespace-nowrap">
          {formatActivityType(holding.last_activity_type)} ·{" "}
          {formatMemberDate(holding.last_activity_date)}
        </td>
      </tr>
      {open ? (
        <tr className="animate-expand bg-[color:var(--panel-elevated)]">
          <td colSpan={3}>
            <div className="space-y-1 text-sm text-[color:var(--fog-dim)]">
              {holding.asset ? <p>{holding.asset}</p> : null}
              <p>
                Household estimate (self, spouse, and joint disclosures combined)
              </p>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
