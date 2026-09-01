/**
 * Estimate current stock holdings per member from disclosed transactions since 2012.
 * Purchases add amount ranges; sales subtract (widening the range when uncertain).
 */

import { isLikelyListedEquity } from "./equity-tickers.mjs";

export const HOLDINGS_START_DATE = "2012-01-01";

/**
 * @typedef {object} TradeRow
 * @property {string|null} member
 * @property {string|null} member_slug
 * @property {string|null} ticker
 * @property {string|null} asset
 * @property {boolean|null} [is_listed_equity]
 * @property {"purchase"|"sale"|"exchange"|null} transaction_type
 * @property {number|null} amount_low
 * @property {number|null} amount_high
 * @property {string|null} transaction_date
 * @property {string|null} disclosure_date
 */

/**
 * @typedef {object} MemberHolding
 * @property {string} memberSlug
 * @property {string} member
 * @property {string} ticker
 * @property {string|null} asset
 * @property {number} positionLow
 * @property {number} positionHigh
 * @property {"purchase"|"sale"|null} lastActivityType
 * @property {string|null} lastActivityDate
 * @property {string|null} lastDisclosureDate
 */

/**
 * @param {TradeRow} trade
 * @returns {boolean}
 */
export function isEligibleHoldingsTrade(trade) {
  if (trade.is_listed_equity === false) return false;
  if (
    trade.is_listed_equity !== true &&
    !isLikelyListedEquity(trade.ticker, trade.asset)
  ) {
    return false;
  }
  if (!trade.member_slug?.trim() || !trade.ticker?.trim()) return false;
  if (trade.transaction_type !== "purchase" && trade.transaction_type !== "sale") {
    return false;
  }
  const txDate = trade.transaction_date;
  if (txDate && txDate < HOLDINGS_START_DATE) return false;
  return true;
}

/**
 * @param {number|null|undefined} low
 * @param {number|null|undefined} high
 * @returns {{ low: number, high: number }|null}
 */
export function resolveAmountRange(low, high) {
  const resolvedLow = low ?? high;
  const resolvedHigh = high ?? low;
  if (resolvedLow == null && resolvedHigh == null) return null;
  const a = resolvedLow ?? resolvedHigh ?? 0;
  const b = resolvedHigh ?? resolvedLow ?? 0;
  return { low: Math.min(a, b), high: Math.max(a, b) };
}

/**
 * @param {{ positionLow: number, positionHigh: number }} acc
 * @param {"purchase"|"sale"} type
 * @param {{ low: number, high: number }} range
 */
export function applyTransaction(acc, type, range) {
  if (type === "purchase") {
    acc.positionLow += range.low;
    acc.positionHigh += range.high;
    return;
  }
  acc.positionLow -= range.high;
  acc.positionHigh -= range.low;
}

/**
 * A position is current when the upper bound is positive and sales have not
 * clearly closed the entire range (symmetric buy/sell ranges net to zero).
 *
 * @param {number} positionLow
 * @param {number} positionHigh
 * @returns {boolean}
 */
export function isCurrentHolding(positionLow, positionHigh) {
  if (positionHigh <= 0) return false;
  if (positionLow <= 0 && positionHigh <= -positionLow) return false;
  return true;
}

/**
 * @param {number} positionLow
 * @param {number} positionHigh
 * @returns {{ low: number, high: number }}
 */
export function displayPositionRange(positionLow, positionHigh) {
  return {
    low: Math.max(0, positionLow),
    high: Math.max(0, positionHigh),
  };
}

/**
 * @param {TradeRow[]} trades
 * @returns {MemberHolding[]}
 */
