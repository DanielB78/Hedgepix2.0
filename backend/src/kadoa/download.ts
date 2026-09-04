import { createWriteStream, existsSync, promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const execFileAsync = promisify(execFile);

const DEFAULT_REPO =
  "https://github.com/kadoa-org/congress-trading-monitor.git";
const DEFAULT_REF = "main";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = resolve(__dirname, "../../.cache/kadoa-congress");

export type KadoaDatasetPaths = {
  root: string;
  dataDir: string;
  filerDir: string;
};

/**
 * Resolve a local Kadoa dataset directory.
 *
 * Prefers `KADOA_DATA_DIR` (path to repo root or `public/data`).
 * Otherwise clones/updates the MIT dataset into backend/.cache.
 */
export async function ensureKadoaDataset(options?: {
  dataDir?: string;
  cacheDir?: string;
  repoUrl?: string;
  ref?: string;
  refresh?: boolean;
}): Promise<KadoaDatasetPaths> {
  const envDir = process.env.KADOA_DATA_DIR?.trim();
  const explicit = options?.dataDir?.trim() || envDir;
  if (explicit) {
    return resolveDataPaths(explicit);
  }

  const cacheDir = options?.cacheDir ?? DEFAULT_CACHE_DIR;
  const repoUrl = options?.repoUrl ?? process.env.KADOA_REPO_URL ?? DEFAULT_REPO;
  const ref = options?.ref ?? process.env.KADOA_REPO_REF ?? DEFAULT_REF;
  const refresh = options?.refresh === true || process.env.KADOA_REFRESH === "1";

  if (existsSync(join(cacheDir, "public", "data", "filer")) && !refresh) {
    return resolveDataPaths(cacheDir);
  }

  await fs.mkdir(dirname(cacheDir), { recursive: true });

  if (existsSync(join(cacheDir, ".git"))) {
    console.log(`[kadoa] Updating cached dataset in ${cacheDir}…`);
    await execFileAsync("git", ["fetch", "--depth", "1", "origin", ref], {
      cwd: cacheDir,
    });
    await execFileAsync("git", ["checkout", "-f", "FETCH_HEAD"], {
      cwd: cacheDir,
    });
  } else {
    if (existsSync(cacheDir)) {
      await fs.rm(cacheDir, { recursive: true, force: true });
    }
    console.log(`[kadoa] Cloning ${repoUrl} (${ref}) into ${cacheDir}…`);
    try {
      await execFileAsync(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--branch",
          ref,
          "--filter=blob:none",
          "--sparse",
          repoUrl,
          cacheDir,
        ],
        { maxBuffer: 20 * 1024 * 1024 },
      );
      await execFileAsync(
        "git",
        ["sparse-checkout", "set", "public/data"],
        { cwd: cacheDir },
      );
    } catch (err) {
      console.warn(
        `[kadoa] Sparse clone failed (${err instanceof Error ? err.message : String(err)}); trying zipball…`,
      );
      await downloadZipball(cacheDir, repoUrl, ref);
    }
  }

  return resolveDataPaths(cacheDir);
}

async function downloadZipball(
  cacheDir: string,
  repoUrl: string,
  ref: string,
): Promise<void> {
  // https://github.com/org/repo.git → archive URL
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  if (!match) {
    throw new Error(`Cannot derive zipball URL from ${repoUrl}`);
  }
  const [, owner, repo] = match;
  const zipUrl = `https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`;
  console.log(`[kadoa] Downloading ${zipUrl}…`);

  const tmpParent = dirname(cacheDir);
  await fs.mkdir(tmpParent, { recursive: true });
  const tarPath = join(tmpParent, `kadoa-${ref}.tar.gz`);

  const response = await fetch(zipUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download Kadoa archive: HTTP ${response.status}`);
  }
  const nodeStream = Readable.fromWeb(
    response.body as import("node:stream/web").ReadableStream,
  );
  await pipeline(nodeStream, createWriteStream(tarPath));

  const extractDir = join(tmpParent, `kadoa-extract-${Date.now()}`);
  await fs.mkdir(extractDir, { recursive: true });
  await execFileAsync("tar", ["-xzf", tarPath, "-C", extractDir]);
  const entries = await fs.readdir(extractDir);
  const rootName = entries.find((name) => !name.startsWith("."));
  if (!rootName) throw new Error("Kadoa archive had no root directory");
  const extractedRoot = join(extractDir, rootName);
  if (existsSync(cacheDir)) {
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
  await fs.rename(extractedRoot, cacheDir);
  await fs.rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
  await fs.rm(tarPath, { force: true }).catch(() => undefined);
}

function resolveDataPaths(input: string): KadoaDatasetPaths {
  const abs = resolve(input);
  const candidates = [
    abs,
    join(abs, "public", "data"),
    join(abs, "data"),
  ];

  for (const dataDir of candidates) {
    const filerDir = join(dataDir, "filer");
    if (existsSync(filerDir)) {
      const root =
        dataDir.endsWith(`${join("public", "data")}`) ||
        dataDir.endsWith("public/data")
          ? resolve(dataDir, "../..")
          : dataDir.endsWith("data")
            ? resolve(dataDir, "..")
            : abs;
      return { root, dataDir, filerDir };
    }
  }

  throw new Error(
    `Kadoa dataset not found under ${abs} (expected public/data/filer/*.json). Set KADOA_DATA_DIR.`,
  );
}
