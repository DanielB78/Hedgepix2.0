/**
 * Fetch ~20 GDELT articles, classify sectors, upsert when schema allows.
 *
 *   cd backend && npx tsx scripts/gather-news-sectors.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";
import { classifyNewsSectors } from "../src/news/classifySectors.js";
import { fetchGdeltArticles } from "../src/news/gdelt.js";
import { upsertNewsArticles } from "../src/store/newsStore.js";
import { createSupabase } from "../src/store/supabaseStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("Fetching GDELT articles (maxRecords=25)…");
  const fetchResult = await fetchGdeltArticles({ maxRecords: 25 });
  if (fetchResult.status === "FAILED") {
    console.error("GDELT fetch failed:", fetchResult.error);
    process.exitCode = 1;
    return;
  }

  const articles = fetchResult.articles.slice(0, 20).map((a) => ({ ...a }));
  console.log(
    `Fetched ${fetchResult.fetched} raw / ${fetchResult.articles.length} normalized; using ${articles.length}`,
  );

  const { byHash, stats } = await classifyNewsSectors(
    articles.map((a) => ({ source_hash: a.source_hash, title: a.title })),
  );
  console.log("Sector classify:", stats);

  for (const article of articles) {
    const label = byHash.get(article.source_hash);
    if (!label) continue;
    article.sector = label.sector;
    article.sector_code = label.sector_code;
    article.sector_score = label.sector_score;
    article.sectors = label.sectors;
  }

  let upsertNote: unknown = "skipped";
  try {
    const config = loadConfig();
    const supabase = createSupabase(config);
    const upsert = await upsertNewsArticles(supabase, articles);
    upsertNote = upsert;
    console.log("Upsert:", upsert);
  } catch (err) {
    upsertNote = err instanceof Error ? err.message : String(err);
    console.warn("Upsert failed:", upsertNote);
  }

  const rows = articles.map((a, i) => ({
    n: i + 1,
    title: a.title,
    domain: a.domain,
    published_at: a.published_at,
    sector: a.sector ?? null,
    sector_code: a.sector_code ?? null,
    sector_score:
      typeof a.sector_score === "number"
        ? Number(a.sector_score.toFixed(4))
        : null,
    sectors: (a.sectors ?? []).map((s) => ({
      code: s.code,
      name: s.name,
      score: Number(s.score.toFixed(4)),
    })),
    url: a.url,
  }));

  const outDir = "/opt/cursor/artifacts";
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "gdelt_news_sector_gather.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        fetched_raw: fetchResult.fetched,
        used: articles.length,
        classify: stats,
        upsert: upsertNote,
        rows,
      },
      null,
      2,
    ),
  );
  console.log("Wrote", outPath);

  console.log("\n| # | Top NAICS | Score | #2 | #3 | Domain | Title |");
  console.log("|---|-----------|------:|----|----|--------|-------|");
  for (const row of rows) {
    const title = row.title.replace(/\|/g, "\\|").slice(0, 80);
    const s2 = row.sectors[1]?.code ?? "—";
    const s3 = row.sectors[2]?.code ?? "—";
    console.log(
      `| ${row.n} | ${row.sector_code ?? "—"} ${row.sector ?? ""} | ${row.sector_score ?? "—"} | ${s2} | ${s3} | ${row.domain ?? "—"} | ${title} |`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
