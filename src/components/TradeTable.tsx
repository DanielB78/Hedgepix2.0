import { TickerLink } from "@/components/TickerLink";
import type { CongressTrade } from "@/lib/types";

type Props = {
  trades: CongressTrade[];
};

function formatDate(value: string | null) {
  return value ?? "—";
}

function formatPct(value: number | null) {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

export function TradeTable({ trades }: Props) {
  if (trades.length === 0) {
    return (
      <p className="rounded border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-stone-600">
        No trades match these filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-stone-200">
      <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
        <thead className="bg-stone-100 text-stone-700">
          <tr>
            <th className="px-3 py-2 font-medium">Member</th>
            <th className="px-3 py-2 font-medium">Chamber</th>
            <th className="px-3 py-2 font-medium">Ticker</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Txn date</th>
            <th className="px-3 py-2 font-medium">Disclosure</th>
            <th className="px-3 py-2 font-medium">Perf</th>
            <th className="px-3 py-2 font-medium">Filing</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 bg-white">
          {trades.map((trade) => (
            <tr key={trade.id} className="hover:bg-stone-50">
              <td className="px-3 py-2 whitespace-nowrap">
                <div className="font-medium text-stone-900">
                  {trade.member ?? "—"}
                </div>
                <div className="text-xs text-stone-500">{trade.state}</div>
              </td>
              <td className="px-3 py-2 capitalize text-stone-700">
                {trade.chamber ?? "—"}
              </td>
              <td className="px-3 py-2 font-mono font-medium text-stone-900">
                {trade.ticker ? <TickerLink ticker={trade.ticker} /> : "—"}
              </td>
              <td className="px-3 py-2 capitalize text-stone-700">
                {trade.transaction_type ?? "—"}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-stone-700">
                {trade.amount_range ?? "—"}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-stone-700">
                {formatDate(trade.transaction_date)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-stone-700">
                {formatDate(trade.disclosure_date)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-stone-700">
                {formatPct(trade.perf_pct)}
              </td>
              <td className="px-3 py-2">
                {trade.filing_portal ? (
                  <a
                    href={trade.filing_portal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-800 underline hover:text-teal-950"
                  >
                    Open
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
