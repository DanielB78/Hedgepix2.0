import type { SyncState } from "@/lib/types";

type Props = {
  syncState: SyncState | null;
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Never";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function SiteHeader({ syncState }: Props) {
  return (
    <>
      <header className="space-y-3">
        <p className="text-sm font-medium tracking-wide text-teal-800 uppercase">
          Hedgepix · Disclosure monitor
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-stone-900 sm:text-5xl">
          Congress Trade Monitor
        </h1>
        <p className="max-w-2xl text-base text-stone-700">
          Recent House and Senate STOCK Act securities disclosures, fetched from
          official U.S. government disclosure systems and stored in Supabase.
        </p>
        <p className="rounded border border-teal-800/20 bg-teal-50 px-3 py-2 text-sm text-teal-950">
          Independent, unofficial monitor of public STOCK Act filings — not an
          official congressional API and not investment advice. House and Senate
          ingestion is derived from the open-source{" "}
          <a
            href="https://github.com/seralifatih/congress-trading-pipeline"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            congress-trading-pipeline
          </a>
          .
        </p>
      </header>

      <section className="flex flex-wrap items-end justify-between gap-3 rounded border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700 shadow-sm">
        <div>
          <div className="font-medium text-stone-900">Last successful sync</div>
          <div>{formatTimestamp(syncState?.last_success_at)}</div>
        </div>
        <div>
          <div className="font-medium text-stone-900">Last attempt</div>
          <div>{formatTimestamp(syncState?.last_attempt_at)}</div>
        </div>
        <div>
          <div className="font-medium text-stone-900">Latest disclosure seen</div>
          <div>{syncState?.latest_seen_disclosure_date ?? "—"}</div>
        </div>
        {syncState?.last_error ? (
          <div className="w-full text-red-700">
            Last error: {syncState.last_error}
          </div>
        ) : null}
      </section>
    </>
  );
}
