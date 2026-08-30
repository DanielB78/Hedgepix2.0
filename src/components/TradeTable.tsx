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
      <p className="rounded-[20px] bg-[color:var(--surface)] px-5 py-10 text-center text-[color:var(--muted)]">
        No disclosures match.
      </p>
    );
  }

  const groups = groupTradesByDisclosure(trades);

  return (
    <ul className="space-y-2.5">
      {groups.map((group) => (
        <li key={group.key}>
          <TradeDisclosureGroupCard
            group={group}
            defaultOpen={false}
          />
        </li>
      ))}
    </ul>
  );
}
