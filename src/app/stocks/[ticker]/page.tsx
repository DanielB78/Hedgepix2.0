import { MainNav } from "@/components/MainNav";
import { SiteHeader } from "@/components/SiteHeader";
import { StockDetailBoard } from "@/components/StockDetailBoard";
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
    title: ticker ? `${ticker} · hedgpix` : "hedgpix",
  };
}

export default async function StockPage({ params, searchParams }: PageProps) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker ?? "").trim().toUpperCase();
  if (!ticker) notFound();

  const query = await searchParams;
  const range = parseChartRange(query.range);
  // Load full history so the interactive chart can zoom / filter client-side.
  const [stock, syncState] = await Promise.all([
    fetchStockPage(ticker, "all"),
    fetchSyncState(),
  ]);

  if (stock.configured && !stock.error && stock.trades.length === 0 && stock.bars.length === 0) {
    notFound();
  }

  const closes = stock.bars
    .filter((bar) => bar.close != null)
    .map((bar) => Number(bar.close));
  const latest = closes.length ? closes[closes.length - 1]! : null;
  const previous = closes.length > 1 ? closes[closes.length - 2]! : null;
  const changePct =
    latest != null && previous != null && previous !== 0
      ? ((latest - previous) / previous) * 100
      : null;

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <SiteHeader syncState={syncState} compact />
      <div className="flex items-center justify-end">
        <MainNav />
      </div>
      <StockDetailBoard
        ticker={stock.ticker}
        asset={stock.asset}
        bars={stock.bars}
        trades={stock.trades}
        range={range}
        latest={latest}
        changePct={changePct}
        error={stock.error}
      />
    </main>
  );
}
