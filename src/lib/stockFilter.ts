import type { PostgrestError } from "@supabase/supabase-js";
import {
  filterListedEquityRows,
  isListedEquityColumnMissing,
} from "./equity";

type RowWithAsset = {
  ticker?: string | null;
  asset?: string | null;
  is_listed_equity?: boolean | null;
};

export function isMissingListedEquityColumn(error: PostgrestError | null): boolean {
  return Boolean(error && isListedEquityColumnMissing(error.message));
}

/** Filter client-side when the DB column has not been migrated yet. */
export function applyListedEquityFallback<T extends RowWithAsset>(
  rows: T[] | null,
  count: number | null,
): { rows: T[]; count: number } {
  const filtered = filterListedEquityRows(rows ?? []);
  return {
    rows: filtered,
    count: count == null ? filtered.length : filtered.length,
  };
}
