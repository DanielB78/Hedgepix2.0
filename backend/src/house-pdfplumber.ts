import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, "../scripts/house_ptr_pdfplumber.py");

export type PdfPlumberTransaction = {
  politician: string;
  transaction_date: string;
  filing_date: string;
  ticker: string | null;
  asset_name: string;
  asset_type: string;
  asset_type_code?: string;
  type: string;
  amount: string;
  amount_min?: number;
  amount_max?: number | null;
  owner: string;
  source_id: string;
  raw_json?: Record<string, unknown>;
};

export type PdfPlumberResult = {
  ok: boolean;
  member: string;
  doc_id: string;
  transactions: PdfPlumberTransaction[];
  expected_stock_count: number;
  parsed_stock_count: number;
  has_extractable_text: boolean;
  error: string | null;
};

function runPython(
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`pdfplumber timed out after ${timeoutMs}ms`));
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

export async function parseHousePdfWithPdfplumber(
  pdfPath: string,
  opts: { filingDate?: string; docId?: string; timeoutMs?: number } = {},
): Promise<PdfPlumberResult> {
  const args = [SCRIPT_PATH, pdfPath];
  if (opts.filingDate) args.push(opts.filingDate);
  if (opts.docId) args.push(opts.docId);

  const result = await runPython(args, opts.timeoutMs ?? 60_000);
  if (result.code !== 0 && !result.stdout.trim()) {
    throw new Error(
      result.stderr.trim() || `pdfplumber exited with code ${result.code}`,
    );
  }

  try {
    return JSON.parse(result.stdout) as PdfPlumberResult;
  } catch (err) {
    throw new Error(
      `Invalid pdfplumber JSON: ${err instanceof Error ? err.message : String(err)} | stderr=${result.stderr.slice(0, 300)}`,
    );
  }
}
