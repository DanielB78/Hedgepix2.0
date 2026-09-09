import { createClient } from "@supabase/supabase-js";
import { aggregateCeoActivity } from "../src/lib/ceoAggregate";
import { fetchCeoBuys } from "../src/lib/ceoBuys";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const withCode = await sb
    .from("ceo_stock_purchases")
    .select("id,transaction_code,raw_source")
    .ilike("ceo_name", "%Chapman Steven%")
    .eq("ticker", "NTRA")
    .limit(3);
  console.log("with code col error:", withCode.error?.message);

  const res = await sb
    .from("ceo_stock_purchases")
    .select(
      "id, source_id, accession_number, ceo_name, officer_title, issuer_name, ticker, security_title, transaction_date, filing_date, shares_purchased, price_per_share, shares_owned_after, ownership_type, filing_url, form_type, quarter, created_at, raw_source",
    )
    .ilike("ceo_name", "%Chapman Steven%")
    .eq("ticker", "NTRA")
    .limit(200);

  console.log("fallback n", res.data?.length, "err", res.error?.message);
  const sample = res.data?.[0] as
    | { raw_source?: { trans_code?: string }; transaction_code?: string }
    | undefined;
  console.log("sample raw", sample?.raw_source, "tx", sample?.transaction_code);

  const result = await fetchCeoBuys({ q: "Chapman Steven", page: 1 });
  console.log(
    result.rows.map((r) => ({
      side: r.side,
      shares: r.shares,
      n: r.transaction_count,
      ticker: r.ticker,
      name: r.ceo_name,
    })),
  );
  console.log("total", result.totalCount, "err", result.error);

  const cards = aggregateCeoActivity(
    (res.data ?? []).map((row) => ({
      ...(row as object),
      transaction_code: undefined,
    })) as never,
  );
  console.log(
    "manual",
    cards.map((c) => ({ side: c.side, n: c.transaction_count, shares: c.shares })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
