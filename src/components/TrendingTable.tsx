import { TickerLink } from "@/components/TickerLink";
import type { TrendingTicker } from "@/lib/types";

type Props = {
  rows: TrendingTicker[];
};

function formatDisclosureDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
  } catch {
    return value;
  }
}

function membersLabel(count: number) {
  return `${count} member${count === 1 ? "" : "s"} active`;
}

export function TrendingTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-stone-600">
        No disclosed congressional trades match this window.
      </p>
    );
  }

  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto rounded border border-stone-200 sm:block">
        <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
          <thead className="bg-stone-100 text-stone-700">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Ticker</th>
              <th className="px-3 py-2 font-medium text-right">
                Members active
              </th>
              <th className="px-3 py-2 font-medium text-right">Disclosures</th>
              <th className="px-3 py-2 font-medium text-right">
                Members bought
              </th>
              <th className="px-3 py-2 font-medium text-right">
                Members sold
              </th>
              <th className="px-3 py-2 font-medium">Latest disclosure</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 bg-white">
            {rows.map((row, index) => (
              <tr key={row.ticker} className="hover:bg-stone-50">
                <td className="px-3 py-3 text-stone-500">{index + 1}</td>
                <td className="px-3 py-3">
                  <div className="font-mono text-base font-semibold text-stone-900">
                    <TickerLink
                      ticker={row.ticker}
                      className="font-mono text-base font-semibold text-teal-800 hover:underline"
                    />
                  </div>
                  <div className="max-w-xs truncate text-xs text-stone-500">
                    {row.asset ?? "—"}
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-medium text-stone-900">
                  {row.uniqueMembers}
                </td>
                <td className="px-3 py-3 text-right text-stone-700">
                  {row.totalTrades}
                </td>
                <td className="px-3 py-3 text-right text-stone-700">
                  {row.buyMembers}
                </td>
                <td className="px-3 py-3 text-right text-stone-700">
                  {row.sellMembers}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-stone-700">
                  {formatDisclosureDate(row.latestDisclosure)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards — primary metric is members active */}
      <ol className="space-y-3 sm:hidden">
        {rows.map((row, index) => (
          <li
            key={row.ticker}
            className="rounded border border-stone-200 bg-white px-4 py-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-stone-500">#{index + 1}</div>
                <TickerLink
                  ticker={row.ticker}
                  className="font-mono text-lg font-semibold text-teal-800 hover:underline"
                />
                <div className="truncate text-xs text-stone-500">
                  {row.asset ?? "—"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-medium text-stone-900">
                  {membersLabel(row.uniqueMembers)}
                </div>
                <div className="text-xs text-stone-600">
                  {row.totalTrades} disclosure
                  {row.totalTrades === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
              <span>{row.buyMembers} members bought</span>
              <span>{row.sellMembers} members sold</span>
              <span>
                Latest: {formatDisclosureDate(row.latestDisclosure)}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
