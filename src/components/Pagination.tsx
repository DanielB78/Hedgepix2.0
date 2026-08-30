import Link from "next/link";
import { buildHref } from "@/lib/filterHref";
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
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--muted)]">
      <p>
        {from}–{to} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={buildHref(filters, page - 1)}
            className="rounded-[14px] bg-[color:var(--surface)] px-3 py-1.5 text-[color:var(--deep-navy)] hover:bg-[color:var(--surface-strong)]"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-[14px] px-3 py-1.5 opacity-40">Previous</span>
        )}
        <span>
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={buildHref(filters, page + 1)}
            className="rounded-[14px] bg-[color:var(--surface)] px-3 py-1.5 text-[color:var(--deep-navy)] hover:bg-[color:var(--surface-strong)]"
          >
            Next
          </Link>
        ) : (
          <span className="rounded-[14px] px-3 py-1.5 opacity-40">Next</span>
        )}
      </div>
    </div>
  );
}
