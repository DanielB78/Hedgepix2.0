"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export function AuthControls({ compact = false }: { compact?: boolean }) {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <span className="text-xs text-[color:var(--fog-dim)]">…</span>
    );
  }

  if (!user) {
    return (
      <div className={`flex items-center gap-2 ${compact ? "" : "flex-col"}`}>
        <Link
          href="/login"
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--fog-dim)] hover:bg-[color:var(--panel-elevated)] hover:text-[color:var(--fog)]"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-[color:var(--mint)]/15 px-3 py-1.5 text-xs font-semibold text-[color:var(--mint)] hover:bg-[color:var(--mint)] hover:text-[color:var(--ink)]"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "flex-col"}`}>
      <span
        className="max-w-[88px] truncate text-[10px] text-[color:var(--fog-dim)]"
        title={user.email ?? undefined}
      >
        {user.email}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--fog-dim)] hover:bg-[color:var(--panel-elevated)] hover:text-[color:var(--fog)]"
      >
        Log out
      </button>
    </div>
  );
}
