export type KadoaFiler = {
  id: string;
  full_name: string;
  chamber: string | null;
  branch: string | null;
  party?: string | null;
  state?: string | null;
};

export type KadoaTrade = {
  id: string;
  filing_id?: string | null;
  filer_id?: string | null;
  source_id?: string | null;
  transaction_date: string | null;
  notification_date?: string | null;
  filing_date: string | null;
  owner?: string | null;
  ticker?: string | null;
  asset_name?: string | null;
  asset_type?: string | null;
  transaction_type?: string | null;
  amount_range_low?: number | null;
  amount_range_high?: number | null;
  amount_range_label?: string | null;
  comment?: string | null;
  doc_url?: string | null;
  filing_type?: string | null;
};

export type KadoaFilerFile = {
  filer: KadoaFiler;
  trades: KadoaTrade[];
};

export type KadoaLoadStats = {
  kadoaRowsLoaded: number;
  houseSenateRows: number;
  executiveRowsSkipped: number;
  stockRowsRetained: number;
  nonStockRowsDiscarded: number;
  purchaseSaleSkipped: number;
  members: number;
  uniqueTickers: number;
  dateFrom: string | null;
  dateTo: string | null;
};
