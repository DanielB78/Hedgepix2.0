"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import type {
  SearchEntity,
  UniversalSearchResult,
} from "@/lib/universalSearch";

type Props = {
  /** Larger styling for the Home hero search. */
  size?: "default" | "large";
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
};

type FlatItem = {
  entity: SearchEntity;
  group: "ticker" | "person";
};

export function UniversalSearch({
  size = "default",
  className = "",
  autoFocus = false,
  placeholder = "Search ticker, company or person…",
}: Props) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UniversalSearchResult | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const flatItems: FlatItem[] = [];
  if (result) {
    for (const entity of result.tickers) {
      flatItems.push({ entity, group: "ticker" });
    }
    for (const entity of result.people) {
      flatItems.push({ entity, group: "person" });
    }
  }

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    abortRef.current?.abort();
    if (!q) {
      setResult(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&tickers=5&people=5`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error("Search failed");
      const data = (await res.json()) as UniversalSearchResult;
      if (!controller.signal.aborted) {
        setResult(data);
        setActiveIndex(0);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      if (!controller.signal.aborted) {
        setResult({
          tickers: [],
          people: [],
          tickerTotal: 0,
          peopleTotal: 0,
        });
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResult(null);
      setLoading(false);
      return;
    }
    const t = window.setTimeout(() => {
      void runSearch(q);
    }, 180);
    return () => window.clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    function onDocMouseDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function navigateTo(entity: SearchEntity) {
    setOpen(false);
    setQuery("");
    setResult(null);
    router.push(entity.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || flatItems.length === 0) {
      if (event.key === "ArrowDown" && query.trim()) {
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(flatItems.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flatItems[activeIndex];
      if (item) navigateTo(item.entity);
    }
  }

  const showEmpty =
    open &&
    query.trim().length > 0 &&
    !loading &&
    result &&
    result.tickers.length === 0 &&
    result.people.length === 0;

  const showResults =
    open &&
    query.trim().length > 0 &&
    result &&
    (result.tickers.length > 0 || result.people.length > 0);

  const large = size === "large";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search tickers or people
      </label>
      <div
        className={[
          "flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] transition-colors focus-within:border-[var(--accent)]",
          large ? "px-3.5 py-3 shadow-sm" : "px-2.5 py-2",
        ].join(" ")}
      >
        <Search
          className={[
            "shrink-0 text-[var(--fog-mute)]",
            large ? "h-5 w-5" : "h-4 w-4",
          ].join(" ")}
          strokeWidth={1.75}
        />
        <input
          id={`${listId}-input`}
          ref={inputRef}
          data-testid="universal-search-input"
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open && !!query.trim()}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={[
            "min-w-0 flex-1 bg-transparent text-[var(--ink)] outline-none placeholder:text-[var(--fog-mute)]",
            large ? "text-[15px]" : "text-[13px]",
          ].join(" ")}
        />
        {loading ? (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-[var(--fog-mute)]"
            aria-hidden
          />
        ) : null}
      </div>

      {showEmpty ? (
        <div
          data-testid="universal-search-empty"
          className="absolute left-0 right-0 z-40 mt-1.5 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-[13px] text-[var(--fog-dim)] shadow-sm"
        >
          No matching tickers or people found.
        </div>
      ) : null}

      {showResults ? (
        <div
          id={listId}
          role="listbox"
          data-testid="universal-search-results"
          className="absolute left-0 right-0 z-40 mt-1.5 max-h-[22rem] overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--panel)] py-1.5 shadow-sm"
        >
          {result!.tickers.length > 0 ? (
            <div className="px-1.5 pb-1">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fog-mute)]">
                Tickers
              </p>
              {result!.tickers.map((entity, i) => {
                const flatIndex = i;
                const active = flatIndex === activeIndex;
                return (
                  <button
                    key={entity.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-testid={`search-ticker-${entity.symbol}`}
                    className={[
                      "flex w-full items-baseline justify-between gap-3 rounded px-2 py-1.5 text-left",
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "text-[var(--ink)] hover:bg-[var(--panel-muted)]",
                    ].join(" ")}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    onClick={() => navigateTo(entity)}
                  >
                    <span className="font-mono text-[13px] font-semibold">
                      {entity.symbol}
                    </span>
                    <span className="truncate text-[12px] text-[var(--fog-dim)]">
                      {entity.name}
                    </span>
                  </button>
                );
              })}
              {result!.tickerTotal > result!.tickers.length ? (
                <p className="px-2 py-1 text-[11px] text-[var(--fog-mute)]">
                  +{result!.tickerTotal - result!.tickers.length} more tickers
                </p>
              ) : null}
            </div>
          ) : null}

          {result!.people.length > 0 ? (
            <div className="border-t border-[var(--line)] px-1.5 pt-1">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fog-mute)]">
                People
              </p>
              {result!.people.map((entity, i) => {
                const flatIndex = result!.tickers.length + i;
                const active = flatIndex === activeIndex;
                return (
                  <button
                    key={entity.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-testid={`search-person-${entity.id}`}
                    className={[
                      "flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left",
                      active
                        ? "bg-[var(--accent-soft)]"
                        : "hover:bg-[var(--panel-muted)]",
                    ].join(" ")}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    onClick={() => navigateTo(entity)}
                  >
                    <span
                      className={[
                        "text-[13px] font-medium",
                        active ? "text-[var(--accent)]" : "text-[var(--ink)]",
                      ].join(" ")}
                    >
                      {entity.name}
                    </span>
                    <span className="text-[11px] text-[var(--fog-dim)]">
                      {entity.subtype}
                      {entity.meta ? ` · ${entity.meta}` : ""}
                    </span>
                  </button>
                );
              })}
              {result!.peopleTotal > result!.people.length ? (
                <p className="px-2 py-1 text-[11px] text-[var(--fog-mute)]">
                  +{result!.peopleTotal - result!.people.length} more people
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
