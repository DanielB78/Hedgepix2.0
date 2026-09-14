import { AppShell } from "@/components/AppChrome";
import { NewsList } from "@/components/NewsList";
import { fetchRecentNewsArticles } from "@/lib/news";
import { fetchNewsTickerMovesForArticles } from "@/lib/newsTickerMoves";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const result = await fetchRecentNewsArticles(100);
  const tickerMoves = result.articles.length
    ? await fetchNewsTickerMovesForArticles(result.articles.map((a) => a.id))
    : [];
  const missingTable = Boolean(
    result.error?.includes("news_articles") ||
      result.error?.includes("schema cache"),
  );

  return (
    <AppShell
      active="news"
      title="News"
      description="Market headlines linked to sectors and tickers, ranked by abnormal moves where available."
    >
      {!result.configured ? (
        <div className="hx-section px-4 py-3 text-sm text-[var(--accent-sale)]">
          {result.error ?? "Configuration incomplete."}
        </div>
      ) : missingTable ? (
        <p className="hx-section px-4 py-6 text-sm text-[var(--fog-dim)]">
          News storage is not set up yet. Apply{" "}
          <code className="text-[var(--fog)]">
            supabase/migrations/20260910180000_news_articles.sql
          </code>{" "}
          (and the NAICS sector migrations) in the Supabase SQL Editor, then run{" "}
          <code className="text-[var(--fog)]">npm run update-data</code>.
        </p>
      ) : result.error ? (
        <div className="hx-section px-4 py-3 text-sm text-[var(--accent-sale)]">
          {result.error}
        </div>
      ) : (
        <NewsList articles={result.articles} tickerMoves={tickerMoves} />
      )}
    </AppShell>
  );
}
