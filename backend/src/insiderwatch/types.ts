export type InsiderWatchCsvRow = {
  chamber: string;
  member: string;
  member_slug: string;
  ticker: string;
  asset: string;
  action: string;
  amount_range: string;
  amount_min_usd: string;
  transaction_date: string;
  filed_date: string;
  disclosure_lag_days: string;
  owner: string;
  filing_id: string;
};

export type InsiderWatchLoadStats = {
  rowsDownloaded: number;
  rowsAfterDateFilter: number;
  houseSenateRows: number;
  stockRowsRetained: number;
  nonStockRowsIgnored: number;
  malformedRowsSkipped: number;
  members: number;
  uniqueTickers: number;
  dateFrom: string | null;
  dateTo: string | null;
  cutoffFiledDate: string;
  overlapDays: number;
};
