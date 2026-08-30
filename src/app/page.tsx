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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <SiteHeader syncState={result.syncState} />
      <MainNav active="latest" />

      {!result.configured || result.error ? (
        <div className="rounded-[16px] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--rust)]">
          {result.error ?? "Configuration incomplete."}
        </div>
      ) : null}

      <TradeFiltersForm filters={filters} />

      <section className="space-y-4">
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
