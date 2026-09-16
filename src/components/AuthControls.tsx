"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export function AuthControls({ compact = true }: { compact?: boolean }) {
  const { user, loading, signOut } = useAuth();
  // Avoid SSR/client auth chrome mismatches (loading → logged-out flash).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || loading) {
    return (
      <div
        className={`flex h-8 items-center gap-1.5 ${compact ? "" : "flex-col"}`}
        aria-hidden
        suppressHydrationWarning
      >
        <span className="inline-block h-8 w-14 rounded-md bg-[var(--panel-muted)]" />
        <span className="inline-block h-8 w-16 rounded-md bg-[var(--panel-muted)]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`flex items-center gap-1.5 ${compact ? "" : "flex-col"}`}>
        <Link href="/login" className="hx-btn hx-btn-ghost h-8 px-2.5 text-xs">
          Log in
        </Link>
        <Link href="/signup" className="hx-btn hx-btn-primary h-8 px-2.5 text-xs">
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "flex-col"}`}>
      <span
        className="hidden max-w-[140px] truncate text-[11px] text-[var(--fog-dim)] sm:inline"
        title={user.email ?? undefined}
      >
        {user.email}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="hx-btn hx-btn-ghost h-8 px-2.5 text-xs"
      >
        Log out
      </button>
    </div>
  );
}
