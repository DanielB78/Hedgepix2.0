import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Preserve old /feed bookmarks → /watchlist */
export default async function FeedRedirectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) qs.set(key, value);
  }
  const suffix = qs.toString();
  redirect(suffix ? `/watchlist?${suffix}` : "/watchlist");
}
