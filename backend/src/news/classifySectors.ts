import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Root of the Python package parent (`backend/ml`). */
export function sectorClassifyMlRoot(): string {
  return resolve(__dirname, "../../ml");
}

export type NaicsSectorMatch = {
  code: string;
  name: string;
  score: number;
};

export type SectorLabel = {
  /** Best match (rank 1) — kept for compatibility. */
  sector: string;
  sector_score: number;
  sector_code: string;
  /** Top 3 NAICS matches, best first. */
  sectors: NaicsSectorMatch[];
};

export type SectorClassifyStats = {
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  labeled: number;
  error: string | null;
};

function resolvePythonBin(mlRoot: string): string {
  const venvUnix = resolve(mlRoot, ".venv/bin/python");
  const venvWin = resolve(mlRoot, ".venv/Scripts/python.exe");
  if (existsSync(venvUnix)) return venvUnix;
  if (existsSync(venvWin)) return venvWin;
  return process.env.SECTOR_CLASSIFY_PYTHON?.trim() || "python3";
}

function parseMatch(raw: unknown): NaicsSectorMatch | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const code = typeof row.code === "string" ? row.code.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const score =
    typeof row.score === "number" && Number.isFinite(row.score)
      ? row.score
      : null;
  if (!code || !name || score == null) return null;
  return { code, name, score };
}

/**
 * Soft-fail local BGE-small NAICS labeling (top 3).
 * Expects `backend/ml` on PYTHONPATH with sector_classify installed.
 */
export async function classifyNewsSectors(
  articles: Array<{ source_hash: string; title: string }>,
): Promise<{
  byHash: Map<string, SectorLabel>;
  stats: SectorClassifyStats;
}> {
  const byHash = new Map<string, SectorLabel>();
  if (articles.length === 0) {
    return {
      byHash,
      stats: { status: "SKIPPED", labeled: 0, error: null },
    };
  }

  const mlRoot = sectorClassifyMlRoot();
  const pkg = resolve(mlRoot, "sector_classify");
  if (!existsSync(pkg)) {
    return {
      byHash,
      stats: {
        status: "SKIPPED",
        labeled: 0,
        error: `Missing sector_classify package at ${pkg}`,
      },
    };
  }

  const payload = articles.map((a) => ({
    id: a.source_hash,
    title: a.title,
  }));

  try {
    const raw = await runClassifyCli(mlRoot, JSON.stringify(payload));
    const parsed = JSON.parse(raw) as Array<{
      id?: string;
      sector?: string;
      sector_code?: string;
      sector_score?: number;
      sectors?: unknown[];
    }>;
    if (!Array.isArray(parsed)) {
      return {
        byHash,
        stats: {
          status: "FAILED",
          labeled: 0,
          error: "Classifier returned non-array JSON",
        },
      };
    }
    for (const row of parsed) {
      const id = typeof row.id === "string" ? row.id : "";
      const matches = Array.isArray(row.sectors)
        ? row.sectors
            .map(parseMatch)
            .filter((m): m is NaicsSectorMatch => m != null)
            .slice(0, 3)
        : [];

      let sector =
        typeof row.sector === "string" ? row.sector.trim() : "";
      let sectorCode =
        typeof row.sector_code === "string" ? row.sector_code.trim() : "";
      let score =
        typeof row.sector_score === "number" && Number.isFinite(row.sector_score)
          ? row.sector_score
          : null;

      if (matches.length > 0) {
        sector = matches[0].name;
        sectorCode = matches[0].code;
        score = matches[0].score;
      }

      if (!id || !sector || score == null || matches.length === 0) continue;
      byHash.set(id, {
        sector,
        sector_code: sectorCode,
        sector_score: score,
        sectors: matches,
      });
    }
    return {
      byHash,
      stats: {
        status: "SUCCESS",
        labeled: byHash.size,
        error: null,
      },
    };
  } catch (err) {
    return {
      byHash,
      stats: {
        status: "FAILED",
        labeled: 0,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function runClassifyCli(mlRoot: string, stdinPayload: string): Promise<string> {
  const python = resolvePythonBin(mlRoot);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      python,
      ["-m", "sector_classify.cli", "classify"],
      {
        cwd: mlRoot,
        env: {
          ...process.env,
          PYTHONPATH: [mlRoot, process.env.PYTHONPATH ?? ""]
            .filter(Boolean)
            .join(":"),
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Sector classify timed out after 180s"));
    }, 180_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `sector_classify exited ${code}: ${(stderr || stdout).slice(0, 400)}`,
          ),
        );
        return;
      }
      resolvePromise(stdout.trim());
    });

    child.stdin.write(stdinPayload);
    child.stdin.end();
  });
}
