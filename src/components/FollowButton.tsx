"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { FollowTargetType } from "@/lib/follows";

type Props = {
  type: FollowTargetType;
  targetKey: string;
  label: string;
  className?: string;
};

export function FollowButton({ type, targetKey, label, className }: Props) {
  const { user, loading, following, setFollow } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOn = following(type, targetKey);

  if (loading) return null;

  if (!user) {
    return (
      <a
        href="/login"
        className={
          className ??
          "inline-flex rounded-full border border-[color:var(--line)] px-4 py-2 text-sm font-semibold text-[color:var(--fog-dim)] hover:border-[color:var(--mint)]/40 hover:text-[color:var(--mint)]"
        }
      >
        Log in to follow
      </a>
    );
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const err = await setFollow(type, targetKey, label, !isOn);
          if (err) setError(err);
          setBusy(false);
        }}
        className={
          className ??
          `inline-flex rounded-full px-4 py-2 text-sm font-semibold transition ${
            isOn
              ? "border border-[color:var(--mint)]/40 bg-[color:var(--mint)]/15 text-[color:var(--mint)]"
              : "bg-[color:var(--mint)] text-[color:var(--ink)] hover:opacity-90"
          } disabled:opacity-60`
        }
      >
        {busy ? "…" : isOn ? "Following" : "Follow"}
      </button>
      {error ? (
        <span className="text-xs text-[color:var(--coral)]">{error}</span>
      ) : null}
    </div>
  );
}
