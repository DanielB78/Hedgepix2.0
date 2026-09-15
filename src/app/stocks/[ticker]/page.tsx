import { AppShell } from "@/components/AppChrome";
import { StockDetailBoard } from "@/components/StockDetailBoard";
import { parseChartTradeSource } from "@/lib/chartTrades";
import { fetchStockPage, parseChartRange } from "@/lib/prices";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker ?? "").trim().toUpperCase();
  return {
    title: ticker ? `${ticker} · Hedgepix` : "Hedgepix",
  };
}

export default async function StockPage({ params, searchParams }: PageProps) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker ?? "").trim().toUpperCase();
  if (!ticker) notFound();

  const query = await searchParams;
  const range = parseChartRange(query.range);
  const source = parseChartTradeSource(
    typeof query.source === "string" ? query.source : undefined,
  );
  // Full history so the interactive chart can zoom / filter client-side.
  const stock = await fetchStockPage(ticker, "all");

  if (
    stock.configured &&
    !stock.error &&
    stock.trades.length === 0 &&
    stock.bars.length === 0
  ) {
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

  const company = stock.asset
    ?.replace(/\s*-\s*Common Stock.*$/i, "")
    .replace(/\s*Common Stock.*$/i, "")
    .trim();

  return (
    <AppShell
      active="stocks"
      title={ticker}
      description={
        company || "Listed security — price chart with disclosure overlays."
      }
    >
      <StockDetailBoard
        ticker={stock.ticker}
        asset={stock.asset}
        bars={stock.bars}
        trades={stock.trades}
        range={range}
        latest={latest}
        changePct={changePct}
        error={stock.error}
        initialSource={source}
      />
    </AppShell>
  );
}
