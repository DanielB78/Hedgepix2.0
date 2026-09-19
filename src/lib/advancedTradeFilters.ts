/**
 * Shared advanced trade filtering (House / Senate / Insiders / Trending).
 * BETWEEN filter groups = AND; WITHIN a group = OR.
 * Does not run embeddings — uses precomputed sector-overlap results.
 */

import { getTickerIndustryLabel } from "./tickerIndustry";
import { normalizeSectorLabel } from "./sectorOverlap";
import type { SectorOverlapResult } from "./sectorOverlap";
import type { CongressTrade } from "./types";
import {
  GENERAL_SECTOR_MAP,
  GENERAL_SECTOR_ORDER,
  type GeneralSector,
  canonicalNicheLabel,
} from "./generalSectors";

export type TransactionFilter = "all" | "buys" | "sales";
export type SectorSourceFilter = "ticker" | "member" | "both";
export type OverlapFilter = "all" | "overlap" | "no_overlap";

export type AdvancedTradeFilters = {
  transaction: TransactionFilter;
  /** Selected niche industry labels. Empty = no sector constraint. */
  nicheLabels: string[];
  sectorSource: SectorSourceFilter;
  overlap: OverlapFilter;
  /** Member names or slugs (OR within group). */
  members: string[];
  /** Tickers (OR within group). */
  tickers: string[];
};

export const EMPTY_ADVANCED_FILTERS: AdvancedTradeFilters = {
  transaction: "all",
  nicheLabels: [],
  sectorSource: "ticker",
  overlap: "all",
  members: [],
  tickers: [],
};

export type TradeFilterContext = {
  /** member_slug → industry_labels */
  memberSectors: Record<string, string[]>;
  /** trade id → overlap (only present when has_sector_overlap) */
  tradeSectorOverlaps: Record<string, SectorOverlapResult>;
  /** When false, member/both sector source is ignored (Insiders). */
  allowMemberSectors: boolean;
};

