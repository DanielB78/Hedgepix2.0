import { AppShell } from "@/components/AppChrome";
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
    <AppShell
      active="ceo-buys"
      title="Insiders"
      description="Open-market Form 4 purchases and sales by CEOs. Same executive and ticker are combined with shares summed."
    >
      <FeedSearch
        q={filters.q}
        basePath="/ceo-buys"
        placeholder="Search CEO name or ticker"
      />

      {!result.configured || result.error ? (
        <div className="mb-4 hx-section px-4 py-3 text-sm text-[var(--accent-sale)]">
          {result.error ?? "Configuration incomplete."}
        </div>
      ) : null}

      <CeoBuysList rows={result.rows} />
      <div className="mt-4">
        <Pagination
          filters={{}}
          page={result.page}
          pageSize={result.pageSize}
          totalCount={result.totalCount}
          basePath="/ceo-buys"
          extraParams={{ q: filters.q }}
        />
      </div>
    </AppShell>
  );
}
