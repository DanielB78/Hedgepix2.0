/**
 * Market / sector relative-return helpers for Feed.
 * Prefers ETF benchmarks when bars exist; otherwise cross-sectional proxies
 * from tickers loaded in the same Feed payload.
 */

import type { PriceSeries } from "@/lib/findTrades/derivedMetrics";
import { currentTradingDayReturn } from "./priceTrend";
import {
  FEED_TREND_TRADING_DAYS,
  MARKET_BENCHMARK_TICKERS,
  SECTOR_BENCHMARK_ETFS,
} from "./weights";

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

export function resolveSectorEtf(generalSector: string | null): string | null {
  if (!generalSector) return null;
  return SECTOR_BENCHMARK_ETFS[generalSector] ?? null;
}

export function marketBenchmarkReturn(
  seriesByTicker: Map<string, PriceSeries>,
  tradingDays = FEED_TREND_TRADING_DAYS,
): { ticker: string | null; returnPct: number | null; method: "etf" | "cross_section" | null } {
  for (const t of MARKET_BENCHMARK_TICKERS) {
    const series = seriesByTicker.get(t);
    if (!series?.length) continue;
    const ret = currentTradingDayReturn(series, tradingDays);
    if (ret != null) return { ticker: t, returnPct: ret, method: "etf" };
  }

  const returns: number[] = [];
  for (const [ticker, series] of seriesByTicker) {
    if (MARKET_BENCHMARK_TICKERS.includes(ticker as "SPY")) continue;
    if (Object.values(SECTOR_BENCHMARK_ETFS).includes(ticker)) continue;
    const ret = currentTradingDayReturn(series, tradingDays);
    if (ret != null) returns.push(ret);
  }
  const med = median(returns);
  return {
    ticker: null,
    returnPct: med,
    method: med != null ? "cross_section" : null,
  };
}

export function sectorBenchmarkReturn(
  seriesByTicker: Map<string, PriceSeries>,
  generalSector: string | null,
  sectorTickers: string[],
  tradingDays = FEED_TREND_TRADING_DAYS,
): { ticker: string | null; returnPct: number | null; method: "etf" | "cross_section" | null } {
  const etf = resolveSectorEtf(generalSector);
  if (etf) {
    const series = seriesByTicker.get(etf);
    const ret = series ? currentTradingDayReturn(series, tradingDays) : null;
    if (ret != null) return { ticker: etf, returnPct: ret, method: "etf" };
  }

  const returns: number[] = [];
  for (const t of sectorTickers) {
    if (etf && t === etf) continue;
    const series = seriesByTicker.get(t);
    if (!series) continue;
    const ret = currentTradingDayReturn(series, tradingDays);
    if (ret != null) returns.push(ret);
  }
  const med = median(returns);
  return {
    ticker: etf,
    returnPct: med,
    method: med != null ? "cross_section" : null,
  };
}
