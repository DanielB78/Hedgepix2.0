import { AppShell } from "@/components/AppChrome";
import { TickerLink } from "@/components/TickerLink";
import {
  fetchNportHoldings,
  formatPct,
  formatShares,
  formatShortDate,
  formatUsd,
} from "@/lib/secFilings";

export const dynamic = "force-dynamic";

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 hx-section px-4 py-3 text-sm text-[var(--accent-sale)]">
      {message}
    </div>
  );
}

async function NportTable() {
  const result = await fetchNportHoldings(150);

  if (!result.configured || result.error) {
    return <ErrorBanner message={result.error ?? "Configuration incomplete."} />;
  }

  if (result.rows.length === 0) {
    return (
      <div className="hx-section px-5 py-8 text-center text-sm text-[var(--fog-dim)]">
        No N-PORT fund holdings found.
      </div>
    );
  }

  return (
    <div className="hx-table-wrap">
      <table className="hx-table">
        <thead>
          <tr>
            <th>Fund</th>
            <th>Company / Ticker</th>
            <th className="num">Shares</th>
            <th className="num">Value</th>
            <th className="num">% Portfolio</th>
            <th>Report Date</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.id}>
              <td className="text-[var(--ink)]">{row.fund_name ?? "—"}</td>
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
              <td className="num">{formatPct(row.pct_portfolio)}</td>
              <td className="whitespace-nowrap">{formatShortDate(row.report_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function FundsPage() {
  return (
    <AppShell
      active="funds"
      title="Funds"
      description="Registered fund (N-PORT) holdings, filtered to notable positions."
    >
      <NportTable />
    </AppShell>
  );
}
