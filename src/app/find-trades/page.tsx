import { AppShell } from "@/components/AppChrome";
import { FindTradesBoard } from "@/components/find-trades/FindTradesBoard";
import { fetchFindTradesPayload } from "@/lib/findTrades/fetchFindTrades";

export const dynamic = "force-dynamic";

export default async function FindTradesPage() {
  const payload = await fetchFindTradesPayload(180);

  return (
    <AppShell
      active="find-trades"
      title="Find Trades"
      description="Build a query across House, Senate, and insider transactions."
    >
      <FindTradesBoard
        rows={payload.rows}
        error={payload.error}
        lookbackDays={payload.lookbackDays}
      />
    </AppShell>
  );
}
