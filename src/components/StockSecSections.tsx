import Link from "next/link";
import {
  changeLabel,
  fetch13fChanges,
  fetchCompanyFilings,
  fetchForm144,
  fetchNportHoldings,
  fetchOwnershipFilings,
  formatPct,
  formatShares,
  formatShortDate,
  formatUsd,
} from "@/lib/secFilings";

const MAX_ROWS = 6;

type Props = {
  ticker: string;
};

function SectionShell({
  title,
  viewMoreHref,
  children,
}: {
  title: string;
  viewMoreHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hx-section">
      <div className="hx-section-head">
        <p className="hx-section-title">{title}</p>
        <Link
          href={viewMoreHref}
          className="text-xs font-medium text-[var(--accent)] no-underline hover:opacity-80"
        >
          View more
        </Link>
      </div>
      {children}
    </div>
  );
}

export async function StockSecSections({ ticker }: Props) {
  const upper = ticker.toUpperCase();

  const [changes, ownership, form144, filings, nport] = await Promise.all([
    fetch13fChanges(300),
    fetchOwnershipFilings(300),
    fetchForm144(300),
    fetchCompanyFilings({ ticker: upper, limit: MAX_ROWS }),
    fetchNportHoldings(300),
  ]);

  const changeRows = changes.configured && !changes.error
    ? changes.rows.filter((row) => row.ticker === upper).slice(0, MAX_ROWS)
    : [];
  const ownershipRows = ownership.configured && !ownership.error
    ? ownership.rows.filter((row) => row.ticker === upper).slice(0, MAX_ROWS)
    : [];
  const form144Rows = form144.configured && !form144.error
    ? form144.rows.filter((row) => row.ticker === upper).slice(0, MAX_ROWS)
    : [];
  const filingRows = filings.configured && !filings.error ? filings.rows : [];
  const nportRows = nport.configured && !nport.error
    ? nport.rows.filter((row) => row.ticker === upper).slice(0, MAX_ROWS)
    : [];

  const hasAny =
    changeRows.length > 0 ||
    ownershipRows.length > 0 ||
    form144Rows.length > 0 ||
    filingRows.length > 0 ||
    nportRows.length > 0;

  if (!hasAny) return null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {changeRows.length > 0 ? (
        <SectionShell title="Institutional activity" viewMoreHref="/investors">
          <div className="hx-table-wrap border-0">
            <table className="hx-table">
              <thead>
                <tr>
                  <th>Investor</th>
                  <th>Change</th>
                  <th className="num">Shares</th>
                  <th className="num">Value</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {changeRows.map((row) => (
                  <tr key={row.id}>
                    <td className="text-[var(--ink)]">
                      {row.manager_name ?? row.manager_cik}
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
                    </td>
                    <td className="num">{formatShares(row.shares)}</td>
                    <td className="num">{formatUsd(row.value_usd)}</td>
                    <td className="whitespace-nowrap">
                      {formatShortDate(row.report_period)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionShell>
      ) : null}

      {ownershipRows.length > 0 ? (
        <SectionShell title="Major shareholders" viewMoreHref="/investors?tab=stakes">
          <div className="hx-table-wrap border-0">
            <table className="hx-table">
              <thead>
                <tr>
                  <th>Investor</th>
                  <th className="num">Ownership %</th>
                  <th>Form</th>
                  <th>Filed</th>
                </tr>
              </thead>
              <tbody>
                {ownershipRows.map((row) => (
                  <tr key={row.id}>
                    <td className="text-[var(--ink)]">{row.reporting_person ?? "—"}</td>
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
        </SectionShell>
      ) : null}

      {form144Rows.length > 0 ? (
        <SectionShell
          title="Proposed insider sales (144)"
          viewMoreHref="/ceo-buys?tab=proposed"
        >
          <div className="hx-table-wrap border-0">
            <table className="hx-table">
              <thead>
                <tr>
                  <th>Filer</th>
                  <th className="num">Shares Proposed</th>
                  <th className="num">Aggregate Value</th>
                  <th>Proposed Date</th>
                </tr>
              </thead>
              <tbody>
                {form144Rows.map((row) => (
                  <tr key={row.id}>
                    <td className="text-[var(--ink)]">{row.filer_name ?? "—"}</td>
                    <td className="num">
                      {row.shares_proposed != null
                        ? new Intl.NumberFormat("en-US").format(row.shares_proposed)
                        : "—"}
                    </td>
                    <td className="num">{formatUsd(row.aggregate_market_value)}</td>
                    <td className="whitespace-nowrap">
                      {formatShortDate(row.proposed_sale_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionShell>
      ) : null}

      {filingRows.length > 0 ? (
        <SectionShell title="SEC filings" viewMoreHref="/filings">
          <div className="hx-table-wrap border-0">
            <table className="hx-table">
              <thead>
                <tr>
                  <th>Form</th>
                  <th>Description</th>
                  <th>Filed</th>
                </tr>
              </thead>
              <tbody>
                {filingRows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">{row.form_type}</td>
                    <td className="max-w-[320px] truncate">
                      {row.description ?? row.items ?? "—"}
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
        </SectionShell>
      ) : null}

      {nportRows.length > 0 ? (
        <SectionShell title="Fund holdings" viewMoreHref="/funds">
          <div className="hx-table-wrap border-0">
            <table className="hx-table">
              <thead>
                <tr>
                  <th>Fund</th>
                  <th className="num">Shares</th>
                  <th className="num">Value</th>
                  <th className="num">% Portfolio</th>
                  <th>Report Date</th>
                </tr>
              </thead>
              <tbody>
                {nportRows.map((row) => (
                  <tr key={row.id}>
                    <td className="text-[var(--ink)]">{row.fund_name ?? "—"}</td>
                    <td className="num">{formatShares(row.shares)}</td>
                    <td className="num">{formatUsd(row.value_usd)}</td>
                    <td className="num">{formatPct(row.pct_portfolio)}</td>
                    <td className="whitespace-nowrap">
                      {formatShortDate(row.report_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionShell>
      ) : null}
    </div>
  );
}
