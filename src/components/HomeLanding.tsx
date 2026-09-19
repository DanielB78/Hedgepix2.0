"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Building2,
  Landmark,
  TrendingUp,
} from "lucide-react";
import { UniversalSearch } from "@/components/UniversalSearch";

function NavCard({
  href,
  title,
  subtitle,
  icon: Icon,
  testId,
  emphasis = false,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: typeof TrendingUp;
  testId: string;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={[
        "group flex items-start gap-3 rounded-md border px-3.5 py-3 no-underline transition-colors",
        emphasis
          ? "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent)]/40"
          : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--line-strong,var(--line))] hover:bg-[var(--panel-muted)]",
      ].join(" ")}
    >
      <span
        className={[
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          emphasis
            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
            : "bg-[var(--panel-muted)] text-[var(--fog-dim)]",
        ].join(" ")}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-semibold text-[var(--ink)]">
            {title}
          </span>
          <ArrowRight
            className="h-3.5 w-3.5 shrink-0 text-[var(--fog-mute)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
            strokeWidth={1.75}
          />
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-[var(--fog-dim)]">
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

export function HomeLanding() {
  return (
    <div className="mx-auto w-full max-w-3xl px-1 py-6 sm:py-10">
      <div className="mb-8 sm:mb-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fog-dim)]">
          Research workspace
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-[28px] font-semibold tracking-tight text-[var(--ink)] sm:text-[32px]">
          Hedgepix
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[var(--fog-dim)] sm:text-[15px]">
          Track disclosed trading activity and investigate market signals.
          Search a ticker or person, or jump into Watchlist and Trending.
        </p>
      </div>

      <div className="mb-10 sm:mb-12">
        <UniversalSearch
          size="large"
          autoFocus
          placeholder="Search ticker, company or person…"
        />
        <p className="mt-2 text-[11px] text-[var(--fog-mute)]">
          Search by ticker, company or person
        </p>
      </div>

      <section className="mb-8">
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fog-mute)]">
          Discover
        </h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <NavCard
            href="/watchlist"
            title="Watchlist"
            subtitle="Notable trade signals and buying into weakness"
            icon={Bookmark}
            testId="home-nav-watchlist"
            emphasis
          />
          <NavCard
            href="/app?view=trending"
            title="Trending"
            subtitle="Tickers receiving the most recent trading activity"
            icon={TrendingUp}
            testId="home-nav-trending"
            emphasis
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fog-mute)]">
          Congress
        </h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <NavCard
            href="/app?view=house"
            title="House"
            subtitle="Explore House member trading activity"
            icon={Building2}
            testId="home-nav-house"
          />
          <NavCard
            href="/app?view=senate"
            title="Senate"
            subtitle="Explore Senate trading activity"
            icon={Landmark}
            testId="home-nav-senate"
          />
        </div>
      </section>

      <p className="mt-12 border-t border-[var(--line)] pt-6 text-[12px] leading-relaxed text-[var(--fog-mute)]">
        Not financial advice. Disclosures may be incomplete or delayed. Verify
        independently before acting.
      </p>
    </div>
  );
}
