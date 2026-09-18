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

function parseTab(
  value: string | string[] | undefined,
): "activity" | "performers" | "sectors" | "overlap" {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "performers") return "performers";
  if (raw === "sectors") return "sectors";
  if (raw === "overlap") return "overlap";
  return "activity";
}

const META: Record<string, { title: string; description: string }> = {
  feed: {
    title: "Congress",
    description: "House and Senate stock disclosures.",
  },
  trending: {
    title: "Trending",
    description: "Tickers with the most disclosed congressional activity.",
  },
  house: {
    title: "House",
    description:
      "Same-day House disclosures with buys, charts, and top performers.",
  },
  senate: {
    title: "Senate",
    description:
      "Same-day Senate disclosures with buys, charts, and top performers.",
  },
  insiders: {
    title: "Insiders",
    description:
      "Form 4 officer buys and sales (CEO, CFO, and other named officers) with charts and top performers.",
  },
};

export default async function AppPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view = parseFeedView(params.view);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const housePage = parsePage(params.housePage);
  const senatePage = parsePage(params.senatePage);
  const insiderPage = parsePage(params.insiderPage);
  const tab = parseTab(params.tab);
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
        insiderPage={insiderPage}
        tab={tab}
      />
    </AppShell>
  );
}
