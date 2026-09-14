/**
 * Apply additional SEC filings schema (13F, 13D/G, Form 144, 8-K, 10-Q/K,
 * offerings, N-PORT) using DATABASE_URL / SUPABASE_DB_URL /
 * SUPABASE_DB_PASSWORD when available.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx src/apply-sec-schema.ts
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
        "Apply supabase/migrations/20260914120000_sec_additional_filings.sql in the Supabase SQL Editor.",
    );
    process.exitCode = 1;
    return;
  }
  const sqlPath = resolve(
    __dirname,
    "../../supabase/migrations/20260914120000_sec_additional_filings.sql",
  );
  const sql = await readFile(sqlPath, "utf8");
  const client = new pg.Client({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Applied sec_additional_filings schema");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
