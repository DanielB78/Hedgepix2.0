"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import {
  Building2,
  Landmark,
  LineChart,
  Menu,
  Newspaper,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { AuthControls } from "@/components/AuthControls";

export type ChromeNavKey =
  | "feed"
  | "trending"
  | "house"
  | "senate"
  | "ceo-buys"
  | "news"
  | "stocks"
  | "members"
  | "landing";

type NavItem = {
  key: ChromeNavKey;
  href: string;
  label: string;
  icon: typeof LineChart;
};

const NAV_ITEMS: NavItem[] = [
  { key: "feed", href: "/app", label: "Overview", icon: LineChart },
  { key: "news", href: "/news", label: "News", icon: Newspaper },
  { key: "house", href: "/app?view=house", label: "House", icon: Building2 },
  { key: "senate", href: "/app?view=senate", label: "Senate", icon: Landmark },
  { key: "ceo-buys", href: "/ceo-buys", label: "Insiders", icon: Users },
  {
    key: "trending",
    href: "/app?view=trending",
    label: "Trending",
    icon: TrendingUp,
  },
];

function resolveActive(
  pathname: string,
  view: string | null,
  fallback?: ChromeNavKey,
): ChromeNavKey {
  if (pathname.startsWith("/news")) return "news";
  if (pathname.startsWith("/ceo-buys")) return "ceo-buys";
  if (pathname.startsWith("/stocks")) return "stocks";
  if (pathname.startsWith("/members")) return "members";
  if (pathname === "/app" || pathname.startsWith("/app")) {
    if (view === "trending") return "trending";
    if (view === "house") return "house";
    if (view === "senate") return "senate";
    return "feed";
  }
  return fallback ?? "feed";
}

function SidebarBrand() {
  return (
    <Link href="/app" className="flex items-center gap-2.5 px-3 py-1 no-underline">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-[11px] font-semibold tracking-wide text-white">
        HX
      </span>
      <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight text-[var(--ink)]">
        Hedgepix
      </span>
    </Link>
  );
}

function SidebarNav({
  active,
  onNavigate,
}: {
  active: ChromeNavKey;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3" aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const activeNow = active === item.key;
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            className={[
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] no-underline transition-colors",
              activeNow
                ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                : "text-[var(--fog-dim)] hover:bg-[var(--panel-muted)] hover:text-[var(--ink)]",
            ].join(" ")}
          >
            <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function AppShellFrame({
  active,
  title,
  description,
  actions,
  children,
}: {
  active: ChromeNavKey;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel)] md:flex">
        <div className="flex h-12 items-center border-b border-[var(--line)] px-2">
          <SidebarBrand />
        </div>
        <SidebarNav active={active} />
        <div className="mt-auto border-t border-[var(--line)] px-3 py-3">
          <p className="text-[10px] leading-relaxed text-[var(--fog-mute)]">
            Research workspace
          </p>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[240px] flex-col bg-[var(--panel)] shadow-lg">
            <div className="flex h-12 items-center justify-between border-b border-[var(--line)] px-2">
              <SidebarBrand />
              <button
                type="button"
                className="hx-icon-btn"
                aria-label="Close"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarNav
              active={active}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)]/95 px-3 backdrop-blur-sm sm:px-5">
          <button
            type="button"
            className="hx-icon-btn md:hidden"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-[var(--ink)]">
              {title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <AuthControls compact />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-4 sm:px-5 sm:py-5">
          {description ? (
            <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-[var(--fog-dim)]">
              {description}
            </p>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

function AppShellInner({
  active,
  title,
  description,
  actions,
  children,
}: {
  active?: ChromeNavKey;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const resolved = resolveActive(pathname, view, active);

  return (
    <AppShellFrame
      active={resolved}
      title={title}
      description={description}
      actions={actions}
    >
      {children}
    </AppShellFrame>
  );
}

export function AppShell({
  active,
  title,
  description,
  actions,
  children,
}: {
  active?: ChromeNavKey;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <AppShellFrame
          active={active ?? "feed"}
          title={title}
          description={description}
          actions={actions}
        >
          {children}
        </AppShellFrame>
      }
    >
      <AppShellInner
        active={active}
        title={title}
        description={description}
        actions={actions}
      >
        {children}
      </AppShellInner>
    </Suspense>
  );
}

/** @deprecated Prefer AppShell */
export function BrandMark() {
  return (
    <div className="mb-4">
      <SidebarBrand />
    </div>
  );
}

/** @deprecated Prefer AppShell */
export function SideNav({
  active,
}: {
  active: ChromeNavKey;
  showAuth?: boolean;
  horizontal?: boolean;
}) {
  return (
    <div className="mb-4 md:hidden">
      <SidebarNav active={active === "landing" ? "feed" : active} />
    </div>
  );
}

/** @deprecated Prefer AppShell */
export function TopTabs({ active }: { active: ChromeNavKey }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--line)] pb-2 md:hidden">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={[
            "rounded-md px-2.5 py-1.5 text-[12px] no-underline",
            active === item.key
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "text-[var(--fog-dim)]",
          ].join(" ")}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
