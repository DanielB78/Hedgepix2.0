"use client";

import { useMemo, useState, useId, useRef, useEffect } from "react";
import {
  FILTER_CATEGORIES,
  FILTER_FIELD_BY_ID,
  operatorLabel,
  searchFilterFields,
} from "@/lib/findTrades/filterRegistry";
import {
  defaultOperatorForField,
  explainMatch,
  filterFindTrades,
  summarizeCondition,
} from "@/lib/findTrades/filterEngine";
import type {
  FilterCondition,
  FilterFieldDef,
  FilterOperator,
  FindTradeRow,
  FindTradesQuery,
  QueryNode,
} from "@/lib/findTrades/types";
import { formatShortDate, formatAmountRange } from "@/lib/format";
import { Plus, X, ChevronDown, ChevronRight, Search } from "lucide-react";

function newId(): string {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

function makeCondition(field: FilterFieldDef): FilterCondition {
  const params: Record<string, string | number> = {};
  for (const p of field.params ?? []) {
    params[p.id] = p.defaultValue;
  }
  let value: FilterCondition["value"] = "";
  if (field.type === "enum" || field.type === "trend") {
    value = field.enumValues?.[0]?.value ?? "";
  } else if (field.type === "boolean") {
    value = true;
  } else if (field.type === "percentage") {
    value = 0;
  } else if (field.type === "money" || field.type === "number") {
    value = 0;
  }
  return {
    id: newId(),
    fieldId: field.id,
    operator: defaultOperatorForField(field),
    value,
    valueTo: field.type === "date" ? "" : null,
    params,
  };
}

function sourceLabel(source: FindTradeRow["source"]): string {
  if (source === "house") return "House";
  if (source === "senate") return "Senate";
  return "Insider";
}

function valueDisplay(row: FindTradeRow): string {
  if (row.source === "insider") {
    if (row.exactValue != null) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(row.exactValue);
    }
    return row.amountRange ?? "—";
  }
  return formatAmountRange(row.disclosedMin, row.disclosedMax, row.amountRange);
}

