/**
 * Complete news refresh: clear stored articles, pull allowlisted GDELT
 * coverage across approved publishers, classify with full NAICS templates,
 * and store up to `target` articles.
 *
 *   cd backend && npx tsx scripts/refresh-news.ts
 */
import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadNewsSourceAllowlist } from "../src/news/newsSourceAllowlist.js";
import {
  fetchGdeltArticles,
  type NormalizedNewsArticle,
} from "../src/news/gdelt.js";
import { classifyNewsSectors } from "../src/news/classifySectors.js";
import {
  deleteNewsOlderThan,
  upsertNewsArticles,
} from "../src/store/newsStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../.env") });

const TARGET = Number(process.env.NEWS_REFRESH_TARGET ?? 100);
const PER_DOMAIN = Number(process.env.NEWS_REFRESH_PER_DOMAIN ?? 15);
const DOMAIN_GAP_MS = Number(process.env.NEWS_REFRESH_DOMAIN_GAP_MS ?? 7_500);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  opts: Parameters<typeof fetchGdeltArticles>[0],
  attempts = 3,
): Promise<Awaited<ReturnType<typeof fetchGdeltArticles>>> {
  let last = await fetchGdeltArticles(opts);
  for (let i = 1; i < attempts; i++) {
    if (last.status === "SUCCESS") return last;
    const rateLimited = (last.error ?? "").toLowerCase().includes("rate limit");
    const waitMs = rateLimited ? DOMAIN_GAP_MS * (i + 1) : DOMAIN_GAP_MS;
    console.warn(`  retry ${i}/${attempts - 1} after ${waitMs}ms (${last.error})`);
    await sleep(waitMs);
    last = await fetchGdeltArticles(opts);
  }
  return last;
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const allowlist = loadNewsSourceAllowlist();
  console.log(`Allowlist domains: ${allowlist.length}`);
  console.log(`Target articles: ${TARGET}`);

  // Full refresh — remove existing news so dropdown/sectors reflect this run.
  const before = await supabase
    .from("news_articles")
    .select("id", { count: "exact", head: true });
  console.log(`Existing news rows: ${before.count ?? 0}`);
  const wiped = await supabase
    .from("news_articles")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000")
    .select("id");
  if (wiped.error) {
    throw new Error(`Failed to clear news_articles: ${wiped.error.message}`);
  }
  console.log(`Cleared ${wiped.data?.length ?? 0} news rows`);

  const byHash = new Map<string, NormalizedNewsArticle>();

  // Broad finance sweep first (respects allowlist inside fetchGdeltArticles).
  console.log("Fetching broad GDELT finance batch…");
  await sleep(DOMAIN_GAP_MS);
  const broad = await fetchWithRetry({ maxRecords: 250, timespan: "14d" });
  if (broad.status === "SUCCESS") {
    console.log(
      `Broad: fetched=${broad.fetched} kept=${broad.articles.length} filtered=${broad.filteredBySource}`,
    );
    for (const a of broad.articles) byHash.set(a.source_hash, a);
  } else {
    console.warn(`Broad fetch failed: ${broad.error}`);
  }

  // Fill from each allowlisted publisher if still under target.
  for (const domain of allowlist) {
    if (byHash.size >= TARGET) break;
    const need = Math.min(PER_DOMAIN, TARGET - byHash.size);
    if (need <= 0) break;
    console.log(`Fetching domain:${domain} (need ~${need})…`);
    await sleep(DOMAIN_GAP_MS);
    const result = await fetchWithRetry({
      maxRecords: Math.min(250, Math.max(need * 2, 20)),
      timespan: "14d",
      query: `sourcelang:english domain:${domain}`,
    });
    if (result.status !== "SUCCESS") {
      console.warn(`  ${domain}: FAILED ${result.error}`);
      continue;
    }
    let added = 0;
    for (const a of result.articles) {
      if (byHash.has(a.source_hash)) continue;
      byHash.set(a.source_hash, a);
      added += 1;
      if (byHash.size >= TARGET) break;
    }
    console.log(
      `  ${domain}: fetched=${result.fetched} kept=${result.articles.length} filtered=${result.filteredBySource} newlyAdded=${added} total=${byHash.size}`,
    );
  }

  let articles = [...byHash.values()]
    .sort((a, b) => {
      const ta = a.published_at ? Date.parse(a.published_at) : 0;
      const tb = b.published_at ? Date.parse(b.published_at) : 0;
      return tb - ta;
    })
    .slice(0, TARGET);

  console.log(`Classifying ${articles.length} titles with full NAICS templates…`);
  const { byHash: labels, stats } = await classifyNewsSectors(
    articles.map((a) => ({ source_hash: a.source_hash, title: a.title })),
  );
  console.log("Classify:", stats);
  articles = articles.map((a) => {
    const label = labels.get(a.source_hash);
    if (!label) return a;
    return {
      ...a,
      sector: label.sector,
      sector_code: label.sector_code,
      sector_score: label.sector_score,
      sectors: label.sectors,
    };
  });

  const upsert = await upsertNewsArticles(supabase, articles);
  console.log("Upsert:", upsert);

  const retention = await deleteNewsOlderThan(supabase, 3);
  console.log("Retention:", retention);

  const after = await supabase
    .from("news_articles")
    .select("id, domain, sector, sector_1, sector_1_code", { count: "exact" });
  console.log(`Stored news rows: ${after.count ?? 0}`);

  const sectorCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  for (const row of after.data ?? []) {
    const d = row.domain ?? "(none)";
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    const s = row.sector_1_code
      ? `${row.sector_1_code} ${row.sector_1 ?? ""}`
      : row.sector ?? "(none)";
    sectorCounts.set(s, (sectorCounts.get(s) ?? 0) + 1);
  }
  console.log("\nDomains:");
  for (const [d, n] of [...domainCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}\t${d}`);
  }
  console.log("\nSectors (dropdown candidates):");
  for (const [s, n] of [...sectorCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}\t${s}`);
  }

  if ((after.count ?? 0) < TARGET) {
    console.warn(
      `\nWarning: stored ${after.count ?? 0} < target ${TARGET}. GDELT may have limited allowlisted coverage.`,
    );
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
