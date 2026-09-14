import { AppShell } from "@/components/AppChrome";
import { FeedBoard } from "@/components/FeedBoard";
import { FeedSearch } from "@/components/FeedSearch";
import { fetchFeedPayload, parseFeedView } from "@/lib/feed";
import { parsePerformerPeriod } from "@/lib/topPerformers";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parsePage(value: string | string[] | undefined): number {
  const raw = typeof value === "string" ? value : "1";
  return Math.max(1, Number.parseInt(raw, 10) || 1);
}

const META: Record<string, { title: string; description: string }> = {
  feed: {
    title: "Overview",
    description:
      "Latest congressional and insider activity with price context for followed names.",
  },
  trending: {
    title: "Trending",
    description: "Tickers with the most disclosed activity in the selected period.",
  },
  house: {
    title: "House",
    description: "Recent House stock disclosures.",
  },
  senate: {
    title: "Senate",
    description: "Recent Senate stock disclosures.",
  },
};

export default async function AppPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view = parseFeedView(params.view);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const housePage = parsePage(params.housePage);
  const senatePage = parsePage(params.senatePage);
  const performerPeriod = parsePerformerPeriod(params.perf);
  const payload = await fetchFeedPayload(performerPeriod, view);
  const meta = META[view] ?? META.feed!;

  return (
    <AppShell active={view} title={meta.title} description={meta.description}>
      <FeedSearch
        q={q || undefined}
        basePath="/app"
        view={view === "feed" ? undefined : view}
      />
      <FeedBoard
        view={view}
        payload={payload}
        query={q || undefined}
        housePage={housePage}
        senatePage={senatePage}
      />
    </AppShell>
  );
}
