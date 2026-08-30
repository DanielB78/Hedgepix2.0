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

function cleanAssetName(asset: string | null) {
  if (!asset) return null;
  return asset
    .replace(/\s*-\s*Common Stock.*$/i, "")
    .replace(/\s*Common Stock.*$/i, "")
    .trim();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker ?? "").trim().toUpperCase();
  return {
    title: ticker ? `${ticker} · Congress Trades` : "Congress Trades",
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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <SiteHeader syncState={syncState} compact />
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="text-sm text-[color:var(--navy)] transition-opacity duration-200 hover:opacity-70"
        >
          ← Latest
        </Link>
        <MainNav />
      </div>

      {stock.error ? (
        <div className="rounded-[16px] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--rust)]">
          {stock.error}
        </div>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-4xl font-medium tracking-tight text-[color:var(--deep-navy)]">
            {stock.ticker}
          </h2>
          <p className="mt-1 text-[color:var(--muted)]">
            {cleanAssetName(stock.asset) ?? "Listed security"}
          </p>
        </div>

        {latest != null ? (
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-medium tracking-tight text-[color:var(--deep-navy)]">
              {formatMoney(latest)}
            </div>
            {changePct != null ? (
              <div
                className={
                  changePct >= 0
                    ? "text-sm text-[color:var(--orange)]"
                    : "text-sm text-[color:var(--rust)]"
                }
              >
                {formatPct(changePct)}
              </div>
            ) : null}
          </div>
        ) : null}

        <StockRangeControls ticker={stock.ticker} range={range} />
      </section>

      <PriceChart bars={stock.bars} trades={stock.trades} />

      <section className="space-y-4">
        <h3 className="text-lg font-medium text-[color:var(--deep-navy)]">
          Recent activity
        </h3>
        <TradeTable trades={stock.trades} />
      </section>
    </main>
  );
}
