import { redirect } from "next/navigation";
import { LandingPage } from "@/components/LandingPage";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  // Preserve old `/?view=` bookmarks by sending them into the app shell.
  if (typeof params.view === "string" && params.view.trim()) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") qs.set(key, value);
    }
    redirect(`/app?${qs.toString()}`);
  }
  return <LandingPage />;
}
