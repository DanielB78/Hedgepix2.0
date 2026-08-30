import Link from "next/link";
import { MainNav } from "@/components/MainNav";
import { PriceChart } from "@/components/PriceChart";
import { SiteHeader } from "@/components/SiteHeader";
import { StockRangeControls } from "@/components/StockRangeControls";
import { TradeTable } from "@/components/TradeTable";
import { fetchStockPage, parseChartRange } from "@/lib/prices";
import { fetchSyncState } from "@/lib/trades";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker ?? "").trim().toUpperCase();
  return {
    title: ticker ? `${ticker} · Congress Trade Monitor` : "Congress Trade Monitor",
  };
}

export default async function StockPage({ params, searchParams }: PageProps) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker ?? "").trim().toUpperCase();
  if (!ticker) notFound();

  const query = await searchParams;
  const range = parseChartRange(query.range);
  const [stock, syncState] = await Promise.all([
    fetchStockPage(ticker, range),
    fetchSyncState(),
  ]);

  if (stock.configured && !stock.error && stock.trades.length === 0 && stock.bars.length === 0) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <SiteHeader syncState={syncState} />
      <MainNav />

      {stock.error ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {stock.error}
        </div>
      ) : null}

      <section className="space-y-3">
        <p className="text-sm font-medium tracking-wide text-teal-800 uppercase">
          Stock detail
        </p>
        <p>
          <Link href="/" className="text-sm text-teal-800 hover:underline">
            ← Latest disclosures
          </Link>
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-stone-900 sm:text-4xl">
          {stock.ticker}
        </h2>
        <p className="text-stone-700">{stock.asset ?? "Listed security"}</p>
        <p className="max-w-3xl text-sm text-stone-600">
          Line is the daily closing price from cached Alpaca IEX data —
          approximate market context around congressional transaction dates,
          not an exact purchase or sale price. Markers use{" "}
          <span className="font-medium">transaction date</span>, not disclosure
          date. ▲ purchases, ▼ sales.
        </p>
        <StockRangeControls ticker={stock.ticker} range={range} />
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-900">
          Daily closing price
        </h3>
        <PriceChart bars={stock.bars} trades={stock.trades} />
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-900">
          Congressional disclosures
        </h3>
        <TradeTable trades={stock.trades} />
      </section>
    </main>
  );
}
