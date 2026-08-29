import type { CongressTrade } from "./types";

export type TradeDisclosureGroup = {
  key: string;
  member: string | null;
  memberSlug: string | null;
  chamber: CongressTrade["chamber"];
  state: string | null;
  disclosureDate: string | null;
  trades: CongressTrade[];
  purchaseCount: number;
  saleCount: number;
};

function memberKey(trade: CongressTrade): string {
  if (trade.member_slug?.trim()) return trade.member_slug.trim();
  if (trade.member?.trim()) return trade.member.trim().toLowerCase();
  return "unknown";
}

/** Group trades by member identity + disclosure_date (presentation only). */
export function groupTradesByDisclosure(
  trades: CongressTrade[],
): TradeDisclosureGroup[] {
  const groups = new Map<string, TradeDisclosureGroup>();

  for (const trade of trades) {
    const mKey = memberKey(trade);
    const dateKey = trade.disclosure_date ?? "unknown";
    const key = `${mKey}|${dateKey}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        member: trade.member,
        memberSlug: trade.member_slug,
        chamber: trade.chamber,
        state: trade.state,
        disclosureDate: trade.disclosure_date,
        trades: [],
        purchaseCount: 0,
        saleCount: 0,
      };
      groups.set(key, group);
    }

    group.trades.push(trade);
    if (trade.transaction_type === "purchase") group.purchaseCount += 1;
    if (trade.transaction_type === "sale") group.saleCount += 1;

    // Prefer richer metadata if an earlier row was sparse
    if (!group.member && trade.member) group.member = trade.member;
    if (!group.memberSlug && trade.member_slug) {
      group.memberSlug = trade.member_slug;
    }
    if (!group.chamber && trade.chamber) group.chamber = trade.chamber;
    if (!group.state && trade.state) group.state = trade.state;
  }

  return [...groups.values()];
}
