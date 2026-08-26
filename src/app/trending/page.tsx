import { MainNav } from "@/components/MainNav";
import { SiteHeader } from "@/components/SiteHeader";
import { TrendingControls } from "@/components/TrendingControls";
import { TrendingTable } from "@/components/TrendingTable";
import { fetchSyncState } from "@/lib/trades";
import {
  fetchTrending,
  parseTrendingFilters,
  periodLabel,
} from "@/lib/trending";

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

  const modeLabel =
    filters.mode === "buys"
      ? "Buys"
      : filters.mode === "sales"
        ? "Sales"
        : "All activity";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <SiteHeader syncState={syncState} />
      <MainNav active="trending" />

      {!result.configured || result.error ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {result.error ?? "Configuration incomplete."}
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-stone-900 sm:text-3xl">
            Trending — {periodLabel(filters.periodDays)}
          </h2>
          <p className="max-w-3xl text-sm text-stone-700">
            Ranked by congressional trade disclosures that became public in this
            window (using disclosure date, not transaction date). A ticker ranks
            higher when more members of Congress have recently disclosed
            transactions involving it — not because of stock-market trading
            volume or price moves.
          </p>
          <p className="text-sm text-stone-600">
            Showing <span className="font-medium text-stone-800">{modeLabel}</span>
            {" · "}
            cutoff {result.cutoffDate} UTC
          </p>
        </div>

        <TrendingControls filters={filters} />
        <TrendingTable rows={result.rows} />
      </section>
    </main>
  );
}
