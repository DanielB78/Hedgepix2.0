/**
 * Field + operator + value filter engine for Find Trades.
 * Missing / null values never match unless the operator is is_not_set.
 */

import { FILTER_FIELD_BY_ID } from "./filterRegistry";
import type {
  FilterCondition,
  FilterFieldDef,
  FilterOperator,
  FindTradeRow,
  FindTradesQuery,
  MatchExplanation,
  QueryNode,
  WindowNumberMap,
  WindowTrendMap,
} from "./types";

function asString(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function asNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function asDate(v: unknown): string | null {
  const s = asString(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function listValues(value: FilterCondition["value"]): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => asString(x).toLowerCase()).filter(Boolean);
  }
  const raw = asString(value);
  if (!raw) return [];
  return raw
    .split(/[,|]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function windowKey(
  condition: FilterCondition,
  field: FilterFieldDef,
): string {
  const params = condition.params ?? {};
  if (field.id === "prior_uptrend_buys" || field.id === "prior_downtrend_buys") {
    const tw = String(params.trendWindow ?? params.window ?? "20");
    return tw;
  }
  return String(params.window ?? field.params?.[0]?.defaultValue ?? "20");
}

function resolveFieldValue(
  row: FindTradeRow,
  field: FilterFieldDef,
  condition: FilterCondition,
): unknown {
  const path = field.path;
  const raw = (row as Record<string, unknown>)[path as string];

  if (field.windowed) {
    const key = windowKey(condition, field);
    if (raw && typeof raw === "object") {
      return (raw as Record<string, unknown>)[key] ?? null;
    }
    return null;
  }

  return raw;
}

function isMissing(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function normalizeForCompare(
  field: FilterFieldDef,
  value: unknown,
): string | number | boolean | string[] | null {
  if (isMissing(value)) return null;

  switch (field.type) {
    case "boolean":
      return Boolean(value);
    case "number":
    case "percentage":
    case "money":
      return asNumber(value);
    case "date":
      return asDate(value);
    case "enum":
    case "trend":
    case "text":
      if (Array.isArray(value)) {
        return value.map((v) => asString(v).toLowerCase());
      }
      return asString(value).toLowerCase();
    default:
      return asString(value).toLowerCase();
  }
}

function matchesArrayContains(
  fieldValue: unknown,
  needle: string,
  mode: "any_equals" | "any_contains",
): boolean {
  const list = Array.isArray(fieldValue)
    ? fieldValue.map((x) => asString(x).toLowerCase())
    : [asString(fieldValue).toLowerCase()];
  if (mode === "any_equals") return list.some((x) => x === needle);
  return list.some((x) => x.includes(needle));
}

export function evaluateCondition(
  row: FindTradeRow,
  condition: FilterCondition,
): boolean {
  const field = FILTER_FIELD_BY_ID.get(condition.fieldId);
  if (!field) return false;

  const op = condition.operator;
  const fieldRaw = resolveFieldValue(row, field, condition);

  if (op === "is_set") return !isMissing(fieldRaw);
  if (op === "is_not_set") return isMissing(fieldRaw);

  if (isMissing(fieldRaw)) return false;

  const fieldNorm = normalizeForCompare(field, fieldRaw);

  if (op === "is_true") return fieldNorm === true;
  if (op === "is_false") return fieldNorm === false;

  if (op === "contains") {
    const needle = asString(condition.value).toLowerCase();
    if (!needle) return false;
    if (Array.isArray(fieldRaw)) {
      return matchesArrayContains(fieldRaw, needle, "any_contains");
    }
    return asString(fieldNorm).includes(needle);
  }

  if (op === "one_of" || op === "not_one_of") {
    const wanted = listValues(condition.value);
    if (wanted.length === 0) return false;
    let hit = false;
    if (Array.isArray(fieldRaw)) {
      hit = fieldRaw.some((x) => wanted.includes(asString(x).toLowerCase()));
    } else {
      hit = wanted.includes(asString(fieldNorm));
    }
    return op === "one_of" ? hit : !hit;
  }

  if (op === "equals" || op === "not_equals") {
    const wanted = asString(condition.value).toLowerCase();
    let hit: boolean;
    if (Array.isArray(fieldRaw)) {
      hit = matchesArrayContains(fieldRaw, wanted, "any_equals");
    } else if (typeof fieldNorm === "boolean") {
      hit =
        fieldNorm ===
        (wanted === "true" || wanted === "yes" || wanted === "1");
    } else {
      hit = asString(fieldNorm) === wanted;
    }
    return op === "equals" ? hit : !hit;
  }

  if (
    op === "eq" ||
    op === "neq" ||
    op === "gt" ||
    op === "gte" ||
    op === "lt" ||
    op === "lte" ||
    op === "between"
  ) {
    const n = asNumber(fieldNorm);
    if (n == null) return false;
    const a = asNumber(condition.value);
    if (a == null && op !== "between") return false;
    switch (op) {
      case "eq":
        return n === a;
      case "neq":
        return n !== a;
      case "gt":
        return a != null && n > a;
      case "gte":
        return a != null && n >= a;
      case "lt":
        return a != null && n < a;
      case "lte":
        return a != null && n <= a;
      case "between": {
        const b = asNumber(condition.valueTo);
        if (a == null || b == null) return false;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return n >= lo && n <= hi;
      }
    }
  }

  if (op === "on" || op === "before" || op === "after" || op === "between") {
    const d = asDate(fieldNorm);
    if (!d) return false;
    if (op === "on") {
      const a = asDate(condition.value);
      return a != null && d === a;
    }
    if (op === "before") {
      const a = asDate(condition.value);
      return a != null && d < a;
    }
    if (op === "after") {
      const a = asDate(condition.value);
      return a != null && d > a;
    }
    const a = asDate(condition.value);
    const b = asDate(condition.valueTo);
    if (!a || !b) return false;
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    return d >= lo && d <= hi;
  }

  return false;
}

function evaluateNode(row: FindTradeRow, node: QueryNode): boolean {
  if (node.type === "condition") {
    return evaluateCondition(row, node.condition);
  }
  if (node.conditions.length === 0) return true;
  return node.conditions.some((c) => evaluateCondition(row, c));
}

export function tradeMatchesQuery(
  row: FindTradeRow,
  query: FindTradesQuery,
): boolean {
  if (query.nodes.length === 0) return true;
  return query.nodes.every((n) => evaluateNode(row, n));
}

export function filterFindTrades(
  rows: FindTradeRow[],
  query: FindTradesQuery,
): FindTradeRow[] {
  if (query.nodes.length === 0) return rows;
  return rows.filter((r) => tradeMatchesQuery(r, query));
}

function formatFieldDisplay(
  field: FilterFieldDef,
  value: unknown,
  condition: FilterCondition,
): string {
  if (isMissing(value)) return "unavailable";

  if (field.type === "boolean") {
    return value ? "Yes" : "No";
  }
  if (field.type === "percentage") {
    const n = asNumber(value);
    if (n == null) return "unavailable";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}%`;
  }
  if (field.type === "money") {
    const n = asNumber(value);
    if (n == null) return "unavailable";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }
  if (field.type === "trend") {
    const t = asString(value);
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "unavailable";
  }
  if (Array.isArray(value)) return value.join(", ");
  if (field.windowed) {
    const w = windowKey(condition, field);
    return `${asString(value)} (${w}d)`;
  }
  return asString(value);
}

export function explainMatch(
  row: FindTradeRow,
  query: FindTradesQuery,
): MatchExplanation[] {
  const out: MatchExplanation[] = [];
  const seen = new Set<string>();

  function push(condition: FilterCondition) {
    if (seen.has(condition.id)) return;
    seen.add(condition.id);
    const field = FILTER_FIELD_BY_ID.get(condition.fieldId);
    if (!field) return;
    const value = resolveFieldValue(row, field, condition);
    out.push({
      fieldId: field.id,
      label: field.label,
      display: formatFieldDisplay(field, value, condition),
      ok: evaluateCondition(row, condition),
    });
  }

  for (const node of query.nodes) {
    if (node.type === "condition") push(node.condition);
    else node.conditions.forEach(push);
  }
  return out;
}

export function summarizeCondition(condition: FilterCondition): string {
  const field = FILTER_FIELD_BY_ID.get(condition.fieldId);
  if (!field) return condition.fieldId;
  const op = condition.operator;

  if (op === "is_true") return `${field.label}`;
  if (op === "is_false") return `Not ${field.label}`;
  if (op === "is_set") return `${field.label} set`;
  if (op === "is_not_set") return `${field.label} missing`;

  let windowSuffix = "";
  if (field.windowed) {
    windowSuffix = ` ${windowKey(condition, field)}d`;
  }

  if (op === "between") {
    return `${field.label}${windowSuffix} ${condition.value}–${condition.valueTo}`;
  }

  const opShort =
    op === "equals"
      ? "="
      : op === "gte"
        ? "≥"
        : op === "lte"
          ? "≤"
          : op === "gt"
            ? ">"
            : op === "lt"
              ? "<"
              : op === "contains"
                ? "contains"
                : op === "one_of"
                  ? "in"
                  : String(op);

  let val = Array.isArray(condition.value)
    ? condition.value.join(", ")
    : String(condition.value ?? "");

  if (field.type === "percentage" && val !== "" && !val.includes("%")) {
    val = `${val}%`;
  }
  if (field.type === "enum" || field.type === "trend") {
    const found = field.enumValues?.find(
      (e) => e.value.toLowerCase() === val.toLowerCase(),
    );
    if (found) val = found.label;
  }

  return `${field.label}${windowSuffix} ${opShort} ${val}`.trim();
}

export function emptyWindowNumberMap(
  windows: readonly number[],
): WindowNumberMap {
  const out: WindowNumberMap = {};
  for (const w of windows) out[String(w)] = null;
  return out;
}

export function emptyWindowTrendMap(
  windows: readonly number[],
): WindowTrendMap {
  const out: WindowTrendMap = {};
  for (const w of windows) out[String(w)] = null;
  return out;
}

export function defaultOperatorForField(
  field: FilterFieldDef,
): FilterOperator {
  if (field.type === "boolean") return "is_true";
  if (field.type === "date") return "between";
  if (
    field.type === "number" ||
    field.type === "percentage" ||
    field.type === "money"
  ) {
    return "gte";
  }
  if (field.type === "trend" || field.type === "enum") return "equals";
  return "equals";
}
