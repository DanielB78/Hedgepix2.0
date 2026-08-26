import { Pagination } from "@/components/Pagination";
import { TradeFiltersForm } from "@/components/TradeFiltersForm";
import { TradeTable } from "@/components/TradeTable";
import { fetchTrades, parseTradeFilters } from "@/lib/trades";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Never";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseTradeFilters(params);
  const result = await fetchTrades(filters);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-sm font-medium tracking-wide text-teal-800 uppercase">
          Hedgepix · Disclosure monitor
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-stone-900 sm:text-5xl">
          Congress Trade Monitor
        </h1>
        <p className="max-w-2xl text-base text-stone-700">
          Recent House and Senate STOCK Act securities disclosures. Data is
          ingested from Bargo and retained locally so history remains available
          after it leaves Bargo&apos;s rolling window.
        </p>
        <p className="rounded border border-teal-800/20 bg-teal-50 px-3 py-2 text-sm text-teal-950">
          Trade data provided by{" "}
          <a
            href="https://www.bargo.ai/free-apis/congress"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            Bargo
          </a>
          . Independent, unofficial normalized STOCK Act filings — not an
          official congressional API and not investment advice.
        </p>
      </header>

      <section className="flex flex-wrap items-end justify-between gap-3 rounded border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700 shadow-sm">
        <div>
          <div className="font-medium text-stone-900">Last successful sync</div>
          <div>{formatTimestamp(result.syncState?.last_success_at)}</div>
        </div>
        <div>
          <div className="font-medium text-stone-900">Last attempt</div>
          <div>{formatTimestamp(result.syncState?.last_attempt_at)}</div>
        </div>
        <div>
          <div className="font-medium text-stone-900">Latest disclosure seen</div>
          <div>{result.syncState?.latest_seen_disclosure_date ?? "—"}</div>
        </div>
        {result.syncState?.last_error ? (
          <div className="w-full text-red-700">
            Last error: {result.syncState.last_error}
          </div>
        ) : null}
      </section>

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
