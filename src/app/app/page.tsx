import { BrandMark, SideNav, TopTabs } from "@/components/AppChrome";
import { AuthControls } from "@/components/AuthControls";
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

export default async function AppPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view = parseFeedView(params.view);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const housePage = parsePage(params.housePage);
  const senatePage = parsePage(params.senatePage);
  const performerPeriod = parsePerformerPeriod(params.perf);
  const payload = await fetchFeedPayload(performerPeriod, view);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 px-3 py-6 sm:px-6 lg:gap-8 lg:py-10">
      <SideNav active={view} showAuth />
      <main className="min-w-0 flex-1 space-y-8 pb-16">
        <div className="flex items-start justify-between gap-3 lg:hidden">
          <div className="flex-1">
            <BrandMark />
          </div>
          <AuthControls compact />
        </div>
        <div className="hidden lg:block">
          <BrandMark />
        </div>
        <TopTabs active={view} />
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
      </main>
    </div>
  );
}
