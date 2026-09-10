"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SideNav } from "@/components/AppChrome";
import { AuthControls } from "@/components/AuthControls";

export function LandingPage() {
  const infoRef = useRef<HTMLElement | null>(null);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    function onScroll() {
      setShowHint(window.scrollY < 40);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToInfo() {
    infoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 px-3 sm:px-6 lg:gap-8">
      <div className="hidden flex-col items-center gap-4 pt-8 lg:flex">
        <SideNav active="landing" />
        <AuthControls />
      </div>

      <div className="min-w-0 flex-1">
        <section className="relative flex min-h-[100svh] flex-col items-center justify-center pb-24 pt-10 text-center">
          <div className="absolute top-6 right-0 flex lg:hidden">
            <AuthControls compact />
          </div>

          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.4em] text-[color:var(--mint)] animate-rise">
            congressional markets
          </p>
          <h1 className="animate-brand font-[family-name:var(--font-display)] text-7xl font-extrabold lowercase leading-none tracking-tight text-[color:var(--fog)] sm:text-8xl md:text-9xl">
            hedgpix
          </h1>

          <Link
            href="/app?view=trending"
            className="mt-10 inline-flex rounded-full bg-[color:var(--mint)] px-10 py-3.5 text-base font-semibold tracking-wide text-[color:var(--ink)] shadow-[0_0_32px_var(--glow)] transition hover:opacity-90"
          >
            Enter
          </Link>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 lg:hidden">
            <SideNav active="landing" horizontal />
          </div>

          <button
            type="button"
            onClick={scrollToInfo}
            className={`absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-[color:var(--line)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--fog-dim)] transition hover:border-[color:var(--mint)]/40 hover:text-[color:var(--mint)] ${
              showHint ? "opacity-100" : "opacity-40"
            }`}
          >
            More info ↓
          </button>
        </section>

        <section
          ref={infoRef}
          id="more-info"
          className="mx-auto max-w-2xl space-y-10 pb-24 pt-6"
        >
          <div className="space-y-3 animate-rise">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[color:var(--fog)]">
              What is hedgpix?
            </h2>
            <p className="text-base leading-relaxed text-[color:var(--fog-dim)]">
              hedgpix tracks publicly disclosed congressional stock trades and
              related market context. Browse trending tickers, House and Senate
              activity, member profiles, and price charts with buy and sale
              markers — then follow the names and symbols you care about.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[color:var(--fog)]">
              Important legal notices
            </h2>
            <div className="space-y-4 rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel)] px-5 py-6 text-sm leading-relaxed text-[color:var(--fog-dim)]">
              <p>
                <strong className="text-[color:var(--fog)]">
                  Not financial advice.
                </strong>{" "}
                Nothing on this site is an offer, solicitation, or
                recommendation to buy, sell, or hold any security or other
                financial instrument. hedgpix does not provide investment,
                legal, tax, or accounting advice.
              </p>
              <p>
                <strong className="text-[color:var(--fog)]">
                  No accuracy guarantee.
                </strong>{" "}
                Disclosures, prices, and derived fields may be incomplete, late,
                amended, miscategorized, or otherwise incorrect. We do not claim
                that information shown here is accurate, complete, or current.
              </p>
              <p>
                <strong className="text-[color:var(--fog)]">
                  Public sources only.
                </strong>{" "}
                Content is compiled from public filings and third-party market
                data. Official records remain the authoritative source. Always
                verify material facts independently before making any decision.
              </p>
              <p>
                <strong className="text-[color:var(--fog)]">
                  Your responsibility.
                </strong>{" "}
                You use this site at your own risk. Past disclosures or price
                moves do not predict future results. If you need advice, consult
                a licensed professional who understands your situation.
              </p>
              <p>
                By entering the app you acknowledge these limitations and agree
                that hedgpix and its operators are not liable for decisions made
                based on information presented here.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/app?view=trending"
              className="rounded-full bg-[color:var(--mint)] px-6 py-2.5 text-sm font-semibold text-[color:var(--ink)]"
            >
              Enter trending
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-[color:var(--line)] px-6 py-2.5 text-sm font-semibold text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]"
            >
              Create account
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
