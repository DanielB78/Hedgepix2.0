import Link from "next/link";
import { buildHref } from "@/lib/filterHref";
import type { TradeFilters } from "@/lib/types";

type Props = {
  filters: TradeFilters;
  page: number;
  pageSize: number;
  totalCount: number;
  basePath?: string;
  /** Extra query params preserved across pages (e.g. q). */
  extraParams?: Record<string, string | undefined>;
};

function pageHref(
  filters: TradeFilters,
  page: number,
  basePath = "/",
  extraParams?: Record<string, string | undefined>,
): string {
  if (basePath === "/") {
    return buildHref(filters, page);
  }

  const params = new URLSearchParams();
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) params.set(key, value);
    }
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  filters,
  page,
  pageSize,
  totalCount,
  basePath = "/",
  extraParams,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalCount === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--fog-dim)]">
      <p>
        {from}–{to} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={pageHref(filters, page - 1, basePath, extraParams)}
            className="rounded-full bg-[color:var(--panel-elevated)] px-3 py-1.5 text-[color:var(--fog)] hover:text-[color:var(--mint)]"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-full px-3 py-1.5 opacity-40">Previous</span>
        )}
        <span>
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={pageHref(filters, page + 1, basePath, extraParams)}
            className="rounded-full bg-[color:var(--panel-elevated)] px-3 py-1.5 text-[color:var(--fog)] hover:text-[color:var(--mint)]"
          >
            Next
          </Link>
        ) : (
          <span className="rounded-full px-3 py-1.5 opacity-40">Next</span>
        )}
      </div>
    </div>
  );
}
