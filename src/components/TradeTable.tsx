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
      <p className="rounded border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-stone-600">
        No trades match these filters.
      </p>
    );
  }

  const groups = groupTradesByDisclosure(trades);

  return (
    <ul className="space-y-3">
      {groups.map((group) => (
        <li key={group.key}>
          <TradeDisclosureGroupCard
            group={group}
            defaultOpen={group.trades.length === 1}
          />
        </li>
      ))}
    </ul>
  );
}
