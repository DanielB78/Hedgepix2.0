import { BrandMark, SideNav, TopTabs } from "@/components/AppChrome";
import { CeoBuysList } from "@/components/CeoBuysList";
import { FeedSearch } from "@/components/FeedSearch";
import { Pagination } from "@/components/Pagination";
import { fetchCeoBuys, parseCeoBuysFilters } from "@/lib/ceoBuys";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CeoBuysPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseCeoBuysFilters(params);
  const result = await fetchCeoBuys(filters);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 px-3 py-6 sm:px-6 lg:gap-8 lg:py-10">
      <SideNav active="ceo-buys" />
      <main className="min-w-0 flex-1 space-y-8 pb-16">
        <BrandMark />
        <TopTabs active="ceo-buys" />
        <FeedSearch
          q={filters.q}
          basePath="/ceo-buys"
          placeholder="Search CEO name or ticker"
        />

        {!result.configured || result.error ? (
          <div className="rounded-[16px] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--accent-sale)]">
            {result.error ?? "Configuration incomplete."}
          </div>
        ) : null}

        <section className="space-y-5">
          <div className="space-y-1 text-center sm:text-left">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[color:var(--fog)]">
              CEO activity
            </h2>
            <p className="text-sm text-[color:var(--fog-dim)]">
              Open-market Form 4 purchases and sales by CEOs. Same CEO and
              ticker are combined into one card with shares summed.
            </p>
          </div>
          <CeoBuysList rows={result.rows} />
          <Pagination
            filters={{}}
            page={result.page}
            pageSize={result.pageSize}
            totalCount={result.totalCount}
            basePath="/ceo-buys"
            extraParams={{ q: filters.q }}
          />
        </section>
      </main>
    </div>
  );
}
