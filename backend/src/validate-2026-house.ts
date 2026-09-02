/**
 * Validate pdfplumber House PTR parsing against ALL 2026 filings.
 * Requires 100% stock-transaction coverage before any earlier-year backfill.
 *
 * Usage:
 *   cd backend && npx tsx src/validate-2026-house.ts
 *   DEBUG_PTR_LIMIT=20 npx tsx src/validate-2026-house.ts   # smoke subset
 */
import axios from "axios";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseHousePdfWithPdfplumber } from "./house-pdfplumber.js";
import { ocrPdfBuffer, checkOcrMyPdfAvailable } from "./house-ocr.js";

type Filing = {
  member: string;
  filingDate: string;
  docId: string;
  year: number;
};

const YEAR = 2026;
const ZIP_URL = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${YEAR}FD.zip`;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; HedgepixHouseValidator/1.0; +local)",
  Accept: "application/zip, application/pdf, */*",
};

function normalizeFilingDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3]);
  return `${yyyy.toString().padStart(4, "0")}-${mm
    .toString()
    .padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
}

function memberName(m: {
  First?: string;
  Last?: string;
  Suffix?: string;
}): string {
  return [m.First, m.Last, m.Suffix].filter(Boolean).join(" ").trim();
}

async function load2026Filings(): Promise<Filing[]> {
  const res = await axios.get<ArrayBuffer>(ZIP_URL, {
    headers: HEADERS,
    responseType: "arraybuffer",
    timeout: 120_000,
  });
  const zip = new AdmZip(Buffer.from(res.data));
  const entry = zip
    .getEntries()
    .find((e) => e.entryName.toLowerCase().endsWith(`${YEAR}fd.xml`));
  if (!entry) throw new Error(`No ${YEAR}FD.xml in archive`);

  const xml = entry.getData().toString("utf-8");
  const parser = new XMLParser({ ignoreAttributes: false });
  const json = parser.parse(xml) as {
    FinancialDisclosure?: { Member?: unknown };
  };
  const raw = json.FinancialDisclosure?.Member ?? [];
  const members = Array.isArray(raw) ? raw : [raw];

  const out: Filing[] = [];
  for (const item of members) {
    const m = item as {
      FilingType?: string;
      First?: string;
      Last?: string;
      Suffix?: string;
      FilingDate?: string;
      DocID?: string | number;
    };
    if (m.FilingType !== "P") continue;
    const docId = String(m.DocID ?? "").trim();
    const filingDateRaw = String(m.FilingDate ?? "").trim();
    const filingDate = normalizeFilingDate(filingDateRaw);
    const name = memberName(m);
    if (!docId || !filingDate || !name) continue;
    if (!filingDate.startsWith("2026-")) continue;
    out.push({ member: name, filingDate, docId, year: YEAR });
  }
  return out;
}

