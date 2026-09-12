import { BrandMark, SideNav, TopTabs } from "@/components/AppChrome";
import { AuthControls } from "@/components/AuthControls";
import { NewsList } from "@/components/NewsList";
import { fetchRecentNewsArticles } from "@/lib/news";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const result = await fetchRecentNewsArticles(40);
  const missingTable = Boolean(
    result.error?.includes("news_articles") ||
      result.error?.includes("schema cache"),
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 px-3 py-6 sm:px-6 lg:gap-8 lg:py-10">
      <SideNav active="news" showAuth />
      <main className="min-w-0 flex-1 space-y-8 pb-16">
        <div className="flex items-start justify-between gap-3 lg:hidden">
          <div className="flex-1">
            <BrandMark />
          </div>
          <AuthControls compact />
        </div>
        <div className="hidden lg:block">
          <BrandMark />
        </div>
        <TopTabs active="news" />

        <section className="space-y-5">
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[color:var(--fog)]">
              News
            </h2>
            <p className="text-sm text-[color:var(--fog-dim)]">
              Latest finance headlines from the last manual database update.
            </p>
          </div>

          {!result.configured ? (
            <div className="rounded-[16px] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--accent-sale)]">
              {result.error ?? "Configuration incomplete."}
            </div>
          ) : missingTable ? (
            <p className="rounded-[16px] bg-[color:var(--surface)] px-4 py-6 text-sm text-[color:var(--fog-dim)]">
                News storage is not set up yet. Apply{" "}
                <code className="text-[color:var(--fog)]">
                  supabase/migrations/20260910180000_news_articles.sql
                </code>{" "}
                (and the NAICS sector migrations) in the Supabase SQL Editor, then
                run{" "}
                <code className="text-[color:var(--fog)]">npm run update-data</code>{" "}
                (or <code className="text-[color:var(--fog)]">update.bat</code>).
            </p>
          ) : result.error ? (
            <div className="rounded-[16px] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--accent-sale)]">
              {result.error}
            </div>
          ) : (
            <NewsList articles={result.articles} />
          )}
        </section>
      </main>
    </div>
  );
}
