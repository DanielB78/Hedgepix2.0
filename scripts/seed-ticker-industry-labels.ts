#!/usr/bin/env node
/**
 * Upsert curated industry labels into local/public ticker_profiles.
 * Usage: node --import tsx scripts/seed-ticker-industry-labels.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  curatedLabelEntries,
  industrySectorFromText,
} from "../src/lib/tickerIndustry.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE URL / key");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const entries = curatedLabelEntries();
  const rows = entries.map(([ticker, label]) => ({
    ticker,
    company_name: label.company || null,
    sector: industrySectorFromText(label.primary_industry, label.industries),
    industry: label.primary_industry,
    source: "curated_labels",
    updated_at: new Date().toISOString(),
  }));

  let upserted = 0;
  const chunk = 100;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error, count } = await supabase
      .from("ticker_profiles")
      .upsert(slice, { onConflict: "ticker", count: "exact" });
    if (error) {
      console.error("upsert failed", error.message);
      process.exit(1);
    }
    upserted += count ?? slice.length;
  }
  console.log(`Upserted ${upserted} curated ticker industry labels`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
