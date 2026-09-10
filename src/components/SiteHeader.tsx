import Link from "next/link";
import type { SyncState } from "@/lib/types";

type Props = {
  syncState: SyncState | null;
  compact?: boolean;
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function SiteHeader({ syncState, compact = false }: Props) {
  const synced = formatTimestamp(syncState?.last_success_at);

  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <Link
          href="/app?view=feed"
          className="text-[13px] font-semibold tracking-[0.28em] text-[color:var(--mint)] uppercase"
        >
          hedgpix
        </Link>
        {!compact ? (
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[color:var(--fog)] sm:text-4xl">
            Congress Trades
          </h1>
        ) : null}
      </div>
      {synced ? (
        <p className="shrink-0 text-sm text-[color:var(--fog-dim)]">
          Updated {synced}
        </p>
      ) : null}
    </header>
  );
}
