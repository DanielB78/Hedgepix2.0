/**
 * Apply news_articles schema using DATABASE_URL / SUPABASE_DB_URL /
 * SUPABASE_DB_PASSWORD when available.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx src/apply-news-schema.ts
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config as loadDotenv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../.env") });

function connectionString(): string | null {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  if (process.env.SUPABASE_DB_URL?.trim()) return process.env.SUPABASE_DB_URL.trim();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const url = process.env.SUPABASE_URL?.trim();
  if (password && url) {
    const ref = new URL(url).hostname.split(".")[0];
    return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  }
  return null;
}

async function main() {
  const cs = connectionString();
  if (!cs) {
    console.error(
      "Missing DATABASE_URL (or SUPABASE_DB_URL / SUPABASE_DB_PASSWORD).\n" +
        "Apply supabase/migrations/20260910180000_news_articles.sql,\n" +
        "supabase/migrations/20260911120000_news_article_sectors.sql,\n" +
        "supabase/migrations/20260912120000_news_article_naics_sectors.sql, and\n" +
        "supabase/migrations/20260912140000_news_article_ticker_moves.sql\n" +
        "in the Supabase SQL Editor.",
    );
    process.exitCode = 1;
    return;
  }
  const sqlFiles = [
    resolve(
      __dirname,
      "../../supabase/migrations/20260910180000_news_articles.sql",
    ),
    resolve(
      __dirname,
      "../../supabase/migrations/20260911120000_news_article_sectors.sql",
    ),
    resolve(
      __dirname,
      "../../supabase/migrations/20260912120000_news_article_naics_sectors.sql",
    ),
    resolve(
      __dirname,
      "../../supabase/migrations/20260912140000_news_article_ticker_moves.sql",
    ),
  ];
  const client = new pg.Client({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const sqlPath of sqlFiles) {
      const sql = await readFile(sqlPath, "utf8");
      await client.query(sql);
      console.log(`Applied ${sqlPath.split("/").pop()}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
