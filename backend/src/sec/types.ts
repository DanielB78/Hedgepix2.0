/** SEC Form 4 CEO open-market purchase (P) or sale (S). */

export type SecTransCode = "P" | "S";

export type CeoStockPurchase = {
  sourceId: string;
  accessionNumber: string;
  nonderivTransSk: string;
  reportingOwnerCik: string | null;
  issuerCik: string | null;
  ceoName: string;
  officerTitle: string | null;
  issuerName: string | null;
  ticker: string | null;
  securityTitle: string | null;
  transactionDate: string | null;
  filingDate: string | null;
  /** Shares bought (P) or sold (S). */
  sharesPurchased: number | null;
  pricePerShare: number | null;
  sharesOwnedAfter: number | null;
  ownershipType: string | null;
  filingUrl: string | null;
  formType: string;
  quarter: string;
  transactionCode: SecTransCode;
  rawSource: Record<string, unknown>;
};

export type CeoBuysQuarterStatus = "success" | "failed" | "running";
