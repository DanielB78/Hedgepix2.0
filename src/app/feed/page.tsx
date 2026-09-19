import { AppShell } from "@/components/AppChrome";
import { FeedActivityBoard } from "@/components/feed/FeedActivityBoard";
import {
  fetchFeedActivityPayload,
  parseFeedTimeframe,
} from "@/lib/feedActivity/fetchFeedActivity";
import { parseFeedFilters } from "@/lib/feedActivity/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FeedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const timeframe = parseFeedTimeframe(params.tf);
  const filters = parseFeedFilters(params);
  const payload = await fetchFeedActivityPayload(timeframe, filters);

  return (
    <AppShell
      active="feed"
      title="Feed"
      description="Buyer-specific sector-overlap signals — repeated purchases into weakness when a member's congressional industry exposure overlaps the ticker."
    >
      <FeedActivityBoard
        rows={payload.rows}
        timeframe={payload.timeframe}
        filters={filters}
        error={payload.error}
        tradeCount={payload.tradeCount}
      />
    </AppShell>
  );
}
