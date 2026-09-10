import type { NewsArticle } from "@/lib/news";
import { formatNewsPublishedAt } from "@/lib/news";

type Props = {
  articles: NewsArticle[];
};

export function NewsList({ articles }: Props) {
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
    <ul className="divide-y divide-[color:var(--line)] overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel)]">
      {articles.map((article) => {
        const source = article.domain?.trim() || article.source || "source";
        return (
          <li key={article.id}>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-4 transition-colors duration-200 hover:bg-[color:var(--panel-elevated)]"
            >
              <p className="font-[family-name:var(--font-display)] text-base font-semibold leading-snug text-[color:var(--fog)] sm:text-lg">
                {article.title}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[color:var(--fog-dim)]">
                <span className="text-[color:var(--mint)]">{source}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={article.published_at ?? undefined}>
                  {formatNewsPublishedAt(article.published_at)}
                </time>
              </p>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
