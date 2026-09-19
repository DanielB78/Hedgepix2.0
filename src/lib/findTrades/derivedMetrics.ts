/**
 * Server-side derived metrics for Find Trades.
 * Uses stored stock_price_bars — never runs embeddings or heavy work in the browser.
 */

import {
  ACTIVITY_WINDOWS,
  FLAT_THRESHOLD_PCT,
  RETURN_WINDOWS,
  TREND_WINDOWS,
} from "./filterRegistry";
import {
  emptyWindowNumberMap,
  emptyWindowTrendMap,
} from "./filterEngine";
import type {
  FindTradeRow,
  FindTradeSource,
  FindTxSide,
  TrendDirection,
  WindowNumberMap,
  WindowTrendMap,
} from "./types";

export type PriceSeries = Array<{ date: string; close: number }>;

function daysBetween(a: string, b: string): number {
  const ms =
    Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First close on/after date; else last close on/before. */
export function closeOnOrAfter(
  series: PriceSeries,
  date: string,
): { date: string; close: number } | null {
  if (!series.length) return null;
  let lo = 0;
  let hi = series.length - 1;
  let found: { date: string; close: number } | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const row = series[mid]!;
    if (row.date >= date) {
      found = row;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (found) return found;
  const last = series[series.length - 1]!;
  return last.date <= date ? last : null;
}

export function closeOnOrBefore(
  series: PriceSeries,
  date: string,
): { date: string; close: number } | null {
  if (!series.length) return null;
  let lo = 0;
  let hi = series.length - 1;
  let found: { date: string; close: number } | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const row = series[mid]!;
    if (row.date <= date) {
      found = row;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function windowReturn(
  series: PriceSeries,
  anchorDate: string,
  windowDays: number,
  direction: "before" | "after",
): number | null {
  if (!anchorDate || windowDays <= 0) return null;
  const at = closeOnOrAfter(series, anchorDate);
  if (!at || at.close <= 0) return null;

  if (direction === "before") {
    const startDate = addDays(anchorDate, -windowDays);
    const start = closeOnOrAfter(series, startDate) ?? closeOnOrBefore(series, startDate);
    if (!start || start.close <= 0) return null;
    // Prefer price near startDate and price at/near trade
    const end = closeOnOrBefore(series, anchorDate) ?? at;
    if (end.close <= 0) return null;
    return ((end.close - start.close) / start.close) * 100;
  }

  const endDate = addDays(anchorDate, windowDays);
  const end = closeOnOrAfter(series, endDate) ?? closeOnOrBefore(series, endDate);
  if (!end || end.close <= 0) return null;
  return ((end.close - at.close) / at.close) * 100;
}

export function classifyTrend(
  returnPct: number | null,
  flatThreshold = FLAT_THRESHOLD_PCT,
): TrendDirection | null {
  if (returnPct == null || !Number.isFinite(returnPct)) return null;
  if (Math.abs(returnPct) < flatThreshold) return "flat";
  return returnPct > 0 ? "up" : "down";
}

function personTickerKey(personKey: string, ticker: string): string {
  return `${personKey}|${ticker}`;
}

type IndexedTrade = FindTradeRow & { _idx: number };

/**
 * Fill market + activity derived fields on rows in place.
 * `seriesByTicker` must already be loaded for tickers present in rows.
 */
export function computeDerivedMetrics(
  rows: FindTradeRow[],
  seriesByTicker: Map<string, PriceSeries>,
  latestCloseByTicker: Map<string, number>,
): void {
  // Sort copies for prior-trade scans
  const withDates = rows
    .map((r, i) => ({ ...r, _idx: i }))
    .filter((r) => r.transactionDate && r.ticker) as IndexedTrade[];

  withDates.sort((a, b) => {
    const d = a.transactionDate!.localeCompare(b.transactionDate!);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });

  const byPersonTicker = new Map<string, IndexedTrade[]>();
  const byTicker = new Map<string, IndexedTrade[]>();

  for (const t of withDates) {
    const ticker = t.ticker!;
    const pk = personTickerKey(t.personKey, ticker);
    let list = byPersonTicker.get(pk);
    if (!list) {
      list = [];
      byPersonTicker.set(pk, list);
    }
    list.push(t);

    let tl = byTicker.get(ticker);
    if (!tl) {
      tl = [];
      byTicker.set(ticker, tl);
    }
    tl.push(t);
  }

  // Precompute trend-at-buy for each trade (for uptrend/downtrend buy counts)
  const trendAtTrade = new Map<string, WindowTrendMap>();
  for (const t of withDates) {
    const series = seriesByTicker.get(t.ticker!) ?? [];
    const map = emptyWindowTrendMap(TREND_WINDOWS);
    for (const w of TREND_WINDOWS) {
      const ret = windowReturn(series, t.transactionDate!, w, "before");
      map[String(w)] = classifyTrend(ret);
    }
    trendAtTrade.set(t.id, map);
  }

  for (const t of withDates) {
    const row = rows[t._idx]!;
    const ticker = t.ticker!;
    const txDate = t.transactionDate!;
    const series = seriesByTicker.get(ticker) ?? [];

    const at = closeOnOrAfter(series, txDate);
    row.priceAtTrade = at?.close ?? row.exactPrice ?? null;

    const latest = latestCloseByTicker.get(ticker);
    if (
      row.priceAtTrade != null &&
      latest != null &&
      row.priceAtTrade > 0 &&
      Number.isFinite(latest)
    ) {
      row.returnSinceTrade =
        ((latest - row.priceAtTrade) / row.priceAtTrade) * 100;
    }

    const retBefore = emptyWindowNumberMap(RETURN_WINDOWS);
    const retAfter = emptyWindowNumberMap(RETURN_WINDOWS);
    const trendBefore = emptyWindowTrendMap(TREND_WINDOWS);
    const trendAfter = emptyWindowTrendMap(TREND_WINDOWS);

    for (const w of RETURN_WINDOWS) {
      retBefore[String(w)] = windowReturn(series, txDate, w, "before");
      retAfter[String(w)] = windowReturn(series, txDate, w, "after");
    }
    for (const w of TREND_WINDOWS) {
      trendBefore[String(w)] = classifyTrend(retBefore[String(w)] ?? null);
      trendAfter[String(w)] = classifyTrend(retAfter[String(w)] ?? null);
    }
    row.returnBefore = retBefore;
    row.returnAfter = retAfter;
    row.trendBefore = trendBefore;
    row.trendAfter = trendAfter;

    // Person+ticker history
    const history = byPersonTicker.get(personTickerKey(t.personKey, ticker)) ?? [];
    const prior = history.filter(
      (h) =>
        h.transactionDate! < txDate ||
        (h.transactionDate === txDate && h.id < t.id),
    );

    const priorBuysList = prior.filter((h) => h.transactionType === "buy");
    const priorSalesList = prior.filter((h) => h.transactionType === "sale");

    const lastBuy = priorBuysList[priorBuysList.length - 1];
    const lastSale = priorSalesList[priorSalesList.length - 1];
    const firstBuy = priorBuysList[0] ?? (t.transactionType === "buy" ? t : null);

    if (lastBuy?.transactionDate) {
      row.daysSincePreviousBuy = daysBetween(lastBuy.transactionDate, txDate);
      const prevPx =
        closeOnOrAfter(series, lastBuy.transactionDate)?.close ?? null;
      const curPx = row.priceAtTrade;
      if (prevPx != null && curPx != null && prevPx > 0) {
        row.returnSincePreviousBuy = ((curPx - prevPx) / prevPx) * 100;
        row.trendSincePreviousBuy = classifyTrend(row.returnSincePreviousBuy);
      }
    }
    if (lastSale?.transactionDate) {
      row.daysSincePreviousSale = daysBetween(lastSale.transactionDate, txDate);
    }
    if (firstBuy?.transactionDate && firstBuy.id !== t.id) {
      row.daysSinceFirstBuy = daysBetween(firstBuy.transactionDate, txDate);
    } else if (t.transactionType === "buy") {
      row.daysSinceFirstBuy = 0;
    }

    // Consecutive buys ending at this trade (if buy)
    if (t.transactionType === "buy") {
      let streak = 1;
      for (let i = prior.length - 1; i >= 0; i--) {
        const h = prior[i]!;
        if (h.transactionType === "buy") streak += 1;
        else break;
      }
      row.consecutiveBuys = streak;
      row.additionalBuyAfterDecline =
        lastBuy != null &&
        row.returnSincePreviousBuy != null &&
        row.returnSincePreviousBuy < 0;
    } else {
      row.consecutiveBuys = null;
      row.additionalBuyAfterDecline = null;
    }

    const priorBuys = emptyWindowNumberMap(ACTIVITY_WINDOWS);
    const priorSales = emptyWindowNumberMap(ACTIVITY_WINDOWS);
    const priorUp = emptyWindowNumberMap(TREND_WINDOWS);
    const priorDown = emptyWindowNumberMap(TREND_WINDOWS);

    for (const w of ACTIVITY_WINDOWS) {
      const cutoff = addDays(txDate, -w);
      priorBuys[String(w)] = priorBuysList.filter(
        (h) => h.transactionDate! >= cutoff,
      ).length;
      priorSales[String(w)] = priorSalesList.filter(
        (h) => h.transactionDate! >= cutoff,
      ).length;
    }

    for (const tw of TREND_WINDOWS) {
      let up = 0;
      let down = 0;
      for (const h of priorBuysList) {
        const trends = trendAtTrade.get(h.id);
        const dir = trends?.[String(tw)] ?? null;
        if (dir === "up") up += 1;
        if (dir === "down") down += 1;
      }
      priorUp[String(tw)] = up;
      priorDown[String(tw)] = down;
    }

    row.priorBuys = priorBuys;
    row.priorSales = priorSales;
    row.priorUptrendBuys = priorUp;
    row.priorDowntrendBuys = priorDown;

    // Ticker-level aggregates
    const tickerHistory = byTicker.get(ticker) ?? [];
    const distinctCongress = emptyWindowNumberMap(ACTIVITY_WINDOWS);
    const distinctInsider = emptyWindowNumberMap(ACTIVITY_WINDOWS);
    const distinctHouse = emptyWindowNumberMap(ACTIVITY_WINDOWS);
    const distinctSenate = emptyWindowNumberMap(ACTIVITY_WINDOWS);
    const totalBuys = emptyWindowNumberMap(ACTIVITY_WINDOWS);

    for (const w of ACTIVITY_WINDOWS) {
      const cutoff = addDays(txDate, -w);
      const allInWindow = tickerHistory.filter(
        (h) =>
          h.transactionType === "buy" &&
          h.transactionDate! >= cutoff &&
          h.transactionDate! <= txDate,
      );
      totalBuys[String(w)] = allInWindow.length;

      const congress = new Set<string>();
      const insider = new Set<string>();
      const house = new Set<string>();
      const senate = new Set<string>();
      for (const h of allInWindow) {
        if (h.source === "insider") insider.add(h.personKey);
        else {
          congress.add(h.personKey);
          if (h.source === "house") house.add(h.personKey);
          if (h.source === "senate") senate.add(h.personKey);
        }
      }
      distinctCongress[String(w)] = congress.size;
      distinctInsider[String(w)] = insider.size;
      distinctHouse[String(w)] = house.size;
      distinctSenate[String(w)] = senate.size;
    }

    row.distinctCongressBuyers = distinctCongress;
    row.distinctInsiderBuyers = distinctInsider;
    row.distinctHouseBuyers = distinctHouse;
    row.distinctSenateBuyers = distinctSenate;
    row.totalBuysOnTicker = totalBuys;
  }
}

export function initEmptyMetrics(
  base: Omit<
    FindTradeRow,
    | "priceAtTrade"
    | "returnSinceTrade"
    | "returnBefore"
    | "returnAfter"
    | "trendBefore"
    | "trendAfter"
    | "returnSincePreviousBuy"
    | "trendSincePreviousBuy"
    | "daysSincePreviousBuy"
    | "daysSincePreviousSale"
    | "daysSinceFirstBuy"
    | "consecutiveBuys"
    | "additionalBuyAfterDecline"
    | "priorBuys"
    | "priorSales"
    | "priorUptrendBuys"
    | "priorDowntrendBuys"
    | "distinctCongressBuyers"
    | "distinctInsiderBuyers"
    | "distinctHouseBuyers"
    | "distinctSenateBuyers"
    | "totalBuysOnTicker"
  >,
): FindTradeRow {
  return {
    ...base,
    priceAtTrade: null,
    returnSinceTrade: null,
    returnBefore: emptyWindowNumberMap(RETURN_WINDOWS),
    returnAfter: emptyWindowNumberMap(RETURN_WINDOWS),
    trendBefore: emptyWindowTrendMap(TREND_WINDOWS),
    trendAfter: emptyWindowTrendMap(TREND_WINDOWS),
    returnSincePreviousBuy: null,
    trendSincePreviousBuy: null,
    daysSincePreviousBuy: null,
    daysSincePreviousSale: null,
    daysSinceFirstBuy: null,
    consecutiveBuys: null,
    additionalBuyAfterDecline: null,
    priorBuys: emptyWindowNumberMap(ACTIVITY_WINDOWS),
    priorSales: emptyWindowNumberMap(ACTIVITY_WINDOWS),
    priorUptrendBuys: emptyWindowNumberMap(TREND_WINDOWS),
    priorDowntrendBuys: emptyWindowNumberMap(TREND_WINDOWS),
    distinctCongressBuyers: emptyWindowNumberMap(ACTIVITY_WINDOWS),
    distinctInsiderBuyers: emptyWindowNumberMap(ACTIVITY_WINDOWS),
    distinctHouseBuyers: emptyWindowNumberMap(ACTIVITY_WINDOWS),
    distinctSenateBuyers: emptyWindowNumberMap(ACTIVITY_WINDOWS),
    totalBuysOnTicker: emptyWindowNumberMap(ACTIVITY_WINDOWS),
  };
}

export function sourceFromChamber(
  chamber: "house" | "senate" | null,
  isCeo: boolean,
): FindTradeSource {
  if (isCeo) return "insider";
  if (chamber === "senate") return "senate";
  return "house";
}

export function sideFromType(type: string | null | undefined): FindTxSide {
  const t = String(type ?? "")
    .trim()
    .toLowerCase();
  if (
    t === "purchase" ||
    t === "buy" ||
    t === "bought" ||
    t === "p" ||
    t === "acquisition"
  ) {
    return "buy";
  }
  if (t === "sale" || t === "sell" || t === "sold" || t === "s") {
    return "sale";
  }
  return "other";
}
