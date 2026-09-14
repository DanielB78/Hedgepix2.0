import Link from "next/link";
import { AppShell } from "@/components/AppChrome";
import { CeoBuysList } from "@/components/CeoBuysList";
import { FeedSearch } from "@/components/FeedSearch";
import { Pagination } from "@/components/Pagination";
import { TickerLink } from "@/components/TickerLink";
import { fetchCeoBuys, parseCeoBuysFilters } from "@/lib/ceoBuys";
import { fetchForm144, formatShortDate, formatUsd } from "@/lib/secFilings";

export const dynamic = "force-dynamic";

type CeoBuysTab = "completed" | "proposed";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseTab(value: string | undefined): CeoBuysTab {
  return value === "proposed" ? "proposed" : "completed";
}

function TabsNav({ active }: { active: CeoBuysTab }) {
  const tabs: Array<{ id: CeoBuysTab; label: string }> = [
    { id: "completed", label: "Completed Trades" },
    { id: "proposed", label: "Proposed Sales" },
  ];
  return (
    <nav className="hx-toolbar mb-4 gap-3" aria-label="Insiders sections">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={`/ceo-buys?tab=${tab.id}`}
            className="hx-tab"
            data-active={selected ? "true" : "false"}
            aria-current={selected ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

async function ProposedSalesTable() {
  const result = await fetchForm144(150);

  if (!result.configured || result.error) {
    return (
      <div className="mb-4 hx-section px-4 py-3 text-sm text-[var(--accent-sale)]">
        {result.error ?? "Configuration incomplete."}
      </div>
    );
  }

  if (result.rows.length === 0) {
    return (
      <div className="hx-section px-5 py-8 text-center text-sm text-[var(--fog-dim)]">
        No proposed insider sales found.
      </div>
    );
  }

  return (
    <div className="hx-table-wrap">
      <table className="hx-table">
        <thead>
          <tr>
            <th>Filer</th>
            <th>Company / Ticker</th>
            <th className="num">Shares Proposed</th>
            <th className="num">Aggregate Value</th>
            <th>Proposed Date</th>
            <th>Filed</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.id}>
              <td className="text-[var(--ink)]">{row.filer_name ?? "—"}</td>
              <td>
                <div className="truncate text-[var(--ink)]">
                  {row.issuer_name ?? "—"}
                </div>
                {row.ticker ? (
                  <TickerLink
                    ticker={row.ticker}
                    className="mt-0.5 inline-block text-xs font-medium text-[var(--accent)] hover:opacity-80"
                  />
                ) : (
                  <span className="hx-meta">—</span>
                )}
              </td>
              <td className="num">
                {row.shares_proposed != null
                  ? new Intl.NumberFormat("en-US").format(row.shares_proposed)
                  : "—"}
              </td>
              <td className="num">{formatUsd(row.aggregate_market_value)}</td>
              <td className="whitespace-nowrap">
                {formatShortDate(row.proposed_sale_date)}
              </td>
              <td className="whitespace-nowrap">
                {row.filing_url ? (
                  <a
                    href={row.filing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] no-underline hover:opacity-80"
                  >
                    {formatShortDate(row.filing_date)}
                  </a>
                ) : (
                  formatShortDate(row.filing_date)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CeoBuysPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = parseTab(first(params.tab));
  const filters = parseCeoBuysFilters(params);
  const result = tab === "completed" ? await fetchCeoBuys(filters) : null;

  return (
    <AppShell
      active="ceo-buys"
      title="Insiders"
      description="Open-market Form 4 purchases and sales by CEOs, plus proposed Form 144 insider sales."
    >
      <TabsNav active={tab} />

      {tab === "completed" ? (
        <>
          <FeedSearch
            q={filters.q}
            basePath="/ceo-buys"
            placeholder="Search CEO name or ticker"
          />

          {result && (!result.configured || result.error) ? (
            <div className="mb-4 hx-section px-4 py-3 text-sm text-[var(--accent-sale)]">
              {result.error ?? "Configuration incomplete."}
            </div>
          ) : null}

          <CeoBuysList rows={result?.rows ?? []} />
          <div className="mt-4">
            <Pagination
              filters={{}}
              page={result?.page ?? 1}
              pageSize={result?.pageSize ?? 25}
              totalCount={result?.totalCount ?? 0}
              basePath="/ceo-buys"
              extraParams={{ q: filters.q }}
            />
          </div>
        </>
      ) : (
        <ProposedSalesTable />
      )}
    </AppShell>
  );
}