export function normalizeTransactionType(
  type: string | null | undefined,
): "buy" | "sale" | "other" {
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

export function tickerIndustryLabelsForFilter(
  ticker: string | null | undefined,
): string[] {
  const row = getTickerIndustryLabel(ticker);
  if (!row) return [];
  const out: string[] = [];
  if (row.primary_industry?.trim()) out.push(row.primary_industry.trim());
  for (const label of row.industries ?? []) {
    if (label?.trim()) out.push(label.trim());
  }
  return [...new Set(out)];
}

function labelsMatchSelected(
  entityLabels: string[],
  selectedNiche: string[],
): boolean {
  if (selectedNiche.length === 0) return true;
  if (entityLabels.length === 0) return false;
  const selected = new Set(selectedNiche.map(normalizeSectorLabel));
  return entityLabels.some((l) => selected.has(normalizeSectorLabel(l)));
}

export function matchesTickerSector(
  ticker: string | null | undefined,
  selectedNiche: string[],
): boolean {
  return labelsMatchSelected(
    tickerIndustryLabelsForFilter(ticker),
    selectedNiche,
  );
}

export function matchesMemberSector(
  memberLabels: string[] | undefined,
  selectedNiche: string[],
): boolean {
  return labelsMatchSelected(memberLabels ?? [], selectedNiche);
}

function memberKey(trade: CongressTrade): string {
  return (trade.member_slug ?? "").trim().toLowerCase();
}

function tradeHasOverlap(
  trade: CongressTrade,
  overlaps: Record<string, SectorOverlapResult>,
): boolean {
  return overlaps[trade.id]?.has_sector_overlap === true;
}

function matchesMemberFilter(
  trade: CongressTrade,
  members: string[],
): boolean {
  if (members.length === 0) return true;
  const slug = memberKey(trade);
  const name = (trade.member ?? "").trim().toLowerCase();
  return members.some((m) => {
    const q = m.trim().toLowerCase();
    if (!q) return false;
    return slug === q || slug.includes(q) || name.includes(q);
  });
}

function matchesTickerFilter(
  trade: CongressTrade,
  tickers: string[],
): boolean {
  if (tickers.length === 0) return true;
  const t = (trade.ticker ?? "").trim().toUpperCase();
  if (!t) return false;
  return tickers.some((x) => x.trim().toUpperCase() === t);
}

function matchesTransaction(
  trade: CongressTrade,
  transaction: TransactionFilter,
): boolean {
  if (transaction === "all") return true;
  const n = normalizeTransactionType(trade.transaction_type);
  if (transaction === "buys") return n === "buy";
  if (transaction === "sales") return n === "sale";
  return true;
}

function matchesSector(
  trade: CongressTrade,
  filters: AdvancedTradeFilters,
  ctx: TradeFilterContext,
): boolean {
  if (filters.nicheLabels.length === 0) return true;

  const source = ctx.allowMemberSectors
    ? filters.sectorSource
    : "ticker";

  const tickerOk = matchesTickerSector(trade.ticker, filters.nicheLabels);
  if (source === "ticker") return tickerOk;

  const slug = memberKey(trade);
  const memberLabels = slug ? ctx.memberSectors[slug] ?? [] : [];
  const memberOk = matchesMemberSector(memberLabels, filters.nicheLabels);
  if (source === "member") return memberOk;
  return tickerOk && memberOk;
}

function matchesOverlap(
  trade: CongressTrade,
  overlap: OverlapFilter,
  ctx: TradeFilterContext,
): boolean {
  if (overlap === "all") return true;
  if (!ctx.allowMemberSectors) {
    return overlap === "no_overlap";
  }
  const has = tradeHasOverlap(trade, ctx.tradeSectorOverlaps);
  if (overlap === "overlap") return has;
  return !has;
}

export function tradeMatchesAdvancedFilters(
  trade: CongressTrade,
  filters: AdvancedTradeFilters,
  ctx: TradeFilterContext,
): boolean {
  if (!matchesTransaction(trade, filters.transaction)) return false;
  if (!matchesTickerFilter(trade, filters.tickers)) return false;
  if (!matchesMemberFilter(trade, filters.members)) return false;
  if (!matchesSector(trade, filters, ctx)) return false;
  if (!matchesOverlap(trade, filters.overlap, ctx)) return false;
  return true;
}

export function filterTrades<T extends CongressTrade>(
  trades: T[],
  filters: AdvancedTradeFilters,
  ctx: TradeFilterContext,
): T[] {
  if (!hasActiveAdvancedFilters(filters)) return trades;
  return trades.filter((t) => tradeMatchesAdvancedFilters(t, filters, ctx));
}

export function hasActiveAdvancedFilters(filters: AdvancedTradeFilters): boolean {
  return (
    filters.transaction !== "all" ||
    filters.nicheLabels.length > 0 ||
    filters.overlap !== "all" ||
    filters.members.length > 0 ||
    filters.tickers.length > 0
  );
}

/**
 * Compact niche selection for URLs:
 * full parents → @Technology ; remaining individual labels listed.
 */
export function encodeSectorSelection(nicheLabels: string[]): string {
  if (nicheLabels.length === 0) return "";
  const selected = new Set(nicheLabels.map(canonicalNicheLabel));
  const tokens: string[] = [];
  const covered = new Set<string>();

  for (const parent of GENERAL_SECTOR_ORDER) {
    const children = GENERAL_SECTOR_MAP[parent] ?? [];
    if (children.length === 0) continue;
    const allSelected = children.every((c) => selected.has(c));
    if (allSelected) {
      tokens.push(`@${parent}`);
      for (const c of children) covered.add(c);
    }
  }

  for (const label of nicheLabels) {
    const canon = canonicalNicheLabel(label);
    if (!covered.has(canon)) tokens.push(canon);
  }
  return tokens.join(",");
}

export function decodeSectorSelection(raw: string): string[] {
  if (!raw.trim()) return [];
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (const part of parts) {
    if (part.startsWith("@")) {
      const parent = part.slice(1) as GeneralSector;
      if ((GENERAL_SECTOR_ORDER as string[]).includes(parent)) {
        for (const c of GENERAL_SECTOR_MAP[parent] ?? []) out.add(c);
      }
      continue;
    }
    out.add(canonicalNicheLabel(part));
  }
  return [...out];
}

/** Parse filters from URL search params. */
export function parseAdvancedTradeFilters(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): AdvancedTradeFilters {
  const get = (key: string): string => {
    if (params instanceof URLSearchParams) {
      return params.get(key)?.trim() ?? "";
    }
    const raw = params[key];
    return typeof raw === "string" ? raw.trim() : "";
  };

  const tx = get("tx").toLowerCase();
  const transaction: TransactionFilter =
    tx === "buys" || tx === "buy"
      ? "buys"
      : tx === "sales" || tx === "sale"
        ? "sales"
        : "all";

  const src = get("sectorSrc").toLowerCase();
  const sectorSource: SectorSourceFilter =
    src === "member" || src === "both" || src === "ticker" ? src : "ticker";

  const ov = get("overlap").toLowerCase();
  const overlap: OverlapFilter =
    ov === "yes" || ov === "overlap"
      ? "overlap"
      : ov === "no" || ov === "none" || ov === "no_overlap"
        ? "no_overlap"
        : "all";

  const split = (raw: string) =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    transaction,
    nicheLabels: decodeSectorSelection(get("sectors")),
    sectorSource,
    overlap,
    members: split(get("members")),
    tickers: split(get("tickers")).map((t) => t.toUpperCase()),
  };
}

