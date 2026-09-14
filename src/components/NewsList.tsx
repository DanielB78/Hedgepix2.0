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
  return active ? "hx-chip hx-chip-accent" : "hx-chip";
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
      <span className="hx-chip hx-chip-accent font-medium tracking-wide">
        {move.ticker}
      </span>
      <span>{ret}</span>
      {move.is_abnormal ? (
        <span className="hx-chip text-[color:var(--accent-sale)]">
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
    <li className="hx-row">
      <p className="hx-meta flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <time dateTime={article.published_at ?? undefined}>
          {formatNewsPublishedAt(article.published_at)}
        </time>
        <span aria-hidden="true">·</span>
        <span>{source}</span>
      </p>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 block"
      >
        <p className="text-sm font-semibold leading-snug text-[color:var(--fog)]">
          {article.title}
        </p>
      </a>
      {highlight ? (
        <p className="mt-1.5">
          <AbnormalBadge move={highlight} />
        </p>
      ) : null}
      {best ? (
        <p className="hx-meta mt-1.5">
          {best.name}
          {extras.length > 0 ? (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="underline-offset-2 hover:underline"
                aria-expanded={open}
              >
                {open ? "Hide sectors" : `+${extras.length} more`}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {open && extras.length > 0 ? (
        <ul className="hx-meta mt-1.5 space-y-0.5">
          {matches.map((m, i) => (
            <li key={`${m.code}-${i}`}>
              <span>
                #{i + 1} {m.name}
              </span>
              {m.code ? <span className="ml-1 opacity-70">({m.code})</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function TrendingSectorSection({ block }: { block: TrendingSectorBlock }) {
  return (
    <section className="hx-section">
      <header className="hx-section-head flex-col !items-start sm:flex-row sm:items-baseline">
        <div className="min-w-0">
          <h3 className="hx-section-title normal-case tracking-normal text-[color:var(--fog)]">
            {block.name}
          </h3>
          <p className="hx-meta mt-0.5">
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
          <p className="flex flex-wrap gap-1.5">
            {block.topTickers.map((t) => (
              <span key={t.ticker} className="hx-chip">
                <span className="text-[color:var(--fog)]">{t.ticker}</span>
                <span className="ml-1">{formatReturnPct(t.eventReturnPct)}</span>
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
      <ul>
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
      <p className="hx-section px-4 py-6 text-center text-sm text-[color:var(--fog-dim)]">
        No stored articles yet. Run{" "}
        <code className="text-[color:var(--fog)]">npm run update-data</code> (or{" "}
        <code className="text-[color:var(--fog)]">update.bat</code>) to fetch
        GDELT news into Supabase.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div
          className="hx-toolbar max-h-32 overflow-y-auto border border-[color:var(--line)] bg-[color:var(--panel)] p-2"
          style={{ borderRadius: "var(--radius-card)" }}
          role="group"
          aria-label="News feed filter"
        >
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
        <p className="hx-meta">
          {mode === "trending"
            ? "Sectors ranked by abnormal S&P 500 price moves after related headlines."
            : `Custom feed · ${selectedSectors.length} sector${selectedSectors.length === 1 ? "" : "s"} selected`}
        </p>
      </div>

      {mode === "trending" ? (
        trendingBlocks.length === 0 ? (
          <p className="hx-section px-4 py-6 text-center text-sm text-[color:var(--fog-dim)]">
            No abnormal ticker moves in the current news window yet. Tick one or
            more sectors above to browse by topic, or run the updater again after
            market hours.
          </p>
        ) : (
          <div className="space-y-3">
            {trendingBlocks.map((block) => (
              <TrendingSectorSection key={block.code} block={block} />
            ))}
          </div>
        )
      ) : customArticles.length === 0 ? (
        <p className="hx-section px-4 py-6 text-center text-sm text-[color:var(--fog-dim)]">
          No articles match the selected sectors in the current feed.
        </p>
      ) : (
        <ul className="hx-row-list">
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
