/**
 * Parent/general-sector layer above existing niche industry labels.
 * Niche labels remain the source of truth for tickers and members.
 */
import mapJson from "@/data/generalSectorMap.json";

export type GeneralSector = keyof typeof mapJson;

export const GENERAL_SECTOR_ORDER: GeneralSector[] = [
  "Technology",
  "Financials",
  "Healthcare",
  "Energy",
  "Industrials",
  "Consumer",
  "Communication / Media",
  "Real Estate",
  "Materials",
  "Utilities",
  "Other",
];

export const GENERAL_SECTOR_MAP: Record<GeneralSector, string[]> =
  mapJson as Record<GeneralSector, string[]>;

const LABEL_TO_PARENTS = new Map<string, GeneralSector[]>();
const NORM_TO_LABEL = new Map<string, string>();

function norm(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

for (const parent of GENERAL_SECTOR_ORDER) {
  for (const label of GENERAL_SECTOR_MAP[parent] ?? []) {
    const key = norm(label);
    NORM_TO_LABEL.set(key, label);
    const list = LABEL_TO_PARENTS.get(key) ?? [];
    if (!list.includes(parent)) list.push(parent);
    LABEL_TO_PARENTS.set(key, list);
  }
}

export function normalizeNicheLabel(label: string): string {
  return norm(label);
}

export function canonicalNicheLabel(label: string): string {
  const key = norm(label);
  return NORM_TO_LABEL.get(key) ?? label.trim();
}

export function parentsForNicheLabel(label: string): GeneralSector[] {
  return LABEL_TO_PARENTS.get(norm(label)) ?? [];
}

export function nicheLabelsForParent(parent: GeneralSector): string[] {
  return GENERAL_SECTOR_MAP[parent] ?? [];
}

/** All unique niche labels across the map (canonical casing). */
export function allNicheLabels(): string[] {
  return [...NORM_TO_LABEL.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

export function searchNicheLabels(query: string, limit = 40): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return allNicheLabels().slice(0, limit);
  const out: string[] = [];
  for (const label of allNicheLabels()) {
    if (label.toLowerCase().includes(q)) {
      out.push(label);
      if (out.length >= limit) break;
    }
  }
  return out;
}
