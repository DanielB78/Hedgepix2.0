import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PdfPlumberResult, PdfPlumberTransaction } from "./house-pdfplumber.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, "../scripts/house_ptr_paddleocr.py");

const VENV_PYTHON_CANDIDATES = [
  process.env["HOUSE_PADDLE_PYTHON"],
  resolve(__dirname, "../../.venv-paddle/bin/python"),
  resolve(__dirname, "../../.venv-paddle/bin/python3"),
  "/workspace/.venv-paddle/bin/python",
].filter(Boolean) as string[];

export type PaddleOcrTransaction = PdfPlumberTransaction;
export type PaddleOcrResult = PdfPlumberResult & {
  parser?: string;
  paddle_stats?: Record<string, number>;
  page_count?: number;
};

let cachedPython: string | null | undefined;

function resolvePython(): string | null {
  if (cachedPython !== undefined) return cachedPython;
  for (const candidate of VENV_PYTHON_CANDIDATES) {
    try {
      accessSync(candidate, constants.X_OK);
      cachedPython = candidate;
      return cachedPython;
    } catch {
      // try next
    }
  }
  cachedPython = null;
  return null;
}

export function isPaddleOcrAvailable(): boolean {
  return resolvePython() !== null;
}

function runPython(
  pythonBin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(pythonBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Keep paddle quieter in logs
        FLAGS_use_mkldnn: process.env["FLAGS_use_mkldnn"] ?? "0",
      },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`PaddleOCR timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

/** Extract the last JSON object from mixed paddle logging + JSON stdout. */
function extractJsonPayload(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return "";
  // Prefer last line that looks like JSON object
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (line.startsWith("{") && line.endsWith("}")) return line;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export async function parseHousePdfWithPaddleOcr(
  pdfPath: string,
  opts: {
    filingDate?: string;
    docId?: string;
    member?: string;
    timeoutMs?: number;
  } = {},
): Promise<PaddleOcrResult> {
  const pythonBin = resolvePython();
  if (!pythonBin) {
    throw new Error(
      "PaddleOCR Python venv not found. Expected .venv-paddle/bin/python or HOUSE_PADDLE_PYTHON.",
    );
  }

  const args = [SCRIPT_PATH, pdfPath];
  if (opts.filingDate) args.push(opts.filingDate);
  else args.push("");
  if (opts.docId) args.push(opts.docId);
  else args.push("");
  if (opts.member) args.push(opts.member);

  const result = await runPython(pythonBin, args, opts.timeoutMs ?? 600_000);
  const payload = extractJsonPayload(result.stdout);
  if (!payload) {
    throw new Error(
      result.stderr.trim() || `PaddleOCR exited with code ${result.code} and empty stdout`,
    );
  }

  try {
    return JSON.parse(payload) as PaddleOcrResult;
  } catch (err) {
    throw new Error(
      `Invalid PaddleOCR JSON: ${err instanceof Error ? err.message : String(err)} | stderr=${result.stderr.slice(0, 400)}`,
    );
  }
}
