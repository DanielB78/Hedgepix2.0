import Link from "next/link";
import { AppShell } from "@/components/AppChrome";
import { TickerLink } from "@/components/TickerLink";
import {
  changeLabel,
  fetch13fChanges,
  fetch13fHoldingsForManager,
  fetchOwnershipFilings,
  formatPct,
  formatShares,
  formatShortDate,
  formatUsd,
} from "@/lib/secFilings";

export const dynamic = "force-dynamic";

type InvestorsTab = "holdings" | "stakes";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseTab(value: string | undefined): InvestorsTab {
  return value === "stakes" ? "stakes" : "holdings";
}

function TabsNav({ active, manager }: { active: InvestorsTab; manager?: string }) {
  const tabs: Array<{ id: InvestorsTab; label: string }> = [
    { id: "holdings", label: "13F Position Changes" },
    { id: "stakes", label: "13D/G Ownership Stakes" },
  ];
  return (
    <nav className="hx-toolbar mb-4 gap-3" aria-label="Investors sections">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        const params = new URLSearchParams();
        params.set("tab", tab.id);
        if (manager) params.set("manager", manager);
        return (
          <Link
            key={tab.id}
            href={`/investors?${params.toString()}`}
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

async function ManagerHoldingsSection({ managerCik }: { managerCik: string }) {
  const result = await fetch13fHoldingsForManager(managerCik);

  if (!result.configured || result.error) {
    return <ErrorBanner message={result.error ?? "Configuration incomplete."} />;
  }

  if (result.rows.length === 0) {
    return (
      <div className="hx-section px-5 py-8 text-center text-sm text-[var(--fog-dim)]">
        No holdings found for this manager.
      </div>
    );
  }

  return (
    <div className="hx-table-wrap">
      <table className="hx-table">
        <thead>
          <tr>
            <th>Company / Ticker</th>
            <th className="num">Shares</th>
            <th className="num">Value</th>
            <th>Period</th>
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
              <td className="num">{formatShares(row.shares)}</td>
              <td className="num">{formatUsd(row.value_usd)}</td>
              <td className="whitespace-nowrap">{formatShortDate(row.report_period)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function HoldingsTable() {
  const result = await fetch13fChanges(150);

  if (!result.configured || result.error) {
    return <ErrorBanner message={result.error ?? "Configuration incomplete."} />;
  }

  if (result.rows.length === 0) {
    return (
      <div className="hx-section px-5 py-8 text-center text-sm text-[var(--fog-dim)]">
        No 13F position changes found.
      </div>
    );
  }

  return (
    <div className="hx-table-wrap">
      <table className="hx-table">
        <thead>
          <tr>
            <th>Investor</th>
            <th>Company / Ticker</th>
            <th>Change</th>
            <th className="num">Shares</th>
            <th className="num">Value</th>
            <th>Period</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link
                  href={`/investors?tab=holdings&manager=${encodeURIComponent(row.manager_cik)}`}
                  className="font-medium text-[var(--ink)] no-underline hover:text-[var(--accent)]"
                >
                  {row.manager_name ?? row.manager_cik}
                </Link>
              </td>
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
              <td>
                <span
                  className={
                    row.change_type === "REDUCED" || row.change_type === "EXITED"
                      ? "hx-sell"
                      : "hx-buy"
                  }
                >
                  {changeLabel(row.change_type)}
                </span>
                {row.share_change_pct != null ? (
                  <div className="hx-meta mt-0.5">{formatPct(row.share_change_pct)}</div>
                ) : null}
              </td>
              <td className="num">{formatShares(row.shares)}</td>
              <td className="num">{formatUsd(row.value_usd)}</td>
              <td className="whitespace-nowrap">{formatShortDate(row.report_period)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function StakesTable() {
  const result = await fetchOwnershipFilings(150);

  if (!result.configured || result.error) {
    return <ErrorBanner message={result.error ?? "Configuration incomplete."} />;
  }

  if (result.rows.length === 0) {
    return (
      <div className="hx-section px-5 py-8 text-center text-sm text-[var(--fog-dim)]">
        No 13D/G ownership filings found.
      </div>
    );
  }

  return (
    <div className="hx-table-wrap">
      <table className="hx-table">
        <thead>
          <tr>
            <th>Investor</th>
            <th>Company</th>
            <th className="num">Ownership %</th>
            <th>Form</th>
            <th>Filed</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.id}>
              <td className="text-[var(--ink)]">{row.reporting_person ?? "—"}</td>
              <td>
                <div className="truncate text-[var(--ink)]">
                  {row.target_company ?? "—"}
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
              <td className="num">{formatPct(row.ownership_pct)}</td>
              <td className="whitespace-nowrap">{row.form_type}</td>
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

export default async function InvestorsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = parseTab(first(params.tab));
  const manager = first(params.manager);

  return (
    <AppShell
      active="investors"
      title="Investors"
      description="Institutional 13F portfolio changes and Schedule 13D/G ownership stakes."
    >
      <TabsNav active={tab} manager={manager} />
      {tab === "holdings" ? (
        manager ? (
          <ManagerHoldingsSection managerCik={manager} />
        ) : (
          <HoldingsTable />
        )
      ) : (
        <StakesTable />
      )}
    </AppShell>
  );
}