export function computeMemberHoldings(trades) {
  /** @type {Map<string, MemberHolding & { positionLow: number, positionHigh: number }>} */
  const byKey = new Map();

  for (const trade of trades) {
    if (!isEligibleHoldingsTrade(trade)) continue;

    const range = resolveAmountRange(trade.amount_low, trade.amount_high);
    if (!range) continue;

    const memberSlug = trade.member_slug.trim();
    const ticker = trade.ticker.trim().toUpperCase();
    const key = `${memberSlug}|${ticker}`;

    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        memberSlug,
        member: trade.member?.trim() || memberSlug,
        ticker,
        asset: trade.asset,
        positionLow: 0,
        positionHigh: 0,
        lastActivityType: null,
        lastActivityDate: null,
        lastDisclosureDate: null,
      };
      byKey.set(key, acc);
    }

    if (trade.asset && !acc.asset) acc.asset = trade.asset;
    if (trade.member?.trim()) acc.member = trade.member.trim();

    applyTransaction(acc, trade.transaction_type, range);

    const activityDate = trade.transaction_date ?? trade.disclosure_date;
    if (
      activityDate &&
      (!acc.lastActivityDate || activityDate >= acc.lastActivityDate)
    ) {
      acc.lastActivityDate = activityDate;
      acc.lastActivityType = trade.transaction_type;
      acc.lastDisclosureDate = trade.disclosure_date ?? activityDate;
    }
  }

  return [...byKey.values()]
    .filter((row) => isCurrentHolding(row.positionLow, row.positionHigh))
    .map((row) => ({
      memberSlug: row.memberSlug,
      member: row.member,
      ticker: row.ticker,
      asset: row.asset,
      positionLow: row.positionLow,
      positionHigh: row.positionHigh,
      lastActivityType: row.lastActivityType,
      lastActivityDate: row.lastActivityDate,
      lastDisclosureDate: row.lastDisclosureDate,
    }))
    .sort((a, b) => {
      if (b.positionHigh !== a.positionHigh) {
        return b.positionHigh - a.positionHigh;
      }
      return a.ticker.localeCompare(b.ticker);
    });
}

const HOLDINGS_PAGE = 1000;

/**
 * Load all eligible trades since 2012 and refresh member_stock_holdings.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function syncMemberHoldings(supabase) {
  /** @type {TradeRow[]} */
  const allTrades = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("congress_trades")
      .select(
        "member, member_slug, ticker, asset, is_listed_equity, transaction_type, amount_low, amount_high, transaction_date, disclosure_date",
      )
      .gte("transaction_date", HOLDINGS_START_DATE)
      .order("transaction_date", { ascending: true })
      .range(from, from + HOLDINGS_PAGE - 1);

    if (error) {
      throw new Error(`Failed to load trades for holdings: ${error.message}`);
    }

    const batch = data ?? [];
    allTrades.push(...batch);
    if (batch.length < HOLDINGS_PAGE) break;
    from += HOLDINGS_PAGE;
  }

  const holdings = computeMemberHoldings(allTrades);
  const computedAt = new Date().toISOString();

  const rows = holdings.map((h) => ({
    member_slug: h.memberSlug,
    member: h.member,
    ticker: h.ticker,
    asset: h.asset,
    position_low: h.positionLow,
    position_high: h.positionHigh,
    last_activity_type: h.lastActivityType,
    last_activity_date: h.lastActivityDate,
    last_disclosure_date: h.lastDisclosureDate,
    computed_at: computedAt,
  }));

  const { error: deleteError } = await supabase
    .from("member_stock_holdings")
    .delete()
    .neq("member_slug", "");

  if (deleteError && !/member_stock_holdings/i.test(deleteError.message)) {
    throw new Error(`Failed to clear holdings: ${deleteError.message}`);
  }

  if (rows.length === 0) {
    return { members: 0, positions: 0 };
  }

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error: upsertError } = await supabase
      .from("member_stock_holdings")
      .upsert(slice, { onConflict: "member_slug,ticker" });

    if (upsertError) {
      throw new Error(`Failed to upsert holdings: ${upsertError.message}`);
    }
  }

  const memberCount = new Set(rows.map((r) => r.member_slug)).size;
  return { members: memberCount, positions: rows.length };
}

/**
 * Backfill is_listed_equity for existing rows (paginated).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function refreshListedEquityFlags(supabase) {
  let from = 0;
  let updated = 0;

  while (true) {
    const { data, error } = await supabase
      .from("congress_trades")
      .select("id, ticker, asset, is_listed_equity")
      .order("id", { ascending: true })
      .range(from, from + HOLDINGS_PAGE - 1);

    if (error) {
      throw new Error(`Failed to load trades for equity flags: ${error.message}`);
    }

    const batch = data ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      const flagged = isLikelyListedEquity(row.ticker, row.asset);
      if (row.is_listed_equity === flagged) continue;

      const { error: patchError } = await supabase
        .from("congress_trades")
        .update({ is_listed_equity: flagged })
        .eq("id", row.id);

      if (patchError) {
        throw new Error(`Failed to update equity flag: ${patchError.message}`);
      }
      updated += 1;
    }

    if (batch.length < HOLDINGS_PAGE) break;
    from += HOLDINGS_PAGE;
  }

  return { updated };
}
