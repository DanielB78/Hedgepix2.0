import Link from "next/link";
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

export function TrendingTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-stone-600">
        No disclosed congressional trades match this window.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-stone-200">
      <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
        <thead className="bg-stone-100 text-stone-700">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Ticker</th>
            <th className="px-3 py-2 font-medium text-right">
              Congressional Activity
            </th>
            <th className="px-3 py-2 font-medium text-right">Buys</th>
            <th className="px-3 py-2 font-medium text-right">Sales</th>
            <th className="px-3 py-2 font-medium text-right">Members</th>
            <th className="px-3 py-2 font-medium">Latest disclosure</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 bg-white">
          {rows.map((row, index) => (
            <tr key={row.ticker} className="hover:bg-stone-50">
              <td className="px-3 py-3 text-stone-500">{index + 1}</td>
              <td className="px-3 py-3">
                <div className="font-mono text-base font-semibold text-stone-900">
                  <Link
                    href={`/?ticker=${encodeURIComponent(row.ticker)}`}
                    className="hover:underline"
                  >
                    {row.ticker}
                  </Link>
                </div>
                <div className="max-w-xs truncate text-xs text-stone-500">
                  {row.asset ?? "—"}
                </div>
              </td>
              <td className="px-3 py-3 text-right font-medium text-stone-900">
                {row.totalTrades}
              </td>
              <td className="px-3 py-3 text-right text-stone-700">
                {row.buyCount}
              </td>
              <td className="px-3 py-3 text-right text-stone-700">
                {row.sellCount}
              </td>
              <td className="px-3 py-3 text-right text-stone-700">
                {row.uniqueMembers}
              </td>
              <td className="px-3 py-3 whitespace-nowrap text-stone-700">
                {formatDisclosureDate(row.latestDisclosure)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
