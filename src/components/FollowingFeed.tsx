"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export function FollowingFeed({
  onOpenTicker,
  onOpenMember,
}: {
  onOpenTicker: (ticker: string) => void;
  onOpenMember: (slug: string) => void;
}) {
  const { user, loading, follows } = useAuth();

  if (loading) {
    return (
      <p className="text-sm text-[color:var(--fog-dim)]">Loading your feed…</p>
    );
  }

  if (!user) {
    return (
      <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel)] px-5 py-8 text-center">
        <p className="text-sm text-[color:var(--fog-dim)]">
          Log in to build a personal feed of stocks and members you follow.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-full bg-[color:var(--mint)] px-4 py-2 text-sm font-semibold text-[color:var(--ink)]"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full border border-[color:var(--line)] px-4 py-2 text-sm font-semibold text-[color:var(--fog-dim)]"
          >
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  const tickers = follows.filter((f) => f.type === "ticker");
  const members = follows.filter((f) => f.type === "member");

  if (tickers.length === 0 && members.length === 0) {
    return (
      <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel)] px-5 py-8 text-center">
        <p className="text-sm text-[color:var(--fog-dim)]">
          You are not following anyone yet. Open a ticker or member profile and
          press Follow.
        </p>
        <Link
          href="/app?view=trending"
          className="mt-4 inline-flex rounded-full bg-[color:var(--mint)]/15 px-4 py-2 text-sm font-semibold text-[color:var(--mint)]"
        >
          Browse trending
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
          Followed stocks · {tickers.length}
        </h3>
        {tickers.length === 0 ? (
          <p className="text-sm text-[color:var(--fog-dim)]">No stocks yet.</p>
        ) : (
          <ul className="overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel)]">
            {tickers.map((item) => (
              <li
                key={`t-${item.key}`}
                className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3 last:border-0"
              >
                <button
                  type="button"
                  onClick={() => onOpenTicker(item.key)}
                  className="text-left font-semibold text-[color:var(--fog)] hover:text-[color:var(--mint)]"
                >
                  {item.key}
                  <span className="mt-0.5 block text-xs font-normal text-[color:var(--fog-dim)]">
                    {item.label !== item.key ? item.label : "Open chart"}
                  </span>
                </button>
                <Link
                  href={`/stocks/${encodeURIComponent(item.key)}`}
                  className="text-xs font-semibold text-[color:var(--mint)]"
                >
                  Profile
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
          Followed people · {members.length}
        </h3>
        {members.length === 0 ? (
          <p className="text-sm text-[color:var(--fog-dim)]">No members yet.</p>
        ) : (
          <ul className="overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel)]">
            {members.map((item) => (
              <li
                key={`m-${item.key}`}
                className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3 last:border-0"
              >
                <button
                  type="button"
                  onClick={() => onOpenMember(item.key)}
                  className="text-left font-semibold text-[color:var(--fog)] hover:text-[color:var(--mint)]"
                >
                  {item.label}
                  <span className="mt-0.5 block text-xs font-normal text-[color:var(--fog-dim)]">
                    Open preview
                  </span>
                </button>
                <Link
                  href={`/members/${encodeURIComponent(item.key)}`}
                  className="text-xs font-semibold text-[color:var(--mint)]"
                >
                  Profile
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
