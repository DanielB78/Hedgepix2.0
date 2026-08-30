import Link from "next/link";

type Props = {
  active?: "latest" | "trending";
};

export function MainNav({ active }: Props) {
  const base =
    "rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800";
  const activeClass = "bg-stone-900 text-white";
  const idleClass = "text-stone-700 hover:bg-stone-200/80";

  return (
    <nav
      aria-label="Primary"
      className="inline-flex gap-1 rounded-lg border border-stone-200 bg-white/90 p-1 shadow-sm"
    >
      <Link
        href="/"
        className={`${base} ${active === "latest" ? activeClass : idleClass}`}
        aria-current={active === "latest" ? "page" : undefined}
      >
        Latest
      </Link>
      <Link
        href="/trending"
        className={`${base} ${active === "trending" ? activeClass : idleClass}`}
        aria-current={active === "trending" ? "page" : undefined}
      >
        Trending
      </Link>
    </nav>
  );
}
