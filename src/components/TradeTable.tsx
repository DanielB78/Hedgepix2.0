import {
  groupTradesByDisclosure,
} from "@/lib/groupTrades";
import type { CongressTrade } from "@/lib/types";
import type { SectorOverlapResult } from "@/lib/sectorOverlap";
import { TradeDisclosureGroupCard } from "./TradeDisclosureGroupCard";

type Props = {
  trades: CongressTrade[];
  memberSectors?: string[];
  sectorOverlaps?: Record<string, SectorOverlapResult>;
};

export function TradeTable({
  trades,
  memberSectors,
  sectorOverlaps,
}: Props) {
  if (trades.length === 0) {
    return (
      <p className="hx-section px-4 py-8 text-center text-sm text-[color:var(--fog-dim)]">
        No disclosures match.
      </p>
    );
  }

  const groups = groupTradesByDisclosure(trades);

  return (
    <ul className="hx-row-list">
      {groups.map((group) => (
        <li key={group.key} className="border-b border-[color:var(--line)] last:border-0">
          <TradeDisclosureGroupCard
            group={group}
            defaultOpen={false}
            memberSectors={memberSectors}
            sectorOverlaps={sectorOverlaps}
          />
        </li>
      ))}
    </ul>
  );
}
