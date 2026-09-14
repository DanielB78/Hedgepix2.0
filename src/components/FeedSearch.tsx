type Props = {
  q?: string;
  basePath?: string;
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
      className="hx-toolbar mb-4"
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
        className="hx-input min-w-0 flex-1 sm:max-w-sm"
      />
      <button type="submit" className="hx-btn hx-btn-primary">
        Search
      </button>
      {q ? (
        <a
          href={view ? `${basePath}?view=${encodeURIComponent(view)}` : basePath}
          className="hx-btn hx-btn-ghost"
        >
          Clear
        </a>
      ) : null}
    </form>
  );
}
