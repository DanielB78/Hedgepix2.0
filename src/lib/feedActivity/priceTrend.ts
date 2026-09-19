/**
 * Trading-day return helpers for Feed (uses stored stock_price_bars series).
 */

import type { PriceSeries } from "@/lib/findTrades/derivedMetrics";
import { closeOnOrAfter, closeOnOrBefore } from "@/lib/findTrades/derivedMetrics";
import { FEED_TREND_TRADING_DAYS } from "./weights";

/** Index of first bar with date >= target, or -1. */
function indexOnOrAfter(series: PriceSeries, date: string): number {
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.date >= date) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return found;
}

/** Index of last bar with date <= target, or -1. */
function indexOnOrBefore(series: PriceSeries, date: string): number {
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.date <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Return over `tradingDays` bars ending at/near `anchorDate`.
 * Uses close on/before anchor vs close `tradingDays` bars earlier.
 */
export function tradingDayReturnBefore(
  series: PriceSeries,
  anchorDate: string,
  tradingDays = FEED_TREND_TRADING_DAYS,
): number | null {
  if (!series.length || !anchorDate || tradingDays <= 0) return null;
  let endIdx = indexOnOrBefore(series, anchorDate);
  if (endIdx < 0) {
    endIdx = indexOnOrAfter(series, anchorDate);
  }
  if (endIdx < 0) return null;
  const startIdx = endIdx - tradingDays;
  if (startIdx < 0) return null;
  const start = series[startIdx]!.close;
  const end = series[endIdx]!.close;
  if (!(start > 0) || !Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return ((end - start) / start) * 100;
}

/**
 * Current trend: latest close vs close `tradingDays` bars earlier.
 */
export function currentTradingDayReturn(
  series: PriceSeries,
  tradingDays = FEED_TREND_TRADING_DAYS,
): number | null {
  if (series.length <= tradingDays) return null;
  const end = series[series.length - 1]!;
  const start = series[series.length - 1 - tradingDays]!;
  if (!(start.close > 0) || !Number.isFinite(start.close) || !Number.isFinite(end.close)) {
    return null;
  }
  return ((end.close - start.close) / start.close) * 100;
}

export function priceAtDate(
  series: PriceSeries,
  date: string,
): number | null {
  return (
    closeOnOrAfter(series, date)?.close ??
    closeOnOrBefore(series, date)?.close ??
    null
  );
}
