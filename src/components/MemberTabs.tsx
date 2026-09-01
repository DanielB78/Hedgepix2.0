import Link from "next/link";
import type { MemberTab } from "@/lib/types";
import { memberHref } from "@/lib/holdings";

type Props = {
  slug: string;
  active: MemberTab;
};

export function MemberTabs({ slug, active }: Props) {
  const tabs: Array<{ id: MemberTab; label: string }> = [
    { id: "activity", label: "Activity" },
    { id: "holdings", label: "Holdings" },
  ];

  return (
    <nav
      className="flex gap-2"
      aria-label="Member sections"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={memberHref(slug, tab.id === "holdings" ? "holdings" : undefined)}
            className={
              selected
                ? "rounded-[14px] bg-[color:var(--deep-navy)] px-4 py-2 text-sm font-medium !text-[#EEE9DF]"
                : "rounded-[14px] bg-[color:var(--surface)] px-4 py-2 text-sm font-medium text-[color:var(--navy)] transition hover:bg-[color:var(--surface-strong)]"
            }
            aria-current={selected ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
