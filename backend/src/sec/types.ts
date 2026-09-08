/** SEC Form 4 CEO open-market purchases. */

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
  sharesPurchased: number | null;
  pricePerShare: number | null;
  sharesOwnedAfter: number | null;
  ownershipType: string | null;
  filingUrl: string | null;
  formType: string;
  quarter: string;
  rawSource: Record<string, unknown>;
};

export type CeoBuysQuarterStatus = "success" | "failed" | "running";
