"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export function AuthControls({ compact = true }: { compact?: boolean }) {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return <span className="text-xs text-[var(--fog-dim)]">…</span>;
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
