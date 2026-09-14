/**
 * Shared SEC EDGAR HTTP client with polite User-Agent and throttling.
 */
import { createWriteStream } from "node:fs";
import { access, mkdir, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SEC_UA =
  process.env.SEC_USER_AGENT?.trim() ||
  "HedgepixResearch/1.0 (congress-trade-monitor; contact@example.com)";

const MIN_GAP_MS = Number.parseInt(process.env.SEC_REQUEST_GAP_MS ?? "350", 10);
let lastRequestAt = 0;

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, MIN_GAP_MS - (now - lastRequestAt));
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

export async function secFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  await throttle();
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", SEC_UA);
  if (!headers.has("Accept-Encoding")) headers.set("Accept-Encoding", "gzip, deflate");
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    throw new Error(`SEC fetch failed ${res.status} for ${url}`);
  }
  return res;
}

export async function secFetchText(url: string): Promise<string> {
  const res = await secFetch(url, {
    headers: { Accept: "text/html,application/xhtml+xml,text/plain,*/*" },
  });
  return await res.text();
}

export async function secFetchJson<T>(url: string): Promise<T> {
  const res = await secFetch(url, {
    headers: { Accept: "application/json" },
  });
  return (await res.json()) as T;
}

export async function downloadToFile(
  url: string,
  destPath: string,
  opts?: { force?: boolean; minBytes?: number },
): Promise<"cached" | "downloaded"> {
  const minBytes = opts?.minBytes ?? 1000;
  await mkdir(dirname(destPath), { recursive: true });
  if (!opts?.force) {
    try {
      await access(destPath);
      const st = await stat(destPath);
      if (st.size > minBytes) return "cached";
    } catch {
      // download
    }
  }

  const res = await secFetch(url, {
    headers: { Accept: "application/zip,application/octet-stream,*/*" },
  });
  if (!res.body) throw new Error(`Empty body for ${url}`);
  const tmp = `${destPath}.partial`;
  const file = createWriteStream(tmp);
  const nodeStream = Readable.fromWeb(
    res.body as import("node:stream/web").ReadableStream,
  );
  await pipeline(nodeStream, file);
  await rename(tmp, destPath);
  return "downloaded";
}

export async function unzipToDir(zipPath: string, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  try {
    await execFileAsync("unzip", ["-o", "-q", zipPath, "-d", outDir]);
    return;
  } catch {
    // fall through
  }
  throw new Error(
    `Failed to unzip ${zipPath} with system unzip. Install unzip and retry.`,
  );
}

export function filingIndexUrl(accession: string, primaryDoc: string): string {
  const acc = accession.replace(/-/g, "");
  const cik = String(Number.parseInt(acc.slice(0, 10), 10));
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${primaryDoc}`;
}

export function accessionToFilingUrl(accession: string): string {
  const clean = accession.trim();
  const accNodash = clean.replace(/-/g, "");
  const cikNum = Number.parseInt(accNodash.slice(0, 10), 10);
  if (!Number.isFinite(cikNum)) {
    return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=&type=&dateb=&owner=include&count=40`;
  }
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNodash}/${clean}-index.htm`;
}
