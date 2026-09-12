/**
 * On-demand Alpaca IEX hourly bars for news→ticker movement checks.
 * Daily bars in stock_price_bars are not enough for sub-day event windows.
 */

export type AlpacaHourlyBar = {
  /** Bar start time (UTC ms). */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type AlpacaBarsClient = {
  apiKey: string;
  apiSecret: string;
  fetchImpl?: typeof fetch;
};

const ALPACA_BARS_URL = "https://data.alpaca.markets/v2/stocks/bars";
const PAGE_LIMIT = 10000;
const BATCH_SIZE = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBar(raw: Record<string, unknown>): AlpacaHourlyBar | null {
  const tRaw = raw.t ?? raw.Timestamp;
  const c = Number(raw.c ?? raw.Close);
  const o = Number(raw.o ?? raw.Open ?? c);
  const h = Number(raw.h ?? raw.High ?? c);
  const l = Number(raw.l ?? raw.Low ?? c);
  const v = Number(raw.v ?? raw.Volume ?? 0);
  if (!tRaw || !Number.isFinite(c) || c <= 0) return null;
  const t = Date.parse(String(tRaw));
  if (!Number.isFinite(t)) return null;
  return {
    t,
    o: Number.isFinite(o) && o > 0 ? o : c,
    h: Number.isFinite(h) ? h : c,
    l: Number.isFinite(l) ? l : c,
    c,
    v: Number.isFinite(v) ? v : 0,
  };
}

/**
 * Fetch 1Hour bars for many symbols between start/end (ISO or Date).
 * Returns Map ticker → bars sorted ascending by time.
 */
export async function fetchAlpacaHourlyBars(
  symbols: string[],
  start: Date | string,
  end: Date | string,
  client: AlpacaBarsClient,
): Promise<Map<string, AlpacaHourlyBar[]>> {
  const out = new Map<string, AlpacaHourlyBar[]>();
  const uniq = [
    ...new Set(
      symbols
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (uniq.length === 0) return out;

  const startIso =
    typeof start === "string" ? start : start.toISOString();
  const endIso = typeof end === "string" ? end : end.toISOString();
  const fetchFn = client.fetchImpl ?? fetch;

  for (let i = 0; i < uniq.length; i += BATCH_SIZE) {
    const batch = uniq.slice(i, i + BATCH_SIZE);
    let pageToken: string | null = null;
    do {
      const endpoint = new URL(ALPACA_BARS_URL);
      endpoint.searchParams.set("symbols", batch.join(","));
      endpoint.searchParams.set("timeframe", "1Hour");
      endpoint.searchParams.set("start", startIso);
      endpoint.searchParams.set("end", endIso);
      endpoint.searchParams.set("feed", "iex");
      endpoint.searchParams.set("adjustment", "split");
      endpoint.searchParams.set("limit", String(PAGE_LIMIT));
      endpoint.searchParams.set("sort", "asc");
      if (pageToken) endpoint.searchParams.set("page_token", pageToken);

      const response = await fetchFn(endpoint, {
        headers: {
          "APCA-API-KEY-ID": client.apiKey,
          "APCA-API-SECRET-KEY": client.apiSecret,
          Accept: "application/json",
        },
      });

      if (response.status === 429) {
        const reset = Number(response.headers.get("X-RateLimit-Reset") ?? "0");
        const waitMs =
          reset > 0 ? Math.max(1000, reset * 1000 - Date.now()) : 2000;
        await sleep(waitMs);
        continue;
      }

      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `Alpaca hourly bars HTTP ${response.status}: ${text.slice(0, 300)}`,
        );
      }

      const body = JSON.parse(text) as {
        bars?: Record<string, Record<string, unknown>[]>;
        next_page_token?: string | null;
      };
      for (const [symbol, list] of Object.entries(body.bars ?? {})) {
        const ticker = symbol.toUpperCase();
        const existing = out.get(ticker) ?? [];
        for (const raw of list ?? []) {
          const bar = parseBar(raw);
          if (bar) existing.push(bar);
        }
        out.set(ticker, existing);
      }
      pageToken = body.next_page_token ?? null;
    } while (pageToken);
  }

  for (const [ticker, bars] of out) {
    bars.sort((a, b) => a.t - b.t);
    // Deduplicate identical timestamps (keep last).
    const deduped: AlpacaHourlyBar[] = [];
    for (const bar of bars) {
      if (deduped.length && deduped[deduped.length - 1]!.t === bar.t) {
        deduped[deduped.length - 1] = bar;
      } else {
        deduped.push(bar);
      }
    }
    out.set(ticker, deduped);
  }

  return out;
}
