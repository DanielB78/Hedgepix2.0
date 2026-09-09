import { BrandMark, SideNav, TopTabs } from "@/components/AppChrome";
import { FeedBoard } from "@/components/FeedBoard";
import { FeedSearch } from "@/components/FeedSearch";
import { fetchFeedPayload, parseFeedView } from "@/lib/feed";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parsePage(value: string | string[] | undefined): number {
  const raw = typeof value === "string" ? value : "1";
  return Math.max(1, Number.parseInt(raw, 10) || 1);
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view = parseFeedView(params.view);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const housePage = parsePage(params.housePage);
  const senatePage = parsePage(params.senatePage);
  const payload = await fetchFeedPayload();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 px-3 py-6 sm:px-6 lg:gap-8 lg:py-10">
      <SideNav active={view} />
      <main className="min-w-0 flex-1 space-y-8 pb-16">
        <BrandMark />
        <TopTabs active={view} />
        <FeedSearch q={q || undefined} view={view === "feed" ? undefined : view} />
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
