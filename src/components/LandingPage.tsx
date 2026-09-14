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
    <div className="mx-auto flex w-full max-w-5xl flex-1 gap-4 px-3 sm:px-6 lg:gap-6">
      <div className="hidden flex-col items-center gap-3 pt-6 lg:flex">
        <SideNav active="landing" />
        <AuthControls />
      </div>

      <div className="min-w-0 flex-1">
        <section className="relative flex min-h-[70svh] flex-col items-center justify-center pb-16 pt-10 text-center">
          <div className="absolute top-4 right-0 flex lg:hidden">
            <AuthControls compact />
          </div>

          <h1 className="hx-page-title text-2xl sm:text-3xl">Hedgepix</h1>
          <p className="hx-page-desc mx-auto mt-2 max-w-md text-sm leading-relaxed">
            Institutional research on congressional stock disclosures, CEO Form 4
            activity, and related market context.
          </p>

          <Link href="/app?view=trending" className="hx-btn hx-btn-primary mt-6">
            Enter
          </Link>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 lg:hidden">
            <SideNav active="landing" horizontal />
          </div>

          <button
            type="button"
            onClick={scrollToInfo}
            className={`hx-btn hx-btn-ghost absolute bottom-6 left-1/2 -translate-x-1/2 text-xs ${
              showHint ? "opacity-100" : "opacity-40"
            }`}
          >
            More info ↓
          </button>
        </section>

        <section
          ref={infoRef}
          id="more-info"
          className="mx-auto max-w-2xl space-y-8 pb-20 pt-4"
        >
          <div className="space-y-2 animate-rise">
            <h2 className="text-base font-semibold text-[color:var(--fog)]">
              What is Hedgepix?
            </h2>
            <p className="text-sm leading-relaxed text-[color:var(--fog-dim)]">
              Hedgepix tracks publicly disclosed congressional stock trades and
              related market context. Browse trending tickers, House and Senate
              activity, member profiles, and price charts with buy and sale
              markers — then follow the names and symbols you care about.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold text-[color:var(--fog)]">
              Important legal notices
            </h2>
            <div className="hx-section space-y-3 px-4 py-4 text-sm leading-relaxed text-[color:var(--fog-dim)]">
              <p>
                <strong className="text-[color:var(--fog)]">
                  Not financial advice.
                </strong>{" "}
                Nothing on this site is an offer, solicitation, or
                recommendation to buy, sell, or hold any security or other
                financial instrument. Hedgepix does not provide investment,
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
                that Hedgepix and its operators are not liable for decisions made
                based on information presented here.
              </p>
            </div>
          </div>

          <div className="hx-toolbar justify-center pt-1">
            <Link href="/app?view=trending" className="hx-btn hx-btn-primary">
              Enter trending
            </Link>
            <Link href="/signup" className="hx-btn">
              Create account
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