/** Serialize filters into URLSearchParams mutations (does not clear unrelated keys). */
export function applyAdvancedFiltersToParams(
  params: URLSearchParams,
  filters: AdvancedTradeFilters,
): void {
  const setOrDelete = (key: string, value: string | null) => {
    if (!value) params.delete(key);
    else params.set(key, value);
  };

  setOrDelete(
    "tx",
    filters.transaction === "all" ? null : filters.transaction,
  );
  setOrDelete("sectors", encodeSectorSelection(filters.nicheLabels) || null);
  setOrDelete(
    "sectorSrc",
    filters.nicheLabels.length === 0 || filters.sectorSource === "ticker"
      ? null
      : filters.sectorSource,
  );
  setOrDelete(
    "overlap",
    filters.overlap === "all"
      ? null
      : filters.overlap === "overlap"
        ? "yes"
        : "no",
  );
  setOrDelete(
    "members",
    filters.members.length ? filters.members.join(",") : null,
  );
  setOrDelete(
    "tickers",
    filters.tickers.length ? filters.tickers.join(",") : null,
  );
}

export type ActiveFilterChip = {
  key: string;
  label: string;
  remove: (filters: AdvancedTradeFilters) => AdvancedTradeFilters;
};

/**
 * Compact chips: show parent when fully selected instead of every child.
 */
export function activeFilterChips(
  filters: AdvancedTradeFilters,
  options?: { allowMemberSectors?: boolean },
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.transaction === "buys") {
    chips.push({
      key: "tx-buys",
      label: "Buys",
      remove: (f) => ({ ...f, transaction: "all" }),
    });
  } else if (filters.transaction === "sales") {
    chips.push({
      key: "tx-sales",
      label: "Sales",
      remove: (f) => ({ ...f, transaction: "all" }),
    });
  }

  const selected = new Set(filters.nicheLabels.map(canonicalNicheLabel));
  const covered = new Set<string>();
  for (const parent of GENERAL_SECTOR_ORDER) {
    const children = GENERAL_SECTOR_MAP[parent] ?? [];
    if (children.length === 0) continue;
    if (children.every((c) => selected.has(c))) {
      chips.push({
        key: `gsector-${parent}`,
        label: parent,
        remove: (f) => {
          const drop = new Set(children);
          return {
            ...f,
            nicheLabels: f.nicheLabels.filter(
              (l) => !drop.has(canonicalNicheLabel(l)),
            ),
          };
        },
      });
      for (const c of children) covered.add(c);
    }
  }
  for (const label of filters.nicheLabels) {
    const canon = canonicalNicheLabel(label);
    if (covered.has(canon)) continue;
    chips.push({
      key: `sector-${canon}`,
      label: canon,
      remove: (f) => ({
        ...f,
        nicheLabels: f.nicheLabels.filter(
          (x) => canonicalNicheLabel(x) !== canon,
        ),
      }),
    });
  }

  if (
    filters.nicheLabels.length > 0 &&
    filters.sectorSource !== "ticker" &&
    options?.allowMemberSectors !== false
  ) {
    chips.push({
      key: "sectorSrc",
      label:
        filters.sectorSource === "member"
          ? "Applies to: Member"
          : "Applies to: Both",
      remove: (f) => ({ ...f, sectorSource: "ticker" }),
    });
  }

  if (filters.overlap === "overlap") {
    chips.push({
      key: "overlap-yes",
      label: "Sector overlap",
      remove: (f) => ({ ...f, overlap: "all" }),
    });
  } else if (filters.overlap === "no_overlap") {
    chips.push({
      key: "overlap-no",
      label: "No sector overlap",
      remove: (f) => ({ ...f, overlap: "all" }),
    });
  }

  for (const m of filters.members) {
    chips.push({
      key: `member-${m}`,
      label: m,
      remove: (f) => ({
        ...f,
        members: f.members.filter((x) => x !== m),
      }),
    });
  }
  for (const t of filters.tickers) {
    chips.push({
      key: `ticker-${t}`,
      label: t,
      remove: (f) => ({
        ...f,
        tickers: f.tickers.filter((x) => x !== t),
      }),
    });
  }
  return chips;
}
