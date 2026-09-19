"use client";

/** Compact segmented control used by Watchlist and Top Performers. */

export type SegmentOption<T extends string> = {
  id: T;
  label: string;
};

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  testIdPrefix,
}: {
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (next: T) => void;
  testIdPrefix?: string;
}) {
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-0.5"
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={
              testIdPrefix ? `${testIdPrefix}-${opt.id}` : undefined
            }
            className={[
              "rounded px-3 py-1.5 text-[12px] font-medium transition-colors",
              active
                ? "bg-[var(--panel)] text-[var(--accent)] shadow-sm"
                : "text-[var(--fog-dim)] hover:text-[var(--ink)]",
            ].join(" ")}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
