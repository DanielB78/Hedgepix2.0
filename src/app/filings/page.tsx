import Link from "next/link";
import { AppShell } from "@/components/AppChrome";
import { TickerLink } from "@/components/TickerLink";
import {
  fetchCompanyFilings,
  fetchFundamentals,
  fetchOfferings,
  formatPct,
  formatShortDate,
  formatUsd,
} from "@/lib/secFilings";

export const dynamic = "force-dynamic";

type FilingsTab = "events" | "reports" | "offerings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseTab(value: string | undefined): FilingsTab {
  if (value === "reports" || value === "offerings") return value;
  return "events";
}

function TabsNav({ active }: { active: FilingsTab }) {
  const tabs: Array<{ id: FilingsTab; label: string }> = [
    { id: "events", label: "Company Events (8-K)" },
    { id: "reports", label: "Fundamentals (10-Q/10-K)" },
    { id: "offerings", label: "Offerings" },
  ];
  return (
    <nav className="hx-toolbar mb-4 gap-3" aria-label="Filings sections">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={`/filings?tab=${tab.id}`}
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

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 hx-section px-4 py-3 text-sm text-[var(--accent-sale)]">
      {message}
    </div>
  );
}

async function EventsTable() {
  const result = await fetchCompanyFilings({ formPrefix: "8-K", limit: 150 });

  if (!result.configured || result.error) {
    return <ErrorBanner message={result.error ?? "Configuration incomplete."} />;
  }

  if (result.rows.length === 0) {
    return (
      <div className="hx-section px-5 py-8 text-center text-sm text-[var(--fog-dim)]">
        No 8-K filings found.
      </div>
    );
  }

  return (
    <div className="hx-table-wrap">
      <table className="hx-table">
        <thead>
          <tr>
            <th>Company / Ticker</th>
            <th>Items</th>
            <th>Description</th>
            <th>Filed</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="truncate text-[var(--ink)]">
                  {row.company_name ?? "—"}
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
              <td className="whitespace-nowrap">{row.items ?? "—"}</td>
              <td className="max-w-[320px] truncate">{row.description ?? "—"}</td>
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

async function ReportsTable() {
  const result = await fetchFundamentals(100);

  if (!result.configured || result.error) {
    return <ErrorBanner message={result.error ?? "Configuration incomplete."} />;
  }

  if (result.rows.length === 0) {
    return (
      <div className="hx-section px-5 py-8 text-center text-sm text-[var(--fog-dim)]">
        No fundamentals data found.
      </div>
    );
  }

  return (
    <div className="hx-table-wrap">
      <table className="hx-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Period</th>
            <th className="num">Revenue</th>
            <th className="num">Net Income</th>
            <th className="num">EPS</th>
            <th className="num">YoY</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="truncate text-[var(--ink)]">
                  {row.company_name ?? row.ticker ?? "—"}
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
              <td className="whitespace-nowrap">{formatShortDate(row.period_end)}</td>
              <td className="num">{formatUsd(row.revenue)}</td>
              <td className="num">{formatUsd(row.net_income)}</td>
              <td className="num">{row.eps != null ? row.eps.toFixed(2) : "—"}</td>
              <td className="num">{formatPct(row.revenue_yoy_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function OfferingsTable() {
  const result = await fetchOfferings(150);

  if (!result.configured || result.error) {
    return <ErrorBanner message={result.error ?? "Configuration incomplete."} />;
  }

  if (result.rows.length === 0) {
    return (
      <div className="hx-section px-5 py-8 text-center text-sm text-[var(--fog-dim)]">
        No offering filings found.
      </div>
    );
  }

  return (
    <div className="hx-table-wrap">
      <table className="hx-table">
        <thead>
          <tr>
            <th>Company / Ticker</th>
            <th>Form</th>
            <th className="num">Shares Offered</th>
            <th className="num">Price</th>
            <th className="num">Offering Size</th>
            <th>Filed</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.id}>
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
              <td className="whitespace-nowrap">{row.form_type}</td>
              <td className="num">
                {row.shares_offered != null
                  ? new Intl.NumberFormat("en-US").format(row.shares_offered)
                  : "—"}
              </td>
              <td className="num">{formatUsd(row.price)}</td>
              <td className="num">{formatUsd(row.offering_size)}</td>
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

export default async function FilingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = parseTab(first(params.tab));

  return (
    <AppShell
      active="filings"
      title="Filings"
      description="Company SEC filings: 8-K events, quarterly/annual fundamentals, and registered offerings."
    >
      <TabsNav active={tab} />
      {tab === "events" ? <EventsTable /> : null}
      {tab === "reports" ? <ReportsTable /> : null}
      {tab === "offerings" ? <OfferingsTable /> : null}
    </AppShell>
  );
}
