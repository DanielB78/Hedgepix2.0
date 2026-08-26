import Link from "next/link";
import { buildHref } from "@/components/TradeFiltersForm";
import type { TradeFilters } from "@/lib/types";

type Props = {
  filters: TradeFilters;
  page: number;
  pageSize: number;
  totalCount: number;
};

export function Pagination({ filters, page, pageSize, totalCount }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalCount === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-700">
      <p>
        Showing {from}–{to} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={buildHref(filters, page - 1)}
            className="rounded border border-stone-300 px-3 py-1.5 hover:bg-stone-100"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded border border-stone-200 px-3 py-1.5 text-stone-400">
            Previous
          </span>
        )}
        <span>
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={buildHref(filters, page + 1)}
            className="rounded border border-stone-300 px-3 py-1.5 hover:bg-stone-100"
          >
            Next
          </Link>
        ) : (
          <span className="rounded border border-stone-200 px-3 py-1.5 text-stone-400">
            Next
          </span>
        )}
      </div>
    </div>
  );
}
