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
    <nav className="hx-toolbar gap-3" aria-label="Member sections">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={memberHref(slug, tab.id === "holdings" ? "holdings" : undefined)}
            className="hx-tab"
            data-active={selected ? "true" : "false"}
            aria-current={selected ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
