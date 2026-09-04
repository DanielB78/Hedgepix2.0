export type Chamber = "house" | "senate";

export type CongressTrade = {
  sourceId: string;
  chamber: Chamber;
  member: string;
  ticker: string | null;
  assetName: string;
  assetType: string | null;
  transactionType: "purchase" | "sale";
  amountLow: number | null;
  amountHigh: number | null;
  transactionDate: string;
  disclosureDate: string;
  owner: "self" | "joint" | "spouse" | "child" | null;
  rawSource?: unknown;
};

export type UpsertStats = {
  fetched: number;
  newCount: number;
  updatedCount: number;
  errors: number;
};
