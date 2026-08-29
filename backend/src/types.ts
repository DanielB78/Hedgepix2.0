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

export type ChamberRunStats = {
  chamber: Chamber;
  status: "success" | "failed";
  fetched: number;
  normalized: number;
  newCount: number;
  updatedCount: number;
  errors: number;
  errorMessage?: string;
};

export type UpsertStats = {
  fetched: number;
  newCount: number;
  updatedCount: number;
  errors: number;
};

/** Upstream Transaction shape shared by house/senate vendor pipelines. */
export type UpstreamTransaction = {
  id?: string;
  politician: string;
  transaction_date: string;
  filing_date: string;
  ticker: string | null;
  asset_name: string;
  asset_type: string;
  type: "buy" | "sell";
  amount_min: number;
  amount_max: number | null;
  owner: "self" | "joint" | "spouse" | "child";
  created_at?: string;
};
