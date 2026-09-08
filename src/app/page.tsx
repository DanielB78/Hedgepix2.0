import { BrandMark, SideNav, TopTabs } from "@/components/AppChrome";
import { FeedBoard } from "@/components/FeedBoard";
import { fetchFeedPayload, parseFeedView } from "@/lib/feed";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view = parseFeedView(params.view);
  const payload = await fetchFeedPayload();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 px-3 py-6 sm:px-6 lg:gap-8 lg:py-10">
      <SideNav active={view} />
      <main className="min-w-0 flex-1 space-y-8 pb-16">
        <BrandMark />
        <TopTabs active={view} />
        <FeedBoard view={view} payload={payload} />
      </main>
    </div>
  );
}
