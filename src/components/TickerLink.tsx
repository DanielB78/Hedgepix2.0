import Link from "next/link";

export function stockHref(ticker: string) {
  return `/stocks/${encodeURIComponent(ticker.toUpperCase())}`;
}

type Props = {
  ticker: string;
  className?: string;
  /** Broad or detailed sector label shown beside the symbol. */
  sectorLabel?: string | null;
};

export function TickerLink({ ticker, className, sectorLabel }: Props) {
  return (
    <Link
      href={stockHref(ticker)}
      className={
        className ??
        "inline-flex max-w-full items-center gap-1.5 font-medium tracking-tight text-[color:var(--deep-navy)] transition-opacity duration-200 hover:opacity-70"
      }
    >
      <span className="font-mono">{ticker}</span>
      {sectorLabel ? (
        <span className="truncate rounded bg-[color:var(--panel-elevated)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--fog-dim)]">
          {sectorLabel}
        </span>
      ) : null}
      <span aria-hidden className="text-[color:var(--muted)]">
        ›
      </span>
    </Link>
  );
}
