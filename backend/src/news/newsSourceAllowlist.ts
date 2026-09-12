import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Editable allowlist: backend/config/news-source-allowlist.json */
export const NEWS_SOURCE_ALLOWLIST_PATH = resolve(
  __dirname,
  "../../config/news-source-allowlist.json",
);

type AllowlistFile = {
  domains?: unknown;
};

let cachedNormalized: string[] | null = null;

/** Lowercase host without a leading `www.` */
export function normalizeNewsDomain(host: string | null | undefined): string | null {
  if (!host) return null;
  let h = String(host).trim().toLowerCase();
  if (!h) return null;
  // Strip port if present
  h = h.replace(/:\d+$/, "");
  if (h.startsWith("www.")) h = h.slice(4);
  return h || null;
}

export function loadNewsSourceAllowlist(
  path = NEWS_SOURCE_ALLOWLIST_PATH,
): string[] {
  if (cachedNormalized && path === NEWS_SOURCE_ALLOWLIST_PATH) {
    return cachedNormalized;
  }
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as AllowlistFile;
  if (!Array.isArray(parsed.domains)) {
    throw new Error(`Invalid news source allowlist (missing domains[]): ${path}`);
  }
  const domains = parsed.domains
    .map((d) => normalizeNewsDomain(typeof d === "string" ? d : null))
    .filter((d): d is string => Boolean(d));
  if (domains.length === 0) {
    throw new Error(`News source allowlist is empty: ${path}`);
  }
  if (path === NEWS_SOURCE_ALLOWLIST_PATH) {
    cachedNormalized = domains;
  }
  return domains;
}

/**
 * True when `domain` is on the allowlist or is a subdomain of an allowed host.
 * Examples: reuters.com, www.reuters.com, uk.reuters.com → allow if reuters.com listed.
 */
export function isAllowedNewsDomain(
  domain: string | null | undefined,
  allowlist: string[] = loadNewsSourceAllowlist(),
): boolean {
  const host = normalizeNewsDomain(domain);
  if (!host) return false;
  for (const allowed of allowlist) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

/** Test helper — clears the in-memory allowlist cache. */
export function clearNewsSourceAllowlistCache(): void {
  cachedNormalized = null;
}
