/**
 * Live smoke: NAICS→tickers + Alpaca hourly bars + abnormal assessment
 * (does not require news_article_ticker_moves table).
 */
import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchAlpacaHourlyBars } from "../src/news/alpacaHourlyBars.js";
import { evaluateTickerMove } from "../src/news/abnormalMoves.js";
import {
  articleNaicsCodes,
  loadSp500NaicsMapping,
  tickersForNaicsCodes,
} from "../src/news/sp500NaicsMapping.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../.env") });

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const apiKey = process.env.ALPACA_API_KEY?.trim();
  const apiSecret = process.env.ALPACA_API_SECRET?.trim();
  if (!url || !key) throw new Error("Missing Supabase env");
  if (!apiKey || !apiSecret) throw new Error("Missing Alpaca env");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Prefer weekday-published articles for measurable windows.
  const { data: articles, error } = await supabase
    .from("news_articles")
    .select(
      "id, title, published_at, sector_1_code, sector_2_code, sector_3_code",
    )
    .not("published_at", "is", null)
    .not("sector_1_code", "is", null)
    .order("published_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);

  const mapping = loadSp500NaicsMapping();
  const now = new Date();
  console.log(`now=${now.toISOString()} articles=${articles?.length ?? 0}`);
  console.log(`mapping codes=${mapping.size}`);

  let measured = 0;
  for (const a of articles ?? []) {
    const codes = articleNaicsCodes(a);
    const tickers = tickersForNaicsCodes(codes, mapping);
    if (tickers.size === 0) continue;
    const published = new Date(a.published_at as string);
    const sample = [...tickers.keys()].slice(0, 3);
    const bars = await fetchAlpacaHourlyBars(
      sample,
      new Date(now.getTime() - 35 * 864e5),
      now,
      { apiKey, apiSecret },
    );
    console.log(
      `\n${published.toISOString()} codes=${codes.join(",")} tickers=${tickers.size}`,
    );
    console.log(`  ${(a.title as string).slice(0, 80)}`);
    for (const t of sample) {
      const r = evaluateTickerMove(bars.get(t) ?? [], published, now);
      const m = r.measurement;
      if (m) measured += 1;
      console.log(
        `  ${t} bars=${(bars.get(t) ?? []).length} ret=${m?.eventReturnPct?.toFixed(3) ?? "n/a"}% typical=${r.assessment.historicalTypicalMovePct?.toFixed(3) ?? "n/a"}% ratio=${r.assessment.abnormalityRatio?.toFixed(2) ?? "n/a"} abnormal=${r.assessment.isAbnormal} h=${r.window.windowHours.toFixed(2)}`,
      );
    }
    if (measured >= 3) break;
  }

  const probe = await supabase
    .from("news_article_ticker_moves")
    .select("id")
    .limit(1);
  console.log(
    `\nmeasured=${measured} table=${probe.error?.message ?? "exists"}`,
  );
  if (measured < 1) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
