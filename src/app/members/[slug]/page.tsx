import Link from "next/link";
import { MemberHoldingsList } from "@/components/MemberHoldingsList";
import { MemberTabs } from "@/components/MemberTabs";
import { SiteHeader } from "@/components/SiteHeader";
import { TradeTable } from "@/components/TradeTable";
import { Pagination } from "@/components/Pagination";
import { HOLDINGS_DISCLAIMER, parseMemberTab } from "@/lib/holdings";
import { fetchMemberPage } from "@/lib/members";
import { fetchSyncState } from "@/lib/trades";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MemberPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const tab = parseMemberTab(query.tab);
  const pageRaw = typeof query.page === "string" ? query.page : "1";
  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);

  const [result, syncState] = await Promise.all([
    fetchMemberPage(slug, page),
    fetchSyncState(),
  ]);

  const profile = result.profile;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <SiteHeader syncState={syncState} compact />

      <div className="space-y-4">
        <Link
          href="/"
          className="inline-block text-sm text-[color:var(--navy)] transition hover:opacity-70"
        >
          ← Latest disclosures
        </Link>

        {!result.configured || result.error ? (
          <div className="rounded-[16px] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--rust)]">
            {result.error ?? "Configuration incomplete."}
          </div>
        ) : null}

        {!profile ? (
          <p className="rounded-[20px] bg-[color:var(--surface)] px-5 py-12 text-center text-[color:var(--muted)]">
            Member not found.
          </p>
        ) : (
          <>
            <div className="space-y-3">
              <h1 className="text-2xl font-medium tracking-tight text-[color:var(--deep-navy)]">
                {profile.name}
              </h1>
              {profile.chamber || profile.state ? (
                <p className="text-sm capitalize text-[color:var(--muted)]">
                  {[profile.chamber, profile.state?.toUpperCase()]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              <MemberTabs slug={profile.slug} active={tab} />
            </div>

            {tab === "holdings" ? (
              <section className="space-y-4">
                <p className="text-sm leading-relaxed text-[color:var(--muted)]">
                  {HOLDINGS_DISCLAIMER}
                </p>
                <MemberHoldingsList holdings={result.holdings} />
              </section>
            ) : (
              <section className="space-y-4">
                <TradeTable trades={result.trades} />
                <Pagination
                  filters={{ page }}
                  page={page}
                  pageSize={50}
                  totalCount={result.totalTradeCount}
                  basePath={`/members/${encodeURIComponent(profile.slug)}`}
                />
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
