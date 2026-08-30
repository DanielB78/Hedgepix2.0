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
        "font-mono font-medium text-teal-800 hover:text-teal-950 hover:underline"
      }
    >
      {ticker}
    </Link>
  );
}
