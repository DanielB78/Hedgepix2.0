"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

type Props = {
  /** Current query string value. */
  q?: string;
  /** Base path for search results (home feed or CEO page). */
  basePath?: string;
  /** Preserve view= on the feed. */
  view?: string;
  placeholder?: string;
};

export function FeedSearch({
  q = "",
  basePath = "/",
  view,
  placeholder = "Search name or ticker",
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = value.trim();
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (next) params.set("q", next);
    const qs = params.toString();
    const href = qs ? `${basePath}?${qs}` : basePath;
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto flex w-full max-w-xl items-center gap-2"
      role="search"
    >
      <label className="sr-only" htmlFor="feed-search">
        Search House, Senate, or CEO names and tickers
      </label>
      <input
        id="feed-search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-full border border-[color:var(--line)] bg-[color:var(--panel)] px-4 py-2.5 text-sm text-[color:var(--fog)] outline-none placeholder:text-[color:var(--fog-dim)] focus:border-[color:var(--mint)]/50"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[color:var(--mint)] px-4 py-2.5 text-sm font-semibold text-[color:var(--ink)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        Search
      </button>
      {q ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            const params = new URLSearchParams();
            if (view) params.set("view", view);
            const qs = params.toString();
            startTransition(() => {
              router.push(qs ? `${basePath}?${qs}` : basePath);
            });
          }}
          className="rounded-full px-3 py-2.5 text-sm text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]"
        >
          Clear
        </button>
      ) : null}
    </form>
  );
}
