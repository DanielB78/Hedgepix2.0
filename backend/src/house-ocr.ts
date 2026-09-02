import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type OcrCommand = {
  cmd: string;
  prefixArgs: string[];
  label: string;
};

const OCR_CANDIDATES: OcrCommand[] = [
  { cmd: "py", prefixArgs: ["-m", "ocrmypdf"], label: "py -m ocrmypdf" },
  { cmd: "python3", prefixArgs: ["-m", "ocrmypdf"], label: "python3 -m ocrmypdf" },
  { cmd: "python", prefixArgs: ["-m", "ocrmypdf"], label: "python -m ocrmypdf" },
  { cmd: "ocrmypdf", prefixArgs: [], label: "ocrmypdf" },
];

export type OcrAvailability = {
  available: boolean;
  command: OcrCommand | null;
  version: string | null;
};

let cachedAvailability: OcrAvailability | null = null;

function runCommand(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(" ")}`));
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
      resolve({ code, stdout, stderr });
    });
  });
}

export async function checkOcrMyPdfAvailable(
  force = false,
): Promise<OcrAvailability> {
  if (cachedAvailability && !force) return cachedAvailability;

  for (const candidate of OCR_CANDIDATES) {
    try {
      const result = await runCommand(
        candidate.cmd,
        [...candidate.prefixArgs, "--version"],
        15_000,
      );
      if (result.code === 0) {
        const version = (result.stdout || result.stderr).trim();
        cachedAvailability = {
          available: true,
          command: candidate,
          version: version || candidate.label,
        };
        return cachedAvailability;
      }
    } catch {
      // Try the next candidate command.
    }
  }

  cachedAvailability = {
    available: false,
    command: null,
    version: null,
  };
  return cachedAvailability;
}

export function printOcrSetupInstructions(): void {
  console.log("");
  console.log("OCRmyPDF is not installed or not available on PATH.");
  console.log("Historical scanned House PDFs may not be parseable.");
  console.log("");
  console.log("Required local dependencies:");
  console.log("- Python");
  console.log("- Tesseract");
  console.log("- Ghostscript");
  console.log("- OCRmyPDF");
  console.log("");
  console.log("Windows setup:");
  console.log("  winget install -e --id Python.Python.3.12");
  console.log("  winget install -e --id UB-Mannheim.TesseractOCR");
  console.log("  Install 64-bit Ghostscript from https://ghostscript.com/releases/gsdnld.html");
  console.log("  py -m pip install ocrmypdf");
  console.log("");
  console.log("Verify:");
  console.log("  py -m ocrmypdf --version");
  console.log("  tesseract --version");
  console.log("");
}

/** Run OCRmyPDF on a PDF buffer and return the OCR'd PDF bytes. */
export async function ocrPdfBuffer(
  pdf: Buffer,
  timeoutMs = 180_000,
): Promise<Buffer> {
  const availability = await checkOcrMyPdfAvailable();
  if (!availability.available || !availability.command) {
    throw new Error("OCRmyPDF is not available");
  }

  const { cmd, prefixArgs } = availability.command;
  const tmpDir = await mkdtemp(join(tmpdir(), "house-ocr-"));
  const inputPath = join(tmpDir, "input.pdf");
  const outputPath = join(tmpDir, "output.pdf");

  try {
    await writeFile(inputPath, pdf);
    const result = await runCommand(
      cmd,
      [...prefixArgs, "--mode", "skip", inputPath, outputPath],
      timeoutMs,
    );
    if (result.code !== 0) {
      throw new Error(
        result.stderr.trim() || `OCRmyPDF exited with code ${result.code}`,
      );
    }
    return await readFile(outputPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
