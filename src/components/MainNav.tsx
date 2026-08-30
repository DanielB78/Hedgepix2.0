import Link from "next/link";

type Props = {
  active?: "latest" | "trending";
};

export function MainNav({ active }: Props) {
  const item =
    "rounded-[12px] px-4 py-2 text-sm font-medium transition-colors duration-200";

  return (
    <nav
      aria-label="Primary"
      className="inline-flex gap-1 rounded-[16px] bg-[#C9C1B1]/35 p-1"
    >
      <Link
        href="/"
        className={
          active === "latest"
            ? `${item} bg-[#1B2632] !text-[#EEE9DF]`
            : `${item} text-[#2C3B4D] hover:bg-[#C9C1B1]/45`
        }
        aria-current={active === "latest" ? "page" : undefined}
      >
        Latest
      </Link>
      <Link
        href="/trending"
        className={
          active === "trending"
            ? `${item} bg-[#1B2632] !text-[#EEE9DF]`
            : `${item} text-[#2C3B4D] hover:bg-[#C9C1B1]/45`
        }
        aria-current={active === "trending" ? "page" : undefined}
      >
        Trending
      </Link>
    </nav>
  );
}
