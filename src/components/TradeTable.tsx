import {
  groupTradesByDisclosure,
} from "@/lib/groupTrades";
import type { CongressTrade } from "@/lib/types";
import { TradeDisclosureGroupCard } from "./TradeDisclosureGroupCard";

type Props = {
  trades: CongressTrade[];
};

export function TradeTable({ trades }: Props) {
  if (trades.length === 0) {
    return (
      <p className="hx-section px-4 py-8 text-center text-sm text-[color:var(--fog-dim)]">
        No disclosures match.
      </p>
    );
  }

  const groups = groupTradesByDisclosure(trades);

  return (
    <ul className="hx-row-list divide-y-0">
      {groups.map((group) => (
        <li key={group.key} className="border-b border-[color:var(--line)] last:border-0">
          <TradeDisclosureGroupCard
            group={group}
            defaultOpen={false}
          />
        </li>
      ))}
    </ul>
  );
}
