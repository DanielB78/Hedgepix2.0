import Link from "next/link";

type Props = {
  active?: "latest" | "trending" | "ceo-buys";
};

export function MainNav({ active }: Props) {
  const item =
    "rounded-full px-4 py-2 text-sm font-medium transition-all duration-300";

  return (
    <nav
      aria-label="Primary"
      className="inline-flex flex-wrap gap-2"
    >
      <Link
        href="/?view=feed"
        className={
          active === "latest"
            ? `${item} bg-[color:var(--mint)] text-[color:var(--ink)]`
            : `${item} bg-[color:var(--panel-elevated)] text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]`
        }
        aria-current={active === "latest" ? "page" : undefined}
      >
        Feed
      </Link>
      <Link
        href="/?view=trending"
        className={
          active === "trending"
            ? `${item} bg-[color:var(--mint)] text-[color:var(--ink)]`
            : `${item} bg-[color:var(--panel-elevated)] text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]`
        }
        aria-current={active === "trending" ? "page" : undefined}
      >
        Trending
      </Link>
      <Link
        href="/ceo-buys"
        className={
          active === "ceo-buys"
            ? `${item} bg-[color:var(--mint)] text-[color:var(--ink)]`
            : `${item} bg-[color:var(--panel-elevated)] text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]`
        }
        aria-current={active === "ceo-buys" ? "page" : undefined}
      >
        CEO
      </Link>
    </nav>
  );
}
