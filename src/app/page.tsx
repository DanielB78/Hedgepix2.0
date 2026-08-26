import { MainNav } from "@/components/MainNav";
import { Pagination } from "@/components/Pagination";
import { SiteHeader } from "@/components/SiteHeader";
import { TradeFiltersForm } from "@/components/TradeFiltersForm";
import { TradeTable } from "@/components/TradeTable";
import { fetchTrades, parseTradeFilters } from "@/lib/trades";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseTradeFilters(params);
  const result = await fetchTrades(filters);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <SiteHeader syncState={result.syncState} />
      <MainNav active="latest" />

      {!result.configured || result.error ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {result.error ?? "Configuration incomplete."}
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-stone-900">Filters</h2>
        <TradeFiltersForm filters={filters} />
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-stone-900">Disclosures</h2>
          <p className="text-sm text-stone-600">
            Ordered by disclosure date, then transaction date (newest first).
          </p>
        </div>
        <TradeTable trades={result.trades} />
        <Pagination
          filters={filters}
          page={result.page}
          pageSize={result.pageSize}
          totalCount={result.totalCount}
        />
      </section>
    </main>
  );
}