function AddFilterMenu({
  onAdd,
  onAddOrGroup,
}: {
  onAdd: (field: FilterFieldDef) => void;
  onAddOrGroup: (fields: FilterFieldDef[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const fields = useMemo(() => searchFilterFields(q), [q]);
  const byCategory = useMemo(() => {
    const map = new Map<string, FilterFieldDef[]>();
    for (const cat of FILTER_CATEGORIES) map.set(cat, []);
    for (const f of fields) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return map;
  }, [fields]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="hx-btn inline-flex items-center gap-1.5 text-[13px]"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add filter
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-1 w-[min(100vw-2rem,22rem)] rounded-md border border-[var(--line)] bg-[var(--panel)] shadow-lg">
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-2.5 py-2">
            <Search className="h-3.5 w-3.5 text-[var(--fog-mute)]" />
            <input
              id={inputId}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search filters…"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--fog-mute)]"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {FILTER_CATEGORIES.map((cat) => {
              const list = byCategory.get(cat) ?? [];
              if (list.length === 0) return null;
              return (
                <div key={cat} className="px-1 py-1">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
                    {cat}
                  </div>
                  {list.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="flex w-full items-start rounded px-2 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--panel-muted)]"
                      onClick={() => {
                        onAdd(f);
                        setOpen(false);
                        setQ("");
                      }}
                    >
                      <span className="flex-1">{f.label}</span>
                    </button>
                  ))}
                </div>
              );
            })}
            {fields.length === 0 ? (
              <div className="px-3 py-4 text-[13px] text-[var(--fog-dim)]">
                No matching filters
              </div>
            ) : null}
          </div>
          <div className="border-t border-[var(--line)] px-2 py-1.5">
            <button
              type="button"
              className="w-full rounded px-2 py-1.5 text-left text-[12px] text-[var(--fog-dim)] hover:bg-[var(--panel-muted)] hover:text-[var(--ink)]"
              onClick={() => {
                const ticker = FILTER_FIELD_BY_ID.get("ticker");
                if (ticker) onAddOrGroup([ticker, ticker]);
                setOpen(false);
              }}
            >
              + OR group (e.g. Ticker A OR Ticker B)
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConditionEditor({
  condition,
  onChange,
  onRemove,
  compact,
}: {
  condition: FilterCondition;
  onChange: (next: FilterCondition) => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  const field = FILTER_FIELD_BY_ID.get(condition.fieldId);
  if (!field) return null;

  const needsValue =
    condition.operator !== "is_set" &&
    condition.operator !== "is_not_set" &&
    condition.operator !== "is_true" &&
    condition.operator !== "is_false";
  const needsBetween = condition.operator === "between";

  const controlClass =
    "rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]";

  return (
    <div
      className={[
        "flex flex-wrap items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5",
        compact ? "bg-[var(--panel-muted)]" : "",
      ].join(" ")}
    >
      <span className="text-[12px] font-medium text-[var(--ink)]">
        {field.label}
      </span>

      {(field.params ?? []).map((p) => (
        <label key={p.id} className="flex items-center gap-1 text-[11px] text-[var(--fog-dim)]">
          <span>{p.label}</span>
          {p.type === "enum" && p.options ? (
            <select
              className={controlClass}
              value={String(condition.params?.[p.id] ?? p.defaultValue)}
              onChange={(e) =>
                onChange({
                  ...condition,
                  params: { ...condition.params, [p.id]: e.target.value },
                })
              }
            >
              {p.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              className={`${controlClass} w-16`}
              value={String(condition.params?.[p.id] ?? p.defaultValue)}
              onChange={(e) =>
                onChange({
                  ...condition,
                  params: {
                    ...condition.params,
                    [p.id]: Number(e.target.value) || p.defaultValue,
                  },
                })
              }
            />
          )}
        </label>
      ))}

      <select
        className={controlClass}
        value={condition.operator}
        onChange={(e) =>
          onChange({
            ...condition,
            operator: e.target.value as FilterOperator,
          })
        }
      >
        {field.operators.map((op) => (
          <option key={op} value={op}>
            {operatorLabel(op)}
          </option>
        ))}
      </select>

      {needsValue ? (
        field.type === "enum" || field.type === "trend" ? (
          condition.operator === "one_of" ||
          condition.operator === "not_one_of" ? (
            <input
              className={`${controlClass} min-w-[8rem]`}
              placeholder="a, b, c"
              value={
                Array.isArray(condition.value)
                  ? condition.value.join(", ")
                  : String(condition.value ?? "")
              }
              onChange={(e) =>
                onChange({
                  ...condition,
                  value: e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          ) : (
            <select
              className={controlClass}
              value={String(condition.value ?? "")}
              onChange={(e) =>
                onChange({ ...condition, value: e.target.value })
              }
            >
              {(field.enumValues ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )
        ) : field.type === "date" ? (
          <>
            <input
              type="date"
              className={controlClass}
              value={String(condition.value ?? "")}
              onChange={(e) =>
                onChange({ ...condition, value: e.target.value })
              }
            />
            {needsBetween ? (
              <>
                <span className="text-[11px] text-[var(--fog-mute)]">and</span>
                <input
                  type="date"
                  className={controlClass}
                  value={String(condition.valueTo ?? "")}
                  onChange={(e) =>
                    onChange({ ...condition, valueTo: e.target.value })
                  }
                />
              </>
            ) : null}
          </>
        ) : field.type === "boolean" ? null : (
          <>
            <input
              type={
                field.type === "number" ||
                field.type === "percentage" ||
                field.type === "money"
                  ? "number"
                  : "text"
              }
              step={field.type === "percentage" ? "0.1" : "any"}
              className={`${controlClass} min-w-[6rem]`}
              value={
                Array.isArray(condition.value)
                  ? condition.value.join(", ")
                  : String(condition.value ?? "")
              }
              onChange={(e) => {
                const raw = e.target.value;
                if (
                  field.type === "number" ||
                  field.type === "percentage" ||
                  field.type === "money"
                ) {
                  onChange({
                    ...condition,
                    value: raw === "" ? "" : Number(raw),
                  });
                } else if (
                  condition.operator === "one_of" ||
                  condition.operator === "not_one_of"
                ) {
                  onChange({
                    ...condition,
                    value: raw
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  });
                } else {
                  onChange({ ...condition, value: raw });
                }
              }}
              placeholder={
                field.type === "percentage"
                  ? "%"
                  : field.type === "money"
                    ? "$"
                    : undefined
              }
            />
            {needsBetween ? (
              <>
                <span className="text-[11px] text-[var(--fog-mute)]">and</span>
                <input
                  type="number"
                  step={field.type === "percentage" ? "0.1" : "any"}
                  className={`${controlClass} min-w-[6rem]`}
                  value={String(condition.valueTo ?? "")}
                  onChange={(e) =>
                    onChange({
                      ...condition,
                      valueTo:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </>
            ) : null}
          </>
        )
      ) : null}

      <button
        type="button"
        aria-label="Remove filter"
        className="ml-auto rounded p-1 text-[var(--fog-mute)] hover:bg-[var(--panel-muted)] hover:text-[var(--ink)]"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ResultsRow({
  row,
  query,
}: {
  row: FindTradeRow;
  query: FindTradesQuery;
}) {
  const [open, setOpen] = useState(false);
  const explanations = open ? explainMatch(row, query) : [];

  const marketMetric = (() => {
    if (row.returnSincePreviousBuy != null) {
      const n = row.returnSincePreviousBuy;
      return `Since prev buy ${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
    }
    const r20 = row.returnBefore["20"];
    if (r20 != null) {
      return `20d before ${r20 >= 0 ? "+" : ""}${r20.toFixed(1)}%`;
    }
    if (row.returnSinceTrade != null) {
      const n = row.returnSinceTrade;
      return `Since trade ${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
    }
    return "—";
  })();

  return (
    <>
      <tr
        className="cursor-pointer border-b border-[var(--line)] hover:bg-[var(--panel-muted)]"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="whitespace-nowrap py-2 pr-3 text-[12px] text-[var(--fog-dim)]">
          <span className="inline-flex items-center gap-1">
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {formatShortDate(row.transactionDate ?? row.disclosureDate)}
          </span>
        </td>
        <td className="py-2 pr-3 text-[12px]">{sourceLabel(row.source)}</td>
        <td className="py-2 pr-3 text-[12px] font-medium text-[var(--ink)]">
          {row.person ?? "—"}
          {row.officerTitle ? (
            <span className="ml-1 font-normal text-[var(--fog-mute)]">
              · {row.officerTitle}
            </span>
          ) : null}
        </td>
        <td className="py-2 pr-3 font-mono text-[12px] font-semibold">
          {row.ticker ?? "—"}
        </td>
        <td className="py-2 pr-3 text-[12px]">
          <span
            className={
              row.transactionType === "buy"
                ? "hx-buy"
                : row.transactionType === "sale"
                  ? "hx-sell"
                  : ""
            }
          >
            {row.transactionType === "buy"
              ? "Buy"
              : row.transactionType === "sale"
                ? "Sale"
                : "Other"}
          </span>
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums">
          {valueDisplay(row)}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums text-[var(--fog-dim)]">
          {row.priceAtTrade != null || row.exactPrice != null
            ? `$${(row.exactPrice ?? row.priceAtTrade)!.toFixed(2)}`
            : "—"}
        </td>
        <td className="py-2 pr-3 text-[12px] text-[var(--fog-dim)]">
          {row.tickerGeneralSector ??
            row.tickerIndustryLabels[0] ??
            "—"}
        </td>
        <td className="py-2 pr-3 text-[12px]">
          {row.hasSectorOverlap === true ? (
            <span className="text-[var(--accent)]">
              {row.overlapMatchType === "direct" ? "Direct" : "Semantic"}
              {row.overlapSimilarity != null
                ? ` ${row.overlapSimilarity.toFixed(2)}`
                : ""}
            </span>
          ) : row.hasSectorOverlap === false ? (
            <span className="text-[var(--fog-mute)]">—</span>
          ) : (
            <span className="text-[var(--fog-mute)]">n/a</span>
          )}
        </td>
        <td className="py-2 text-[12px] tabular-nums text-[var(--fog-dim)]">
          {marketMetric}
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-[var(--line)] bg-[var(--panel-muted)]">
          <td colSpan={10} className="px-3 py-3">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
                  Trade details
                </div>
                <dl className="grid grid-cols-[8rem_1fr] gap-x-2 gap-y-1 text-[12px]">
                  <dt className="text-[var(--fog-dim)]">Person</dt>
                  <dd>{row.person ?? "—"}</dd>
                  <dt className="text-[var(--fog-dim)]">Ticker</dt>
                  <dd>
                    {row.ticker}
                    {row.company ? ` · ${row.company}` : ""}
                  </dd>
                  <dt className="text-[var(--fog-dim)]">Filed</dt>
                  <dd>{formatShortDate(row.disclosureDate)}</dd>
                  <dt className="text-[var(--fog-dim)]">State / title</dt>
                  <dd>{row.state ?? row.officerTitle ?? "—"}</dd>
                  {row.filingUrl ? (
                    <>
                      <dt className="text-[var(--fog-dim)]">Filing</dt>
                      <dd>
                        <a
                          href={row.filingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--accent)]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open
                        </a>
                      </dd>
                    </>
                  ) : null}
                </dl>
                {row.memberIndustryLabels.length > 0 ? (
                  <div className="mt-2 text-[12px]">
                    <span className="text-[var(--fog-dim)]">Member sectors: </span>
                    {row.memberIndustryLabels.join(", ")}
                  </div>
                ) : null}
                {row.tickerIndustryLabels.length > 0 ? (
                  <div className="mt-1 text-[12px]">
                    <span className="text-[var(--fog-dim)]">Ticker industries: </span>
                    {row.tickerIndustryLabels.join(", ")}
                  </div>
                ) : null}
                {row.hasSectorOverlap ? (
                  <div className="mt-1 text-[12px]">
                    <span className="text-[var(--fog-dim)]">Overlap: </span>
                    {row.overlapMemberLabel} ↔ {row.overlapTickerLabel}
                    {row.overlapSimilarity != null
                      ? ` (${row.overlapSimilarity.toFixed(3)})`
                      : ""}
                  </div>
                ) : null}
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
                  {query.nodes.length > 0
                    ? "Matched because"
                    : "Derived metrics"}
                </div>
                {explanations.length > 0 ? (
                  <ul className="space-y-1 text-[12px]">
                    {explanations.map((ex) => (
                      <li
                        key={ex.fieldId + ex.label}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <span className="text-[var(--fog-dim)]">{ex.label}</span>
                        <span className="tabular-nums text-[var(--ink)]">
                          {ex.display}
                          <span
                            className={
                              ex.ok
                                ? "ml-2 text-[var(--accent)]"
                                : "ml-2 text-[var(--coral)]"
                            }
                          >
                            {ex.ok ? "✓" : "✗"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <dl className="grid grid-cols-[10rem_1fr] gap-x-2 gap-y-1 text-[12px]">
                    <dt className="text-[var(--fog-dim)]">Price at trade</dt>
                    <dd>
                      {row.priceAtTrade != null
                        ? `$${row.priceAtTrade.toFixed(2)}`
                        : "—"}
                    </dd>
                    <dt className="text-[var(--fog-dim)]">20d before</dt>
                    <dd>
                      {row.returnBefore["20"] != null
                        ? `${row.returnBefore["20"]!.toFixed(1)}%`
                        : "—"}
                    </dd>
                    <dt className="text-[var(--fog-dim)]">Since prev buy</dt>
                    <dd>
                      {row.returnSincePreviousBuy != null
                        ? `${row.returnSincePreviousBuy.toFixed(1)}%`
                        : "—"}
                    </dd>
                    <dt className="text-[var(--fog-dim)]">Days since prev buy</dt>
                    <dd>{row.daysSincePreviousBuy ?? "—"}</dd>
                    <dt className="text-[var(--fog-dim)]">Consecutive buys</dt>
                    <dd>{row.consecutiveBuys ?? "—"}</dd>
                  </dl>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function FindTradesBoard({
  rows,
  error,
  lookbackDays,
}: {
  rows: FindTradeRow[];
  error: string | null;
  lookbackDays: number;
}) {
  const [nodes, setNodes] = useState<QueryNode[]>([]);

  const query: FindTradesQuery = useMemo(() => ({ nodes }), [nodes]);
  const matched = useMemo(
    () => filterFindTrades(rows, query),
    [rows, query],
  );

  function updateCondition(
    nodeId: string,
    conditionId: string,
    next: FilterCondition,
    isOr: boolean,
  ) {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.type === "condition" && n.condition.id === conditionId) {
          return { type: "condition", condition: next };
        }
        if (n.type === "or_group" && n.id === nodeId && isOr) {
          return {
            ...n,
            conditions: n.conditions.map((c) =>
              c.id === conditionId ? next : c,
            ),
          };
        }
        return n;
      }),
    );
  }

  function removeNode(nodeIndex: number) {
    setNodes((prev) => prev.filter((_, i) => i !== nodeIndex));
  }

  function removeOrCondition(nodeId: string, conditionId: string) {
    setNodes((prev) =>
      prev
        .map((n) => {
          if (n.type !== "or_group" || n.id !== nodeId) return n;
          const conditions = n.conditions.filter((c) => c.id !== conditionId);
          if (conditions.length === 0) return null;
          if (conditions.length === 1) {
            return { type: "condition" as const, condition: conditions[0]! };
          }
          return { ...n, conditions };
        })
        .filter(Boolean) as QueryNode[],
    );
  }

  const summaryParts: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (n.type === "condition") {
      summaryParts.push(summarizeCondition(n.condition));
    } else {
      summaryParts.push(
        `(${n.conditions.map(summarizeCondition).join(" OR ")})`,
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[var(--ink)]">
              Query builder
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--fog-dim)]">
              Combine conditions with AND. Use an OR group for alternatives.
              Searching {rows.length.toLocaleString()} trades from the last{" "}
              {lookbackDays} days.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AddFilterMenu
              onAdd={(field) => {
                setNodes((prev) => [
                  ...prev,
                  { type: "condition", condition: makeCondition(field) },
                ]);
              }}
              onAddOrGroup={(fields) => {
                setNodes((prev) => [
                  ...prev,
                  {
                    type: "or_group",
                    id: newId(),
                    conditions: fields.map((f) => makeCondition(f)),
                  },
                ]);
              }}
            />
            {nodes.length > 0 ? (
              <button
                type="button"
                className="text-[12px] text-[var(--fog-dim)] hover:text-[var(--ink)]"
                onClick={() => setNodes([])}
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        {nodes.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--line)] px-3 py-6 text-center text-[13px] text-[var(--fog-dim)]">
            No filters yet — click <strong>Add filter</strong> to start narrowing
            the trade universe.
          </div>
        ) : (
          <div className="space-y-2">
            {nodes.map((node, idx) => (
              <div key={node.type === "condition" ? node.condition.id : node.id}>
                {idx > 0 ? (
                  <div className="px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
                    and
                  </div>
                ) : null}
                {node.type === "condition" ? (
                  <ConditionEditor
                    condition={node.condition}
                    onChange={(next) =>
                      updateCondition("", node.condition.id, next, false)
                    }
                    onRemove={() => removeNode(idx)}
                  />
                ) : (
                  <div className="rounded-md border border-[var(--line)] bg-[var(--panel-muted)] p-2">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
                      OR group
                    </div>
                    <div className="space-y-1.5">
                      {node.conditions.map((c, ci) => (
                        <div key={c.id}>
                          {ci > 0 ? (
                            <div className="px-1 py-0.5 text-[10px] font-semibold uppercase text-[var(--fog-mute)]">
                              or
                            </div>
                          ) : null}
                          <ConditionEditor
                            condition={c}
                            compact
                            onChange={(next) =>
                              updateCondition(node.id, c.id, next, true)
                            }
                            onRemove={() => removeOrCondition(node.id, c.id)}
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-[11px] text-[var(--accent)]"
                        onClick={() => {
                          const ticker = FILTER_FIELD_BY_ID.get("ticker");
                          if (!ticker) return;
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.type === "or_group" && n.id === node.id
                                ? {
                                    ...n,
                                    conditions: [
                                      ...n.conditions,
                                      makeCondition(ticker),
                                    ],
                                  }
                                : n,
                            ),
                          );
                        }}
                      >
                        + OR condition
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {summaryParts.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--line)] pt-3 text-[12px]">
            {summaryParts.map((part, i) => (
              <span key={`${part}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 ? (
                  <span className="text-[10px] font-semibold uppercase text-[var(--fog-mute)]">
                    and
                  </span>
                ) : null}
                <span className="rounded-full border border-[var(--line)] bg-[var(--panel-muted)] px-2 py-0.5 text-[var(--ink)]">
                  {part}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-[var(--coral)]/30 bg-[color-mix(in_srgb,var(--coral)_6%,white)] px-3 py-2 text-[13px] text-[var(--coral)]">
          {error}
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">
            {matched.length.toLocaleString()} matching trade
            {matched.length === 1 ? "" : "s"}
          </h2>
          <span className="text-[11px] text-[var(--fog-mute)]">
            of {rows.length.toLocaleString()} loaded
          </span>
        </div>

        <div className="hx-table-wrap overflow-x-auto rounded-md border border-[var(--line)]">
          <table className="hx-table w-full min-w-[64rem]">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[11px] uppercase tracking-wide text-[var(--fog-mute)]">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Person</th>
                <th className="py-2 pr-3 font-medium">Ticker</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="num py-2 pr-3 text-right font-medium">Value</th>
                <th className="num py-2 pr-3 text-right font-medium">Price</th>
                <th className="py-2 pr-3 font-medium">Sector</th>
                <th className="py-2 pr-3 font-medium">Overlap</th>
                <th className="py-2 font-medium">Market</th>
              </tr>
            </thead>
            <tbody>
              {matched.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-8 text-center text-[13px] text-[var(--fog-dim)]"
                  >
                    No trades match the current query.
                  </td>
                </tr>
              ) : (
                matched.slice(0, 500).map((row) => (
                  <ResultsRow key={row.id} row={row} query={query} />
                ))
              )}
            </tbody>
          </table>
        </div>
        {matched.length > 500 ? (
          <p className="mt-2 text-[11px] text-[var(--fog-mute)]">
            Showing first 500 of {matched.length.toLocaleString()} matches.
            Add more filters to narrow further.
          </p>
        ) : null}
      </div>
    </div>
  );
}
