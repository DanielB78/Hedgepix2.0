"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  GENERAL_SECTOR_ORDER,
  GENERAL_SECTOR_MAP,
  type GeneralSector,
} from "@/lib/generalSectors";
import {
  EMPTY_ADVANCED_FILTERS,
  activeFilterChips,
  applyAdvancedFiltersToParams,
  parseAdvancedTradeFilters,
  type AdvancedTradeFilters,
  type OverlapFilter,
  type SectorSourceFilter,
  type TransactionFilter,
} from "@/lib/advancedTradeFilters";

type Props = {
  /** When false, hide Member/Both sector-source options (Insiders). */
  allowMemberSectors?: boolean;
  /** Optional result count shown beside the bar. */
  resultCount?: number | null;
  resultLabel?: string;
};

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex overflow-hidden rounded-md border border-[color:var(--line)]"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            value === opt.value
              ? "bg-[color:var(--panel-elevated)] text-[color:var(--fog)]"
              : "bg-[color:var(--panel)] text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function useClickOutside(
  open: boolean,
  onClose: () => void,
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);
  return ref;
}

function SectorFilterPopover({
  draft,
  setDraft,
}: {
  draft: AdvancedTradeFilters;
  setDraft: (next: AdvancedTradeFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside(open, close);

  const selected = useMemo(
    () => new Set(draft.nicheLabels),
    [draft.nicheLabels],
  );

  const q = search.trim().toLowerCase();

  const parentState = useCallback(
    (parent: GeneralSector): "none" | "some" | "all" => {
      const children = GENERAL_SECTOR_MAP[parent] ?? [];
      if (children.length === 0) return "none";
      let n = 0;
      for (const c of children) if (selected.has(c)) n += 1;
      if (n === 0) return "none";
      if (n === children.length) return "all";
      return "some";
    },
    [selected],
  );

  const toggleParent = (parent: GeneralSector) => {
    const children = GENERAL_SECTOR_MAP[parent] ?? [];
    const state = parentState(parent);
    if (state === "all") {
      const drop = new Set(children);
      setDraft({
        ...draft,
        nicheLabels: draft.nicheLabels.filter((l) => !drop.has(l)),
      });
    } else {
      const next = new Set(draft.nicheLabels);
      for (const c of children) next.add(c);
      setDraft({ ...draft, nicheLabels: [...next] });
    }
  };

  const toggleChild = (label: string) => {
    if (selected.has(label)) {
      setDraft({
        ...draft,
        nicheLabels: draft.nicheLabels.filter((l) => l !== label),
      });
    } else {
      setDraft({ ...draft, nicheLabels: [...draft.nicheLabels, label] });
    }
  };

  const summary = useMemo(() => {
    if (draft.nicheLabels.length === 0) return "All";
    const selected = new Set(draft.nicheLabels);
    const parents: string[] = [];
    const covered = new Set<string>();
    for (const parent of GENERAL_SECTOR_ORDER) {
      const children = GENERAL_SECTOR_MAP[parent] ?? [];
      if (children.length && children.every((c) => selected.has(c))) {
        parents.push(parent);
        for (const c of children) covered.add(c);
      }
    }
    const extras = draft.nicheLabels.filter((l) => !covered.has(l));
    const bits = [...parents, ...extras];
    if (bits.length === 1) return bits[0]!;
    if (parents.length && extras.length === 0) {
      return parents.length <= 2
        ? parents.join(", ")
        : `${parents.length} sectors`;
    }
    return `${bits.length} labels`;
  }, [draft.nicheLabels]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="hx-btn hx-btn-ghost text-[12px]"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Sector: {summary} ▾
      </button>
      {open ? (
        <div className="absolute left-0 z-30 mt-1 w-[min(100vw-2rem,340px)] rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] p-3 shadow-[var(--shadow-soft)]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sectors…"
            className="hx-input mb-2 w-full text-[12px]"
          />
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              className="text-[11px] text-[color:var(--mint)] hover:opacity-80"
              onClick={() => {
                const all = GENERAL_SECTOR_ORDER.flatMap(
                  (p) => GENERAL_SECTOR_MAP[p] ?? [],
                );
                setDraft({ ...draft, nicheLabels: [...new Set(all)] });
              }}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-[11px] text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]"
              onClick={() => setDraft({ ...draft, nicheLabels: [] })}
            >
              Clear
            </button>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {GENERAL_SECTOR_ORDER.map((parent) => {
              const children = (GENERAL_SECTOR_MAP[parent] ?? []).filter(
                (c) => !q || c.toLowerCase().includes(q) || parent.toLowerCase().includes(q),
              );
              if (q && children.length === 0) return null;
              const state = parentState(parent);
              const isOpen = q ? true : expanded[parent] === true;
              return (
                <div key={parent}>
                  <div className="flex items-center gap-1.5 py-0.5">
                    <button
                      type="button"
                      className="w-4 shrink-0 text-[10px] text-[color:var(--fog-dim)]"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [parent]: !isOpen,
                        }))
                      }
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[12px] text-[color:var(--fog)]">
                      <input
                        type="checkbox"
                        className="accent-[color:var(--mint)]"
                        checked={state === "all"}
                        ref={(el) => {
                          if (el) el.indeterminate = state === "some";
                        }}
                        onChange={() => toggleParent(parent)}
                      />
                      <span className="truncate font-medium">{parent}</span>
                      <span className="text-[10px] text-[color:var(--fog-mute)]">
                        {(GENERAL_SECTOR_MAP[parent] ?? []).length}
                      </span>
                    </label>
                  </div>
                  {isOpen ? (
                    <ul className="mb-1 ml-5 space-y-0.5 border-l border-[color:var(--line)] pl-2.5">
                      {(q ? children : GENERAL_SECTOR_MAP[parent] ?? []).map(
                        (label) => (
                          <li key={label}>
                            <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[11px] text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]">
                              <input
                                type="checkbox"
                                className="accent-[color:var(--mint)]"
                                checked={selected.has(label)}
                                onChange={() => toggleChild(label)}
                              />
                              <span className="leading-snug">{label}</span>
                            </label>
                          </li>
                        ),
                      )}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MultiTextPopover({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside(open, close);

  const add = () => {
    const parts = text
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    onChange([...new Set([...values, ...parts])]);
    setText("");
  };

  const summary =
    values.length === 0
      ? "All"
      : values.length <= 2
        ? values.join(", ")
        : `${values.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="hx-btn hx-btn-ghost text-[12px]"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}: {summary} ▾
      </button>
      {open ? (
        <div className="absolute left-0 z-30 mt-1 w-64 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] p-3 shadow-[var(--shadow-soft)]">
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder={placeholder}
              className="hx-input min-w-0 flex-1 text-[12px]"
            />
            <button type="button" className="hx-btn hx-btn-primary text-[11px]" onClick={add}>
              Add
            </button>
          </div>
          {values.length > 0 ? (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {values.map((v) => (
                <li
                  key={v}
                  className="flex items-center justify-between gap-2 text-[11px] text-[color:var(--fog)]"
                >
                  <span className="truncate">{v}</span>
                  <button
                    type="button"
                    className="text-[color:var(--fog-dim)] hover:text-[color:var(--coral)]"
                    onClick={() => onChange(values.filter((x) => x !== v))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-[color:var(--fog-mute)]">
              No filters yet.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function TradeFiltersBar({
  allowMemberSectors = true,
  resultCount = null,
  resultLabel = "results",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const applied = useMemo(
    () => parseAdvancedTradeFilters(searchParams),
    [searchParams],
  );

  const [draft, setDraft] = useState<AdvancedTradeFilters>(applied);

  useEffect(() => {
    setDraft(applied);
  }, [applied]);

  // Insiders: force ticker-only source in draft display
  useEffect(() => {
    if (!allowMemberSectors && draft.sectorSource !== "ticker") {
      setDraft((d) => ({ ...d, sectorSource: "ticker" }));
    }
  }, [allowMemberSectors, draft.sectorSource]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(applied),
    [draft, applied],
  );

  const pushFilters = useCallback(
    (next: AdvancedTradeFilters) => {
      const params = new URLSearchParams(searchParams.toString());
      const normalized: AdvancedTradeFilters = {
        ...next,
        sectorSource: allowMemberSectors ? next.sectorSource : "ticker",
        tickers: next.tickers.map((t) => t.toUpperCase()),
      };
      applyAdvancedFiltersToParams(params, normalized);
      // Reset pagination when filters change
      params.delete("housePage");
      params.delete("senatePage");
      params.delete("insiderPage");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [allowMemberSectors, pathname, router, searchParams],
  );

  const chips = activeFilterChips(applied, { allowMemberSectors });

  return (
    <div className="mb-4 space-y-2">
      <div className="hx-toolbar flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--fog-dim)]">
          Filters
        </span>

        <ToggleGroup<TransactionFilter>
          ariaLabel="Transaction type"
          value={draft.transaction}
          onChange={(transaction) => setDraft({ ...draft, transaction })}
          options={[
            { value: "all", label: "All" },
            { value: "buys", label: "Buys" },
            { value: "sales", label: "Sales" },
          ]}
        />

        <SectorFilterPopover draft={draft} setDraft={setDraft} />

        <ToggleGroup<SectorSourceFilter>
          ariaLabel="Sector applies to"
          value={allowMemberSectors ? draft.sectorSource : "ticker"}
          onChange={(sectorSource) => setDraft({ ...draft, sectorSource })}
          options={[
            { value: "ticker", label: "Ticker" },
            {
              value: "member",
              label: "Member",
              disabled: !allowMemberSectors,
            },
            {
              value: "both",
              label: "Both",
              disabled: !allowMemberSectors,
            },
          ]}
        />

        <ToggleGroup<OverlapFilter>
          ariaLabel="Sector overlap"
          value={draft.overlap}
          onChange={(overlap) => setDraft({ ...draft, overlap })}
          options={[
            { value: "all", label: "All" },
            {
              value: "overlap",
              label: "Overlap",
              disabled: !allowMemberSectors,
            },
            {
              value: "no_overlap",
              label: "No overlap",
              disabled: !allowMemberSectors,
            },
          ]}
        />

        <MultiTextPopover
          label="Member"
          values={draft.members}
          placeholder="Name or slug…"
          onChange={(members) => setDraft({ ...draft, members })}
        />

        <MultiTextPopover
          label="Ticker"
          values={draft.tickers}
          placeholder="NVDA, MSFT…"
          onChange={(tickers) =>
            setDraft({
              ...draft,
              tickers: tickers.map((t) => t.toUpperCase()),
            })
          }
        />

        <button
          type="button"
          className="hx-btn hx-btn-primary text-[12px]"
          disabled={!dirty}
          onClick={() => pushFilters(draft)}
        >
          Apply
        </button>

        {chips.length > 0 ? (
          <button
            type="button"
            className="hx-btn hx-btn-ghost text-[12px]"
            onClick={() => {
              setDraft(EMPTY_ADVANCED_FILTERS);
              pushFilters(EMPTY_ADVANCED_FILTERS);
            }}
          >
            Clear all
          </button>
        ) : null}

        {typeof resultCount === "number" ? (
          <span className="ml-auto text-[12px] text-[color:var(--fog-dim)]">
            {resultCount.toLocaleString()} {resultLabel}
          </span>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] px-2 py-0.5 text-[11px] text-[color:var(--fog-dim)] hover:border-[color:var(--mint)]/40 hover:text-[color:var(--fog)]"
              onClick={() => {
                const next = chip.remove(applied);
                setDraft(next);
                pushFilters(next);
              }}
              title={`Remove ${chip.label}`}
            >
              {chip.label}
              <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
