import Link from "next/link";

export function stockHref(ticker: string) {
  return `/stocks/${encodeURIComponent(ticker.toUpperCase())}`;
}

type Props = {
  ticker: string;
  className?: string;
};

export function TickerLink({ ticker, className }: Props) {
  return (
    <Link
      href={stockHref(ticker)}
      className={
        className ??
        "inline-flex items-center gap-1 font-medium tracking-tight text-[color:var(--deep-navy)] transition-opacity duration-200 hover:opacity-70"
      }
    >
      <span className="font-mono">{ticker}</span>
      <span aria-hidden className="text-[color:var(--muted)]">
        ›
      </span>
    </Link>
  );
}