async function downloadPdf(docId: string): Promise<Buffer> {
  const url = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${YEAR}/${docId}.pdf`;
  const res = await axios.get<ArrayBuffer>(url, {
    headers: HEADERS,
    responseType: "arraybuffer",
    timeout: 60_000,
  });
  return Buffer.from(res.data);
}

type FilingResult = {
  docId: string;
  member: string;
  expected: number;
  parsed: number;
  usedOcr: boolean;
  ok: boolean;
  error?: string;
};

async function validateFiling(
  filing: Filing,
  enableOcr: boolean,
): Promise<FilingResult> {
  const dir = join(tmpdir(), `house-2026-validate-${filing.docId}`);
  await mkdir(dir, { recursive: true });
  const pdfPath = join(dir, `${filing.docId}.pdf`);

  try {
    const pdf = await downloadPdf(filing.docId);
    await writeFile(pdfPath, pdf);

    let result = await parseHousePdfWithPdfplumber(pdfPath, {
      filingDate: filing.filingDate,
      docId: filing.docId,
    });
    let usedOcr = false;

    const incomplete =
      result.expected_stock_count > result.parsed_stock_count ||
      (!result.has_extractable_text && result.expected_stock_count === 0);

    if (incomplete && enableOcr) {
      usedOcr = true;
      const ocrPdf = await ocrPdfBuffer(pdf);
      const ocrPath = join(dir, `${filing.docId}.ocr.pdf`);
      await writeFile(ocrPath, ocrPdf);
      const second = await parseHousePdfWithPdfplumber(ocrPath, {
        filingDate: filing.filingDate,
        docId: filing.docId,
      });
      if (
        second.parsed_stock_count > result.parsed_stock_count ||
        (second.parsed_stock_count >= second.expected_stock_count &&
          second.expected_stock_count > 0)
      ) {
        result = second;
      }
    }

    const ok =
      result.expected_stock_count === result.parsed_stock_count &&
      result.error !== "parse_crash";

    return {
      docId: filing.docId,
      member: filing.member,
      expected: result.expected_stock_count,
      parsed: result.parsed_stock_count,
      usedOcr,
      ok,
      error: ok
        ? undefined
        : result.error ||
          `coverage ${result.parsed_stock_count}/${result.expected_stock_count}`,
    };
  } catch (err) {
    return {
      docId: filing.docId,
      member: filing.member,
      expected: -1,
      parsed: 0,
      usedOcr: false,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("VALIDATING 2026 HOUSE PTR FILINGS (pdfplumber + OCR fallback)");
  console.log("");

  const ocr = await checkOcrMyPdfAvailable();
  console.log(
    ocr.available
      ? `OCRmyPDF available (${ocr.version})`
      : "OCRmyPDF not available — scanned PDFs may fail",
  );

  const filings = await load2026Filings();
  const limit = process.env.DEBUG_PTR_LIMIT
    ? Number.parseInt(process.env.DEBUG_PTR_LIMIT, 10)
    : 0;
  const work = limit > 0 ? filings.slice(0, limit) : filings;
  console.log(`Filings to validate: ${work.length}${limit ? ` (limited)` : ""}`);
  console.log("");

  const results: FilingResult[] = [];
  for (let i = 0; i < work.length; i++) {
    const filing = work[i]!;
    const result = await validateFiling(filing, ocr.available);
    results.push(result);
    const mark = result.ok ? "OK" : "FAIL";
    console.log(
      `[${i + 1}/${work.length}] ${mark} ${filing.docId} ${filing.member} stock ${result.parsed}/${result.expected}${result.usedOcr ? " (OCR)" : ""}${result.error ? ` — ${result.error}` : ""}`,
    );
    await new Promise((r) => setTimeout(r, 200));
  }

  const failed = results.filter((r) => !r.ok);
  const expectedTotal = results.reduce(
    (sum, r) => sum + Math.max(r.expected, 0),
    0,
  );
  const parsedTotal = results.reduce((sum, r) => sum + Math.max(r.parsed, 0), 0);

  console.log("");
  console.log("========================================");
  console.log("2026 HOUSE VALIDATION SUMMARY");
  console.log("========================================");
  console.log(`Filings checked: ${results.length}`);
  console.log(`Filings fully parsed: ${results.length - failed.length}`);
  console.log(`Filings with missing stock rows: ${failed.length}`);
  console.log(`Stock transactions expected: ${expectedTotal}`);
  console.log(`Stock transactions parsed: ${parsedTotal}`);
  console.log(
    `Coverage: ${expectedTotal === 0 ? "n/a" : ((100 * parsedTotal) / expectedTotal).toFixed(2) + "%"}`,
  );

  if (failed.length > 0) {
    console.log("");
    console.log("FAILED DOCUMENT IDS:");
    for (const f of failed) {
      console.log(
        `  ${f.docId} | ${f.member} | ${f.parsed}/${f.expected} | ${f.error}`,
      );
    }
    console.log("");
    console.log("STOPPING — do not backfill earlier years until 2026 is 100%.");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("SUCCESS — 100% of identifiable 2026 stock transactions parsed.");
  console.log("Safe to continue historical backfill to earlier years.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
