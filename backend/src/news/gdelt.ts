import { createHash } from "node:crypto";

export type GdeltArticleRaw = {
  url?: string;
  url_mobile?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
};

export type NormalizedNewsArticle = {
  source: "gdelt";
  title: string;
  url: string;
  published_at: string | null;
  domain: string | null;
  image_url: string | null;
  language: string | null;
  gdelt_id: string | null;
  source_hash: string;
  raw_source: GdeltArticleRaw;
  /** Best NAICS match (optional; mirrors sectors[0]). */
  sector?: string | null;
  sector_code?: string | null;
  sector_score?: number | null;
  /** Top-3 NAICS matches from local BGE-small (optional). */
  sectors?: Array<{ code: string; name: string; score: number }> | null;
};

export type GdeltFetchResult = {
  status: "SUCCESS" | "FAILED";
  fetched: number;
  articles: NormalizedNewsArticle[];
  error: string | null;
};

/** Broad finance/business DOC 2.0 query — English only for readable UI. */
export const DEFAULT_GDELT_QUERY =
  "sourcelang:english (financ* OR stock OR market OR economy OR bank OR invest* OR wallstreet OR nasdaq OR nyse)";

const DEFAULT_GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

/** GDELT DOC 2.0 asks clients to send at most one request every 5 seconds. */
export const GDELT_MIN_INTERVAL_MS = 5_000;

let lastGdeltRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGdeltSlot(): Promise<void> {
  const elapsed = Date.now() - lastGdeltRequestAt;
  if (lastGdeltRequestAt > 0 && elapsed < GDELT_MIN_INTERVAL_MS) {
    await sleep(GDELT_MIN_INTERVAL_MS - elapsed);
  }
  lastGdeltRequestAt = Date.now();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    // Drop common tracking params
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return raw.trim();
  }
}

/** GDELT seendate is like 20260910T150000Z → ISO timestamptz. */
export function parseGdeltSeenDate(seendate: string | null | undefined): string | null {
  if (!seendate) return null;
  const m = String(seendate).trim().match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i,
  );
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : iso;
}

export function newsSourceHash(input: {
  url: string;
  title: string;
  publishedAt: string | null;
}): string {
  const basis = [
    normalizeUrl(input.url).toLowerCase(),
    normalizeWhitespace(input.title).toLowerCase(),
    input.publishedAt ?? "",
  ].join("|");
  return createHash("sha256").update(basis).digest("hex");
}

export function normalizeGdeltArticle(
  raw: GdeltArticleRaw,
): NormalizedNewsArticle | null {
  const url = typeof raw.url === "string" ? normalizeUrl(raw.url) : "";
  const title = typeof raw.title === "string" ? normalizeWhitespace(raw.title) : "";
  if (!url || !title) return null;

  const published_at = parseGdeltSeenDate(raw.seendate);
  const domain =
    (typeof raw.domain === "string" && raw.domain.trim()) ||
    (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    })();

  const gdelt_id =
    raw.seendate && url
      ? `gdelt:${raw.seendate}:${createHash("sha256").update(url).digest("hex").slice(0, 16)}`
      : null;

  return {
    source: "gdelt",
    title,
    url,
    published_at,
    domain,
    image_url:
      typeof raw.socialimage === "string" && raw.socialimage.trim()
        ? raw.socialimage.trim()
        : null,
    language:
      typeof raw.language === "string" && raw.language.trim()
        ? raw.language.trim()
        : null,
    gdelt_id,
    source_hash: newsSourceHash({
      url,
      title,
      publishedAt: published_at,
    }),
    raw_source: raw,
  };
}

export async function fetchGdeltArticles(options?: {
  query?: string;
  maxRecords?: number;
  timespan?: string;
}): Promise<GdeltFetchResult> {
  const maxRecords = Math.min(250, Math.max(1, options?.maxRecords ?? 40));
  const query = options?.query?.trim() || DEFAULT_GDELT_QUERY;
  const timespan = options?.timespan?.trim() || "7d";

  const params = new URLSearchParams({
    query,
    mode: "ArtList",
    maxrecords: String(maxRecords),
    format: "json",
    sort: "DateDesc",
    timespan,
  });

  const url = `${DEFAULT_GDELT_URL}?${params.toString()}`;

  // GDELT asks for at most one request every 5 seconds.
  const maxAttempts = 2;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await waitForGdeltSlot();
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(45_000),
      });
      const text = await res.text();
      const rateLimited =
        res.status === 429 || /Please limit requests/i.test(text);
      if (rateLimited) {
        lastError =
          "GDELT rate limit — only one request every 5 seconds is allowed";
        if (attempt < maxAttempts) {
          await sleep(GDELT_MIN_INTERVAL_MS);
          continue;
        }
        return {
          status: "FAILED",
          fetched: 0,
          articles: [],
          error: lastError,
        };
      }
      if (!res.ok) {
        return {
          status: "FAILED",
          fetched: 0,
          articles: [],
          error: `GDELT HTTP ${res.status}: ${text.slice(0, 200)}`,
        };
      }

      let parsed: { articles?: GdeltArticleRaw[] };
      try {
        parsed = JSON.parse(text) as { articles?: GdeltArticleRaw[] };
      } catch {
        return {
          status: "FAILED",
          fetched: 0,
          articles: [],
          error: `GDELT returned non-JSON: ${text.slice(0, 120)}`,
        };
      }

      const rawList = Array.isArray(parsed.articles) ? parsed.articles : [];
      const byHash = new Map<string, NormalizedNewsArticle>();
      for (const raw of rawList) {
        const article = normalizeGdeltArticle(raw);
        if (!article) continue;
        if (!byHash.has(article.source_hash)) {
          byHash.set(article.source_hash, article);
        }
      }

      return {
        status: "SUCCESS",
        fetched: rawList.length,
        articles: [...byHash.values()],
        error: null,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        await sleep(GDELT_MIN_INTERVAL_MS);
        continue;
      }
    }
  }

  return {
    status: "FAILED",
    fetched: 0,
    articles: [],
    error: lastError,
  };
}
