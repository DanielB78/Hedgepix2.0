import { createWriteStream } from "node:fs";
import { mkdir, writeFile, access, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SEC_UA =
  process.env.SEC_USER_AGENT?.trim() ||
  "HedgepixResearch/1.0 (congress-trade-monitor; contact@example.com)";

const INDEX_URL =
  "https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets";

export type QuarterRef = {
  quarter: string; // e.g. 2026q2
  path: string; // site-relative zip path
  url: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SEC_UA,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    throw new Error(`SEC fetch failed ${res.status} for ${url}`);
  }
  return await res.text();
}

/**
 * Discover quarterly ZIP hrefs from the SEC insider transactions page.
 * Newer quarters may live under /files/datastandardsinnovation/... while
 * historical ones use /files/structureddata/...
 */
export async function listSecQuarters(
  fromYear = 2012,
): Promise<QuarterRef[]> {
  const html = await fetchText(INDEX_URL);
  const re =
    /href="(\/files\/(?:structureddata|datastandardsinnovation)\/data\/insider-transactions-data-sets\/((?:19|20)\d{2}q[1-4])_form345\.zip)"/gi;
  const byQuarter = new Map<string, QuarterRef>();
  for (const match of html.matchAll(re)) {
    const path = match[1]!;
    const quarter = match[2]!.toLowerCase();
    const year = Number(quarter.slice(0, 4));
    if (year < fromYear) continue;
    byQuarter.set(quarter, {
      quarter,
      path,
      url: `https://www.sec.gov${path}`,
    });
  }
  return [...byQuarter.values()].sort((a, b) =>
    a.quarter.localeCompare(b.quarter),
  );
}

export async function downloadQuarterZip(
  ref: QuarterRef,
  destZip: string,
): Promise<void> {
  await mkdir(dirname(destZip), { recursive: true });
  try {
    await access(destZip);
    const st = await stat(destZip);
    if (st.size > 1000) {
      return;
    }
  } catch {
    // continue download
  }

  await sleep(350);
  const res = await fetch(ref.url, {
    headers: {
      "User-Agent": SEC_UA,
      Accept: "application/zip,application/octet-stream,*/*",
    },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} for ${ref.url}`);
  }
  const tmp = `${destZip}.partial`;
  const file = createWriteStream(tmp);
  const nodeStream = Readable.fromWeb(
    res.body as import("node:stream/web").ReadableStream,
  );
  await pipeline(nodeStream, file);
  await rename(tmp, destZip);
}

export async function unzipToDir(zipPath: string, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  // Prefer system unzip for large archives.
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

export function cachePaths(cacheRoot: string, quarter: string) {
  const qDir = join(cacheRoot, quarter);
  return {
    zip: join(qDir, `${quarter}_form345.zip`),
    extractDir: join(qDir, "extract"),
    marker: join(qDir, "done.json"),
  };
}

export async function writeQuarterMarker(
  markerPath: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await mkdir(dirname(markerPath), { recursive: true });
  await writeFile(markerPath, JSON.stringify(payload, null, 2));
}

