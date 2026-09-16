"use client";

import { useSearchParams } from "next/navigation";

type Props = {
  q?: string;
  basePath?: string;
  view?: string;
  placeholder?: string;
};

const PRESERVE_KEYS = [
  "tx",
  "sectors",
  "sectorSrc",
  "overlap",
  "members",
  "tickers",
  "tab",
  "perf",
] as const;

/** Plain GET search so filtering works without client-side routing races. */
export function FeedSearch({
  q = "",
  basePath = "/",
  view,
  placeholder = "Search name or ticker",
}: Props) {
  const searchParams = useSearchParams();

  return (
    <form method="get" action={basePath} className="hx-toolbar mb-4" role="search">
      {view ? <input type="hidden" name="view" value={view} /> : null}
      {PRESERVE_KEYS.map((key) => {
        const value = searchParams.get(key);
        if (!value) return null;
        return <input key={key} type="hidden" name={key} value={value} />;
      })}
      <label className="sr-only" htmlFor="feed-search">
        Search House or Senate names and tickers
      </label>
      <input
        id="feed-search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        className="hx-input min-w-0 flex-1 sm:max-w-sm"
      />
      <button type="submit" className="hx-btn hx-btn-primary">
        Search
      </button>
      {q ? (
        <a
          href={(() => {
            const params = new URLSearchParams();
            if (view) params.set("view", view);
            for (const key of PRESERVE_KEYS) {
              const value = searchParams.get(key);
              if (value) params.set(key, value);
            }
            const qs = params.toString();
            return qs ? `${basePath}?${qs}` : basePath;
          })()}
          className="hx-btn hx-btn-ghost"
        >
          Clear
        </a>
      ) : null}
    </form>
  );
}
