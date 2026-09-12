"use client";

import { useMemo, useState } from "react";
import type { NewsArticle } from "@/lib/news";
import {
  articleMatchesSector,
  articleSectorMatches,
  collectSectorOptions,
  formatNewsPublishedAt,
} from "@/lib/news";

type Props = {
  articles: NewsArticle[];
};

function NewsArticleRow({ article }: { article: NewsArticle }) {
  const [open, setOpen] = useState(false);
  const matches = articleSectorMatches(article);
  const best = matches[0] ?? null;
  const extras = matches.slice(1);
  const source = article.domain?.trim() || article.source || "source";

  return (
    <li>
      <div className="px-4 py-4 transition-colors duration-200 hover:bg-[color:var(--panel-elevated)]">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <p className="font-[family-name:var(--font-display)] text-base font-semibold leading-snug text-[color:var(--fog)] sm:text-lg">
            {article.title}
          </p>
        </a>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[color:var(--fog-dim)]">
          <span className="text-[color:var(--mint)]">{source}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={article.published_at ?? undefined}>
            {formatNewsPublishedAt(article.published_at)}
          </time>
          {best ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[color:var(--fog-dim)]/90">{best.name}</span>
            </>
          ) : null}
        </p>
        {extras.length > 0 ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-xs text-[color:var(--fog-dim)] underline-offset-2 hover:underline"
              aria-expanded={open}
            >
              {open ? "Hide sector matches" : "More sector matches"}
            </button>
            {open ? (
              <ul className="mt-2 space-y-1 text-xs text-[color:var(--fog-dim)]">
                {matches.map((m, i) => (
                  <li key={`${m.code}-${i}`}>
                    <span className="text-[color:var(--fog)]/80">
                      #{i + 1} {m.name}
                    </span>
                    {m.code ? (
                      <span className="ml-1 opacity-70">({m.code})</span>
                    ) : null}
                    {m.score != null ? (
                      <span className="ml-1 opacity-70">
                        · {m.score.toFixed(3)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function NewsList({ articles }: Props) {
  const [sectorCode, setSectorCode] = useState("");
  // Options are derived only from sectors present on the loaded articles.
  const options = useMemo(() => collectSectorOptions(articles), [articles]);
  const filtered = useMemo(
    () =>
      sectorCode
        ? articles.filter((a) => articleMatchesSector(a, sectorCode))
        : articles,
    [articles, sectorCode],
  );

  if (articles.length === 0) {
    return (
      <p className="rounded-[16px] bg-[color:var(--surface)] px-4 py-6 text-center text-sm text-[color:var(--fog-dim)]">
        No stored articles yet. Run{" "}
        <code className="text-[color:var(--fog)]">npm run update-data</code> (or{" "}
        <code className="text-[color:var(--fog)]">update.bat</code>) to fetch
        GDELT news into Supabase.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
        <label htmlFor="news-sector-filter" className="sr-only">
          Filter by sector
        </label>
        <select
          id="news-sector-filter"
          value={sectorCode}
          onChange={(e) => setSectorCode(e.target.value)}
          className="max-w-full rounded-[12px] border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2 text-sm text-[color:var(--fog)] outline-none focus:border-[color:var(--mint)]"
        >
          <option value="">All sectors</option>
          {options.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-[16px] bg-[color:var(--surface)] px-4 py-6 text-center text-sm text-[color:var(--fog-dim)]">
          No articles match this sector in the current feed.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--line)] overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel)]">
          {filtered.map((article) => (
            <NewsArticleRow key={article.id} article={article} />
          ))}
        </ul>
      )}
    </div>
  );
}
