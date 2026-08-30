"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TradeFilters } from "@/lib/types";

type Props = {
  filters: TradeFilters;
};

const fieldClass =
  "w-full rounded-[14px] border-0 bg-[color:var(--cream)] px-3 py-2.5 text-[color:var(--deep-navy)] outline-none ring-0 placeholder:text-[color:var(--muted)] focus:bg-white";

export function TradeFiltersForm({ filters }: Props) {
  const [open, setOpen] = useState(false);
  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.member) n += 1;
    if (filters.ticker) n += 1;
    if (filters.chamber) n += 1;
    if (filters.type) n += 1;
    return n;
  }, [filters]);

  return (
    <form method="get" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          name="member"
          defaultValue={filters.member ?? ""}
          placeholder="Search member"
          className={`${fieldClass} flex-1 bg-[color:var(--surface)]`}
        />
        <input
          name="ticker"
          defaultValue={filters.ticker ?? ""}
          placeholder="Ticker"
          className={`${fieldClass} sm:w-36 bg-[color:var(--surface)] uppercase`}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-[14px] bg-[color:var(--surface)] px-4 py-2.5 text-sm font-medium text-[color:var(--deep-navy)] transition-colors duration-200 hover:bg-[color:var(--surface-strong)]"
            aria-expanded={open}
          >
            Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>
          <button
            type="submit"
            className="rounded-[14px] bg-[color:var(--deep-navy)] px-4 py-2.5 text-sm font-medium text-[color:var(--cream)] transition-opacity duration-200 hover:opacity-90"
          >
            Search
          </button>
        </div>
      </div>

      {open ? (
        <div className="grid gap-3 rounded-[20px] bg-[color:var(--surface)] p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[color:var(--muted)]">Chamber</span>
            <select
              name="chamber"
              defaultValue={filters.chamber ?? ""}
              className={fieldClass}
            >
              <option value="">Any</option>
              <option value="house">House</option>
              <option value="senate">Senate</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[color:var(--muted)]">Type</span>
            <select
              name="type"
              defaultValue={filters.type ?? ""}
              className={fieldClass}
            >
              <option value="">Any</option>
              <option value="purchase">Purchase</option>
              <option value="sale">Sale</option>
              <option value="exchange">Exchange</option>
            </select>
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              className="rounded-[14px] bg-[color:var(--deep-navy)] px-4 py-2 text-sm font-medium text-[color:var(--cream)]"
            >
              Apply
            </button>
            <Link
              href="/"
              className="rounded-[14px] px-4 py-2 text-sm text-[color:var(--navy)] hover:bg-[color:var(--surface-strong)]"
            >
              Clear
            </Link>
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="chamber" value={filters.chamber ?? ""} />
          <input type="hidden" name="type" value={filters.type ?? ""} />
        </>
      )}
    </form>
  );
}
