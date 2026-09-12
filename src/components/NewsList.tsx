"use client";

import { useMemo, useState } from "react";
import type { NewsArticle } from "@/lib/news";
import {
  articleSectorMatches,
  collectSectorOptions,
  formatNewsPublishedAt,
} from "@/lib/news";
import {
  buildTrendingSectorBlocks,
  filterArticlesBySectors,
  formatAbnormalityRatio,
  formatReturnPct,
  type NewsTickerMove,
  type TrendingSectorBlock,
} from "@/lib/newsTickerMoves";

type Props = {
  articles: NewsArticle[];
  tickerMoves: NewsTickerMove[];
};

type FeedMode = "trending" | "custom";

function chipClass(active: boolean) {
  return active
    ? "rounded-full bg-[color:var(--mint)] px-3 py-1.5 text-sm font-medium text-[color:var(--ink)]"
    : "rounded-full border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-1.5 text-sm font-medium text-[color:var(--fog-dim)] hover:bg-[color:var(--panel-elevated)] hover:text-[color:var(--fog)]";
}

function AbnormalBadge({ move }: { move: NewsTickerMove | null }) {
  if (!move) return null;
  const ret = formatReturnPct(move.event_return_pct);
  const ratio = formatAbnormalityRatio(move.abnormality_ratio);
  const tone = move.is_abnormal
    ? "text-[color:var(--accent-sale)]"
    : "text-[color:var(--fog-dim)]";
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 text-xs ${tone}`}
    >
      <span className="font-medium tracking-wide">{move.ticker}</span>
      <span>{ret}</span>
      {move.is_abnormal ? (
        <span className="rounded-full bg-[color:var(--accent-sale)]/15 px-1.5 py-0.5 font-medium">
          {ratio} typical
        </span>
      ) : null}
    </span>
  );
}

function NewsArticleRow({
  article,
  highlight,
}: {
  article: NewsArticle;
  highlight?: NewsTickerMove | null;
}) {
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
        {highlight ? (
          <p className="mt-2">
            <AbnormalBadge move={highlight} />
          </p>
        ) : null}
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

function TrendingSectorSection({ block }: { block: TrendingSectorBlock }) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel)]">
      <header className="space-y-2 border-b border-[color:var(--line)] px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[color:var(--fog)]">
            {block.name}
          </h3>
          <p className="text-xs text-[color:var(--fog-dim)]">
            {block.abnormalCount} abnormal move
            {block.abnormalCount === 1 ? "" : "s"}
            {block.score > 0 ? (
              <span className="ml-1 opacity-80">
                · score {block.score.toFixed(1)}
              </span>
            ) : null}
          </p>
        </div>
        {block.topTickers.length > 0 ? (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--fog-dim)]">
            {block.topTickers.map((t) => (
              <span key={t.ticker}>
                <span className="font-medium text-[color:var(--fog)]">
                  {t.ticker}
                </span>{" "}
                {formatReturnPct(t.eventReturnPct)}
                {t.abnormalityRatio != null ? (
                  <span className="ml-1 text-[color:var(--accent-sale)]">
                    {formatAbnormalityRatio(t.abnormalityRatio)}
                  </span>
                ) : null}
              </span>
            ))}
          </p>
        ) : null}
      </header>
      <ul className="divide-y divide-[color:var(--line)]">
        {block.articles.map(({ article, highlight }) => (
          <NewsArticleRow
            key={`${block.code}-${article.id}`}
            article={article}
            highlight={highlight}
          />
        ))}
      </ul>
    </section>
  );
}

export function NewsList({ articles, tickerMoves }: Props) {
  const [mode, setMode] = useState<FeedMode>("trending");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);

  const options = useMemo(() => collectSectorOptions(articles), [articles]);
  const trendingBlocks = useMemo(
    () => buildTrendingSectorBlocks(articles, tickerMoves),
    [articles, tickerMoves],
  );

  const customArticles = useMemo(
    () => filterArticlesBySectors(articles, selectedSectors),
    [articles, selectedSectors],
  );

  const movesByArticle = useMemo(() => {
    const map = new Map<string, NewsTickerMove[]>();
    for (const move of tickerMoves) {
      const list = map.get(move.article_id) ?? [];
      list.push(move);
      map.set(move.article_id, list);
    }
    return map;
  }, [tickerMoves]);

  function selectTrending() {
    setMode("trending");
    setSelectedSectors([]);
  }

  function toggleSector(code: string) {
    setSelectedSectors((prev) => {
      const next = prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code];
      setMode(next.length === 0 ? "trending" : "custom");
      return next;
    });
  }

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
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-center text-xs uppercase tracking-[0.14em] text-[color:var(--fog-dim)] sm:text-left">
          Filter
        </p>
        <div
          className="max-h-40 overflow-y-auto rounded-[14px] border border-[color:var(--line)] bg-[color:var(--surface)] p-2 sm:max-h-48"
          role="group"
          aria-label="News feed filter"
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={chipClass(mode === "trending")}
              aria-pressed={mode === "trending"}
              onClick={selectTrending}
            >
              Trending
            </button>
            {options.map((opt) => {
              const active =
                mode === "custom" && selectedSectors.includes(opt.code);
              return (
                <button
                  key={opt.code}
                  type="button"
                  className={chipClass(active)}
                  aria-pressed={active}
                  onClick={() => toggleSector(opt.code)}
                  title={opt.code}
                >
                  {opt.name}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-center text-sm text-[color:var(--fog-dim)] sm:text-left">
          {mode === "trending"
            ? "Sectors ranked by abnormal S&P 500 price moves after related headlines."
            : `Custom feed · ${selectedSectors.length} sector${selectedSectors.length === 1 ? "" : "s"} selected`}
        </p>
      </div>

      {mode === "trending" ? (
        trendingBlocks.length === 0 ? (
          <p className="rounded-[16px] bg-[color:var(--surface)] px-4 py-6 text-center text-sm text-[color:var(--fog-dim)]">
            No abnormal ticker moves in the current news window yet. Tick one or
            more sectors above to browse by topic, or run the updater again after
            market hours.
          </p>
        ) : (
          <div className="space-y-4">
            {trendingBlocks.map((block) => (
              <TrendingSectorSection key={block.code} block={block} />
            ))}
          </div>
        )
      ) : customArticles.length === 0 ? (
        <p className="rounded-[16px] bg-[color:var(--surface)] px-4 py-6 text-center text-sm text-[color:var(--fog-dim)]">
          No articles match the selected sectors in the current feed.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--line)] overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel)]">
          {customArticles.map((article) => {
            const moves = movesByArticle.get(article.id) ?? [];
            const highlight =
              [...moves].sort((a, b) => {
                const ab =
                  (b.is_abnormal ? 1 : 0) - (a.is_abnormal ? 1 : 0);
                if (ab !== 0) return ab;
                return (
                  (b.abnormality_ratio ?? 0) - (a.abnormality_ratio ?? 0)
                );
              })[0] ?? null;
            return (
              <NewsArticleRow
                key={article.id}
                article={article}
                highlight={highlight}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
