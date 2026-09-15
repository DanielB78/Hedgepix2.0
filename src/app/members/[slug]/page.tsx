import Link from "next/link";
import { AppShell } from "@/components/AppChrome";
import { FollowButton } from "@/components/FollowButton";
import { MemberHoldingsList } from "@/components/MemberHoldingsList";
import { MemberTabs } from "@/components/MemberTabs";
import { TradeTable } from "@/components/TradeTable";
import { Pagination } from "@/components/Pagination";
import { HOLDINGS_DISCLAIMER, parseMemberTab } from "@/lib/holdings";
import { fetchMemberPage } from "@/lib/members";

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

  const result = await fetchMemberPage(slug, page);
  const profile = result.profile;
  const title = profile?.name ?? "Member";
  const description = profile
    ? [profile.chamber, profile.state?.toUpperCase()].filter(Boolean).join(" · ")
    : undefined;

  return (
    <AppShell
      active="members"
      title={title}
      description={description}
      actions={
        profile ? (
          <FollowButton
            type="member"
            targetKey={profile.slug}
            label={profile.name}
          />
        ) : undefined
      }
    >
      <div className="mb-4">
        <Link
          href="/app?view=house"
          className="text-[13px] text-[var(--fog-dim)] hover:text-[var(--accent)]"
        >
          ← House
        </Link>
      </div>

      {!result.configured || result.error ? (
        <div className="mb-4 hx-section px-4 py-3 text-sm text-[var(--rust)]">
          {result.error ?? "Configuration incomplete."}
        </div>
      ) : null}

      {!profile ? (
        <p className="hx-section px-5 py-10 text-center text-[var(--muted)]">
          Member not found.
        </p>
      ) : (
        <>
          <MemberTabs slug={profile.slug} active={tab} />

          {tab === "holdings" ? (
            <section className="mt-4 space-y-4">
              <p className="text-[13px] leading-relaxed text-[var(--muted)]">
                {HOLDINGS_DISCLAIMER}
              </p>
              <MemberHoldingsList holdings={result.holdings} />
            </section>
          ) : (
            <section className="mt-4 space-y-4">
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
    </AppShell>
  );
}
