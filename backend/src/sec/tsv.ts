/**
 * Generic tab-separated file helpers shared by the SEC bulk dataset ingesters.
 */
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createInterface } from "node:readline";

export type TsvRow = Record<string, string>;

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function toRow(headers: string[], cols: string[]): TsvRow {
  const row: TsvRow = {};
  for (let i = 0; i < headers.length; i += 1) {
    row[headers[i]!] = cols[i] ?? "";
  }
  return row;
}

/** Parse an in-memory TSV blob (header row + tab-separated rows). */
export function parseTsvText(text: string): { headers: string[]; rows: TsvRow[] } {
  const lines = text.split(/\r?\n/);
  let headers: string[] | null = null;
  const rows: TsvRow[] = [];
  for (const line of lines) {
    if (line === "") continue;
    const cols = line.split("\t");
    if (!headers) {
      headers = cols.map((h) => stripBom(h).trim());
      continue;
    }
    rows.push(toRow(headers, cols));
  }
  return { headers: headers ?? [], rows };
}

/** Read an entire TSV file into memory. Only safe for small/medium files. */
export async function readTsvFile(path: string): Promise<{ headers: string[]; rows: TsvRow[] }> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let headers: string[] | null = null;
  const rows: TsvRow[] = [];
  for await (const line of rl) {
    if (line === "") continue;
    const cols = line.split("\t");
    if (!headers) {
      headers = cols.map((h) => stripBom(h).trim());
      continue;
    }
    rows.push(toRow(headers, cols));
  }
  return { headers: headers ?? [], rows };
}

/** Read only the header row of a (possibly huge) TSV file. */
export async function readTsvHeader(path: string): Promise<string[]> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    rl.close();
    return line.split("\t").map((h) => stripBom(h).trim());
  }
  return [];
}

/**
 * Stream rows of a large TSV file without buffering the whole file in memory.
 * Callers should filter/aggregate per-row instead of collecting every row.
 */
export async function* streamTsvRows(path: string): AsyncGenerator<TsvRow> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let headers: string[] | null = null;
  for await (const line of rl) {
    if (line === "") continue;
    const cols = line.split("\t");
    if (!headers) {
      headers = cols.map((h) => stripBom(h).trim());
      continue;
    }
    yield toRow(headers, cols);
  }
}

/** Parse SEC bulk-dataset dates like "31-MAR-2026" (also accepts ISO / YYYYMMDD). */
export function parseSecTsvDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const months: Record<string, string> = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
  };
  const mon = months[m[2]!.toUpperCase()];
  if (!mon) return null;
  const day = m[1]!.padStart(2, "0");
  return `${m[3]}-${mon}-${day}`;
}

export async function findFileCaseInsensitive(dir: string, name: string): Promise<string | null> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const match = entries.find((e) => e.toLowerCase() === name.toLowerCase());
  return match ? join(dir, match) : null;
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
