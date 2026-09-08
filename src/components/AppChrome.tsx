import Link from "next/link";
import type { FeedView } from "@/lib/feed";
import { viewHref as hrefForView } from "@/lib/format";

function viewHref(view: FeedView) {
  return hrefForView(view);
}

const NAV: Array<{
  view: FeedView;
  label: string;
  icon: "home" | "trend" | "house" | "senate";
}> = [
  { view: "feed", label: "Feed", icon: "home" },
  { view: "trending", label: "Trending", icon: "trend" },
  { view: "house", label: "House", icon: "house" },
  { view: "senate", label: "Senate", icon: "senate" },
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
  active: FeedView;
};

export function SideNav({ active }: Props) {
  return (
    <nav
      aria-label="Primary"
      className="hidden w-[88px] shrink-0 flex-col items-center gap-2 pt-4 lg:flex"
    >
      {NAV.map((item) => {
        const isActive = item.view === active;
        return (
          <Link
            key={item.view}
            href={viewHref(item.view)}
            className={`group flex w-full flex-col items-center gap-1 rounded-2xl px-2 py-3 text-[11px] font-medium tracking-wide transition-all duration-300 ${
              isActive
                ? "bg-[color:var(--mint)] text-[color:var(--ink)] shadow-[0_0_24px_var(--glow)]"
                : "text-[color:var(--fog-dim)] hover:bg-[color:var(--panel-elevated)] hover:text-[color:var(--fog)]"
            }`}
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
        const isActive = item.view === active;
        return (
          <Link
            key={item.view}
            href={viewHref(item.view)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ${
              isActive
                ? "bg-[color:var(--mint)] text-[color:var(--ink)]"
                : "bg-[color:var(--panel-elevated)] text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]"
            }`}
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
