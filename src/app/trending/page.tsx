import { MainNav } from "@/components/MainNav";
import { SiteHeader } from "@/components/SiteHeader";
import { TrendingControls } from "@/components/TrendingControls";
import { TrendingTable } from "@/components/TrendingTable";
import { fetchSyncState } from "@/lib/trades";
import { fetchTrending, parseTrendingFilters } from "@/lib/trending";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TrendingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseTrendingFilters(params);
  const [result, syncState] = await Promise.all([
    fetchTrending(filters),
    fetchSyncState(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <SiteHeader syncState={syncState} />
      <MainNav active="trending" />

      {!result.configured || result.error ? (
        <div className="rounded-[16px] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--rust)]">
          {result.error ?? "Configuration incomplete."}
        </div>
      ) : null}

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-medium tracking-tight text-[color:var(--deep-navy)]">
            Trending
          </h2>
        </div>
        <TrendingControls filters={filters} />
        <TrendingTable rows={result.rows} />
      </section>
    </main>
  );
}
