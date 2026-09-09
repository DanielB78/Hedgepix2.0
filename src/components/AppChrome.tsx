import Link from "next/link";
import type { FeedView } from "@/lib/feed";
import { viewHref as hrefForView } from "@/lib/format";

export type ChromeNavKey = FeedView | "ceo-buys";

function navHref(key: ChromeNavKey) {
  if (key === "ceo-buys") return "/ceo-buys";
  return hrefForView(key);
}

const NAV: Array<{
  key: ChromeNavKey;
  label: string;
  icon: "home" | "trend" | "house" | "senate" | "ceo";
}> = [
  { key: "feed", label: "Feed", icon: "home" },
  { key: "trending", label: "Trending", icon: "trend" },
  { key: "house", label: "House", icon: "house" },
  { key: "senate", label: "Senate", icon: "senate" },
  { key: "ceo-buys", label: "CEO", icon: "ceo" },
];

function NavIcon({ icon }: { icon: (typeof NAV)[number]["icon"] }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (icon === "home") {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    );
  }
  if (icon === "trend") {
    return (
      <svg {...common}>
        <path d="M4 17 10 11l4 4 6-8" />
        <path d="M15 7h5v5" />
      </svg>
    );
  }
  if (icon === "house") {
    return (
      <svg {...common}>
        <path d="M4 20V9l8-5 8 5v11" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }
  if (icon === "ceo") {
    return (
      <svg {...common}>
        <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
        <path d="M4 20c1.5-3.5 4.2-5 8-5s6.5 1.5 8 5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 20V8" />
      <path d="M5 8c4-4 10-4 14 0" />
      <path d="M12 8v12" />
      <path d="M19 8v12" />
    </svg>
  );
}

type Props = {
  active: ChromeNavKey;
};

export function SideNav({ active }: Props) {
  return (
    <nav
      aria-label="Primary"
      className="hidden w-[88px] shrink-0 flex-col items-center gap-2 pt-4 lg:flex"
    >
      {NAV.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={navHref(item.key)}
            className={`group flex w-full flex-col items-center gap-1 rounded-2xl px-2 py-3 text-[11px] font-medium tracking-wide transition-all duration-300 ${
              isActive
                ? "bg-[color:var(--mint)] text-[color:var(--ink)] shadow-[0_0_24px_var(--glow)]"
                : "text-[color:var(--fog-dim)] hover:bg-[color:var(--panel-elevated)] hover:text-[color:var(--fog)]"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <NavIcon icon={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function TopTabs({ active }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {NAV.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={navHref(item.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ${
              isActive
                ? "bg-[color:var(--mint)] text-[color:var(--ink)]"
                : "bg-[color:var(--panel-elevated)] text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function BrandMark() {
  return (
    <div className="animate-rise text-center">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-[color:var(--mint)]">
        congressional markets
      </p>
      <h1 className="animate-brand font-[family-name:var(--font-display)] text-6xl font-extrabold lowercase leading-none tracking-tight text-[color:var(--fog)] sm:text-7xl md:text-8xl">
        hedgpix
      </h1>
      <p className="mx-auto mt-4 max-w-md text-sm text-[color:var(--fog-dim)] sm:text-base">
        Watch what Congress is buying and selling — then dig into the chart.
      </p>
    </div>
  );
}
