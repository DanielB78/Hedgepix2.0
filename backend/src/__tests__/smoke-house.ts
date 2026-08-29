async function main() {
  const { fetchAllHouse } = await import(
    "../../vendor/congress-trading-pipeline/house/src/fetcher/houseFetcher.js"
  );
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  console.log("fetching", from, to);
  const r = await fetchAllHouse(from, to);
  console.log({
    success: r.success,
    records: r.records.length,
    error: r.error,
    sample: r.records[0]
      ? {
          politician: r.records[0].politician,
          ticker: r.records[0].ticker,
          type: r.records[0].type,
          asset_name: r.records[0].asset_name,
        }
      : null,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
