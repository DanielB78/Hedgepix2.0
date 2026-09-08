import { CeoBuysList } from "@/components/CeoBuysList";
import { MainNav } from "@/components/MainNav";
import { Pagination } from "@/components/Pagination";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchCeoBuys, parseCeoBuysFilters } from "@/lib/ceoBuys";
import { fetchSyncState } from "@/lib/trades";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CeoBuysPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseCeoBuysFilters(params);
  const [result, syncState] = await Promise.all([
    fetchCeoBuys(filters),
    fetchSyncState(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <SiteHeader syncState={syncState} />
      <MainNav active="ceo-buys" />

      {!result.configured || result.error ? (
        <div className="rounded-[16px] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--rust)]">
          {result.error ?? "Configuration incomplete."}
        </div>
      ) : null}

      <section className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-2xl font-medium tracking-tight text-[color:var(--deep-navy)]">
            CEO Buys
          </h2>
          <p className="text-sm text-[color:var(--muted)]">
            Open-market Form 4 stock purchases by CEOs from the SEC Insider
            Transactions Data Sets.
          </p>
        </div>
        <CeoBuysList rows={result.rows} />
        <Pagination
          filters={{}}
          page={result.page}
          pageSize={result.pageSize}
          totalCount={result.totalCount}
          basePath="/ceo-buys"
        />
      </section>
    </main>
  );
}
