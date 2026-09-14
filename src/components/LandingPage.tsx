"use client";

import Link from "next/link";
import { AuthControls } from "@/components/AuthControls";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="flex h-12 items-center justify-between border-b border-[var(--line)] bg-[var(--panel)] px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-[11px] font-semibold text-white">
            HX
          </span>
          <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight">
            Hedgepix
          </span>
        </Link>
        <AuthControls compact />
      </header>

      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fog-dim)]">
          Market intelligence
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
          Hedgepix
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--fog-dim)]">
          Congressional disclosures, insider Form 4 activity, and related market
          news in one research workspace.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link href="/app" className="hx-btn hx-btn-primary">
            Open workspace
          </Link>
          <Link href="/signup" className="hx-btn">
            Create account
          </Link>
        </div>

        <section className="mt-14 border-t border-[var(--line)] pt-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--fog-dim)]">
            Important notices
          </h2>
          <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-[var(--fog-dim)]">
            <p>
              <span className="font-medium text-[var(--ink)]">Not financial advice.</span>{" "}
              Nothing on this site is an offer, solicitation, or recommendation to
              buy, sell, or hold any security.
            </p>
            <p>
              <span className="font-medium text-[var(--ink)]">No accuracy guarantee.</span>{" "}
              Disclosures and prices may be incomplete, late, or incorrect. Verify
              independently before acting.
            </p>
            <p>
              <span className="font-medium text-[var(--ink)]">Public sources only.</span>{" "}
              Content is compiled from public filings and third-party market data.
              Official records remain authoritative.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
