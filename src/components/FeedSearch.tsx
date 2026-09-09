type Props = {
  /** Current query string value. */
  q?: string;
  /** Base path for search results (home feed or CEO page). */
  basePath?: string;
  /** Preserve view= on the feed. */
  view?: string;
  placeholder?: string;
};

/** Plain GET search so filtering works without client-side routing races. */
export function FeedSearch({
  q = "",
  basePath = "/",
  view,
  placeholder = "Search name or ticker",
}: Props) {
  return (
    <form
      method="get"
      action={basePath}
      className="mx-auto flex w-full max-w-xl items-center gap-2"
      role="search"
    >
      {view ? <input type="hidden" name="view" value={view} /> : null}
      <label className="sr-only" htmlFor="feed-search">
        Search House, Senate, or CEO names and tickers
      </label>
      <input
        id="feed-search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-full border border-[color:var(--line)] bg-[color:var(--panel)] px-4 py-2.5 text-sm text-[color:var(--fog)] outline-none placeholder:text-[color:var(--fog-dim)] focus:border-[color:var(--mint)]/50"
      />
      <button
        type="submit"
        className="rounded-full bg-[color:var(--mint)] px-4 py-2.5 text-sm font-semibold text-[color:var(--ink)] transition-opacity hover:opacity-90"
      >
        Search
      </button>
      {q ? (
        <a
          href={view ? `${basePath}?view=${encodeURIComponent(view)}` : basePath}
          className="rounded-full px-3 py-2.5 text-sm text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]"
        >
          Clear
        </a>
      ) : null}
    </form>
  );
}
