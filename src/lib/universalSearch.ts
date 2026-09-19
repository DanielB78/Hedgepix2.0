/**
 * Universal search index for tickers and people.
 * Reuses curated ticker labels + congress member profiles from Supabase.
 */

import { createBrowserSupabase, hasPublicSupabaseConfig } from "@/lib/supabase";
import { curatedLabelEntries } from "@/lib/tickerIndustry";
import { memberHref } from "@/lib/holdings";

function stockHref(ticker: string) {
  return `/stocks/${encodeURIComponent(ticker.toUpperCase())}`;
}

export type SearchTickerEntity = {
  type: "ticker";
  id: string;
  symbol: string;
  name: string;
  href: string;
};

export type SearchPersonEntity = {
  type: "person";
  id: string;
  name: string;
  /** House | Senate | Insider */
  subtype: string;
  meta: string | null;
  href: string;
};

export type SearchEntity = SearchTickerEntity | SearchPersonEntity;

export type UniversalSearchResult = {
  tickers: SearchTickerEntity[];
  people: SearchPersonEntity[];
  tickerTotal: number;
  peopleTotal: number;
};

type Scored<T> = { entity: T; score: number };

const PERSON_CACHE_TTL_MS = 5 * 60 * 1000;

let personCache: {
  at: number;
  people: SearchPersonEntity[];
} | null = null;

function chamberLabel(chamber: string | null | undefined): string {
  const c = (chamber ?? "").toLowerCase();
  if (c === "house") return "House";
  if (c === "senate") return "Senate";
  return "Congress";
}

function buildTickerEntities(): SearchTickerEntity[] {
  return curatedLabelEntries().map(([symbol, row]) => ({
    type: "ticker" as const,
    id: `ticker:${symbol}`,
    symbol,
    name: row.company?.trim() || symbol,
    href: stockHref(symbol),
  }));
}

async function loadPersonEntities(): Promise<SearchPersonEntity[]> {
  const now = Date.now();
  if (personCache && now - personCache.at < PERSON_CACHE_TTL_MS) {
    return personCache.people;
  }

  if (!hasPublicSupabaseConfig()) {
    personCache = { at: now, people: [] };
    return [];
  }

  const supabase = createBrowserSupabase();
  const bySlug = new Map<string, SearchPersonEntity>();

  // Page through recent disclosures to collect distinct members with slugs.
  const PAGE = 1000;
  let from = 0;
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase
      .from("congress_trades")
      .select("member, member_slug, chamber, state")
      .not("member_slug", "is", null)
      .order("disclosure_date", { ascending: false, nullsFirst: false })
      .range(from, from + PAGE - 1);

    if (error) break;
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const slug = String(row.member_slug ?? "")
        .trim()
        .toLowerCase();
      if (!slug || bySlug.has(slug)) continue;
      const name = String(row.member ?? "").trim() || slug;
      const chamber = chamberLabel(row.chamber as string | null);
      const state = String(row.state ?? "").trim();
      bySlug.set(slug, {
        type: "person",
        id: `person:${slug}`,
        name,
        subtype: chamber,
        meta: state || null,
        href: memberHref(slug),
      });
    }

    if (rows.length < PAGE) break;
    from += PAGE;
  }

  // Corporate insiders with Form 4 activity — link into Insiders workspace search.
  try {
    const { data: ceoRows } = await supabase
      .from("ceo_stock_purchases")
      .select("ceo_name, officer_title, ticker")
      .not("ceo_name", "is", null)
      .order("filing_date", { ascending: false, nullsFirst: false })
      .limit(2000);

    const byName = new Map<string, SearchPersonEntity>();
    for (const row of ceoRows ?? []) {
      const name = String(row.ceo_name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (byName.has(key)) continue;
      const title = String(row.officer_title ?? "").trim();
      const ticker = String(row.ticker ?? "").trim().toUpperCase();
      const metaParts = [
        title || null,
        ticker ? ticker : null,
      ].filter(Boolean);
      byName.set(key, {
        type: "person",
        id: `insider:${key}`,
        name,
        subtype: "Corporate Insider",
        meta: metaParts.length ? metaParts.join(" · ") : null,
        href: `/app?view=insiders&q=${encodeURIComponent(name)}`,
      });
    }
    for (const person of byName.values()) {
      // Prefer congress member page if same name already indexed by slug.
      const exists = [...bySlug.values()].some(
        (p) => p.name.toLowerCase() === person.name.toLowerCase(),
      );
      if (!exists) bySlug.set(person.id, person);
    }
  } catch {
    // Insiders table may be unavailable in some environments.
  }

  const people = [...bySlug.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  personCache = { at: now, people };
  return people;
}

function scoreTicker(entity: SearchTickerEntity, q: string): number {
  const symbol = entity.symbol.toLowerCase();
  const name = entity.name.toLowerCase();
  if (symbol === q) return 1000;
  if (symbol.startsWith(q)) return 900 - Math.min(symbol.length, 40);
  if (name.startsWith(q)) return 700 - Math.min(name.length, 40);
  const words = name.split(/\s+/);
  if (words.some((w) => w.startsWith(q))) return 600;
  if (symbol.includes(q)) return 400;
  if (name.includes(q)) return 300;
  return 0;
}

function scorePerson(entity: SearchPersonEntity, q: string): number {
  const name = entity.name.toLowerCase();
  const parts = name.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const first = parts[0] ?? "";
  if (name === q) return 1000;
  if (name.startsWith(q)) return 900;
  if (last.startsWith(q)) return 850;
  if (first.startsWith(q)) return 800;
  if (parts.some((p) => p.startsWith(q))) return 700;
  if (name.includes(q)) return 400;
  if (entity.meta?.toLowerCase().includes(q)) return 200;
  return 0;
}

export async function searchUniversal(
  query: string,
  limits: { tickers?: number; people?: number } = {},
): Promise<UniversalSearchResult> {
  const tickerLimit = limits.tickers ?? 5;
  const peopleLimit = limits.people ?? 5;
  const q = query.trim().toLowerCase();
  if (!q) {
    return { tickers: [], people: [], tickerTotal: 0, peopleTotal: 0 };
  }

  const tickerScored: Scored<SearchTickerEntity>[] = [];
  for (const entity of buildTickerEntities()) {
    const score = scoreTicker(entity, q);
    if (score > 0) tickerScored.push({ entity, score });
  }
  tickerScored.sort(
    (a, b) =>
      b.score - a.score || a.entity.symbol.localeCompare(b.entity.symbol),
  );

  const people = await loadPersonEntities();
  const peopleScored: Scored<SearchPersonEntity>[] = [];
  for (const entity of people) {
    const score = scorePerson(entity, q);
    if (score > 0) peopleScored.push({ entity, score });
  }
  peopleScored.sort(
    (a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name),
  );

  return {
    tickers: tickerScored.slice(0, tickerLimit).map((s) => s.entity),
    people: peopleScored.slice(0, peopleLimit).map((s) => s.entity),
    tickerTotal: tickerScored.length,
    peopleTotal: peopleScored.length,
  };
}

/** Clear cached people (tests / hot reload). */
export function clearUniversalSearchCache() {
  personCache = null;
}
