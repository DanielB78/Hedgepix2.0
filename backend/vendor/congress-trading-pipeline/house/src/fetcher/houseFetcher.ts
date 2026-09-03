import axios, { AxiosError } from 'axios';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { format, subDays, parse as parseDate, isValid } from 'date-fns';
import type { FetchResult, HousePdfParseStats, RawTransaction } from '../types/index.js';
import { makeLogger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { withRetry } from '../utils/retry.js';
import { ocrPdfBuffer } from '../../../../../src/house-ocr.js';
import {
  parseHousePdfWithPdfplumber,
  type PdfPlumberTransaction,
} from '../../../../../src/house-pdfplumber.js';

const log = makeLogger('houseFetcher');

const TIMEOUT_MS = 60_000;
const PDF_DELAY_MS = 600;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'application/zip, application/pdf, text/xml, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function zipUrl(year: number): string {
  return `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.zip`;
}

function ptrPdfUrl(year: number, docId: string): string {
  return `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${docId}.pdf`;
}

// ─── XML index types ──────────────────────────────────────────────────────────

interface RawMember {
  Prefix?: string;
  Last?: string;
  First?: string;
  Suffix?: string;
  FilingType?: string;
  StateDst?: string;
  Year?: string | number;
  FilingDate?: string;
  DocID?: string | number;
}

interface FilingIndex {
  member: string;
  filingDate: string;       // YYYY-MM-DD
  filingDateRaw: string;    // M/D/YYYY as in XML
  docId: string;
  year: number;
}

function normalizeFilingDate(raw: string): string | null {
  for (const fmt of ['M/d/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']) {
    const parsed = parseDate(raw, fmt, new Date());
    if (isValid(parsed)) return format(parsed, 'yyyy-MM-dd');
  }
  return null;
}

function memberName(m: RawMember): string {
  return [m.First, m.Last, m.Suffix].filter(Boolean).join(' ').trim();
}

async function delay(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

// ─── Fetch + extract index ────────────────────────────────────────────────────

async function downloadZip(year: number): Promise<Buffer> {
  log.info(`Downloading ${year}FD.zip`);
  const res = await axios.get<ArrayBuffer>(zipUrl(year), {
    headers: HEADERS,
    timeout: TIMEOUT_MS,
    responseType: 'arraybuffer',
  });
  return Buffer.from(res.data);
}

function extractIndexXml(zipBuf: Buffer, year: number): string {
  const zip = new AdmZip(zipBuf);
  const xmlEntry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(`${year}fd.xml`));
  if (!xmlEntry) {
    throw new Error(`No ${year}FD.xml inside ${year}FD.zip`);
  }
  return xmlEntry.getData().toString('utf-8');
}

function parseIndex(xml: string, year: number, fromDate: string, toDate: string): FilingIndex[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const json = parser.parse(xml) as { FinancialDisclosure?: { Member?: RawMember | RawMember[] } };
  const rawMembers = json.FinancialDisclosure?.Member ?? [];
  const members = Array.isArray(rawMembers) ? rawMembers : [rawMembers];

  const out: FilingIndex[] = [];
  for (const m of members) {
    if (m.FilingType !== 'P') continue; // only Periodic Transaction Reports
    const name = memberName(m);
    const docId = String(m.DocID ?? '').trim();
    const filingDateRaw = String(m.FilingDate ?? '').trim();
    if (!name || !docId || !filingDateRaw) continue;

    const filingDate = normalizeFilingDate(filingDateRaw);
    if (!filingDate) continue;

    if (filingDate < fromDate || filingDate > toDate) continue;

    out.push({ member: name, filingDate, filingDateRaw, docId, year });
  }
  return out;
}

// ─── Per-PTR PDF fetch + parse ────────────────────────────────────────────────

async function fetchPdfBuffer(year: number, docId: string): Promise<Buffer> {
  const res = await axios.get<ArrayBuffer>(ptrPdfUrl(year, docId), {
    headers: HEADERS,
    timeout: TIMEOUT_MS,
    responseType: 'arraybuffer',
  });
  return Buffer.from(res.data);
}

function emptyHousePdfStats(): HousePdfParseStats {
  return {
    normalParsed: 0,
    ocrAttempted: 0,
    ocrSuccess: 0,
    stillUnparseable: 0,
    lowQualitySkipped: 0,
    incompleteCoverage: 0,
  };
}

function mergeHousePdfStats(
  a: HousePdfParseStats,
  b: HousePdfParseStats,
): HousePdfParseStats {
  return {
    normalParsed: a.normalParsed + b.normalParsed,
    ocrAttempted: a.ocrAttempted + b.ocrAttempted,
    ocrSuccess: a.ocrSuccess + b.ocrSuccess,
    stillUnparseable: a.stillUnparseable + b.stillUnparseable,
    lowQualitySkipped: a.lowQualitySkipped + b.lowQualitySkipped,
    incompleteCoverage: a.incompleteCoverage + b.incompleteCoverage,
  };
}

function toRawTransactions(
  rows: PdfPlumberTransaction[],
  filing: FilingIndex,
): RawTransaction[] {
  return rows.map((row, index) => ({
    politician: row.politician || filing.member,
    transaction_date: row.transaction_date,
    filing_date: row.filing_date || filing.filingDate,
    ticker: row.ticker ?? '',
    asset_name: row.asset_name,
    asset_type: row.asset_type,
    type: row.type,
    amount: row.amount,
    owner: row.owner,
    source_id: row.source_id || `house_${filing.docId}_${index}`,
    raw_json: {
      ...(row.raw_json ?? {}),
      source: 'house',
      doc_id: filing.docId,
      member: filing.member,
    },
  }));
}

type ParseHousePdfOptions = {
  enableOcrFallback: boolean;
  ocrFailedKeys: Set<string>;
  stats: HousePdfParseStats;
};

async function runPdfplumberOnBuffer(
  pdf: Buffer,
  filing: FilingIndex,
): Promise<{
  rows: RawTransaction[];
  expectedStock: number;
  parsedStock: number;
  hasText: boolean;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'house-pdfplumber-'));
  const pdfPath = join(dir, `${filing.docId}.pdf`);
  try {
    await writeFile(pdfPath, pdf);
    const result = await parseHousePdfWithPdfplumber(pdfPath, {
      filingDate: filing.filingDate,
      docId: filing.docId,
    });
    return {
      rows: toRawTransactions(result.transactions ?? [], filing),
      expectedStock: result.expected_stock_count ?? 0,
      parsedStock: result.parsed_stock_count ?? 0,
      hasText: result.has_extractable_text !== false,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * pdfplumber first; OCRmyPDF only when there is no usable extractable text /
 * incomplete stock coverage; then pdfplumber again on the OCR'd PDF.
 *
 * Low-quality scanned PDFs (no extractable text, typically pre-2018 image
 * forms) are skipped after a failed OCR attempt — or without OCR when the
 * filing year is below HOUSE_OCR_MIN_YEAR (default 2018).
 */
async function parseHousePdf(
  pdf: Buffer,
  filing: FilingIndex,
  options: ParseHousePdfOptions,
): Promise<RawTransaction[]> {
  const first = await runPdfplumberOnBuffer(pdf, filing);
  const ocrMinYear = Number.parseInt(process.env['HOUSE_OCR_MIN_YEAR'] ?? '2018', 10);

  // Usable structured data: either we parsed all expected stock rows, or there
  // were no stock rows to parse and pdfplumber could read the PDF.
  if (first.hasText && first.parsedStock >= first.expectedStock) {
    options.stats.normalParsed += 1;
    return first.rows;
  }

  if (first.hasText && first.expectedStock > 0 && first.parsedStock < first.expectedStock) {
    options.stats.incompleteCoverage += 1;
    log.warn(
      `House PTR ${filing.year}/${filing.docId}: pdfplumber stock coverage ${first.parsedStock}/${first.expectedStock}`,
    );
  }

  if (!options.enableOcrFallback) {
    if (first.rows.length > 0) {
      options.stats.normalParsed += 1;
      return first.rows;
    }
    if (!first.hasText) {
      options.stats.lowQualitySkipped += 1;
    } else {
      options.stats.stillUnparseable += 1;
    }
    return first.rows;
  }

  const cacheKey = `${filing.year}:${filing.docId}`;
  if (options.ocrFailedKeys.has(cacheKey)) {
    if (first.rows.length > 0) options.stats.normalParsed += 1;
    else if (!first.hasText) options.stats.lowQualitySkipped += 1;
    else options.stats.stillUnparseable += 1;
    return first.rows;
  }

  // Image-only PDFs before HOUSE_OCR_MIN_YEAR are almost always low-quality
  // scans of old forms; OCR yields garbage and wastes minutes per filing.
  if (!first.hasText && filing.year < ocrMinYear) {
    options.stats.lowQualitySkipped += 1;
    log.info(
      `House PTR ${filing.year}/${filing.docId} (${filing.member}): skipping OCR (image-only, year < ${ocrMinYear})`,
    );
    return first.rows;
  }

  // Text exists with zero expected stock rows — already handled above as OK.
  // Only OCR when coverage is incomplete or there is no extractable text.
  if (first.hasText && first.parsedStock >= first.expectedStock) {
    options.stats.normalParsed += 1;
    return first.rows;
  }

  options.stats.ocrAttempted += 1;
  try {
    const ocrPdf = await ocrPdfBuffer(pdf);
    const second = await runPdfplumberOnBuffer(ocrPdf, filing);
    if (second.parsedStock >= second.expectedStock && second.parsedStock > 0) {
      options.stats.ocrSuccess += 1;
      return second.rows;
    }
    if (second.rows.length > first.rows.length) {
      options.stats.ocrSuccess += 1;
      return second.rows;
    }
    if (first.rows.length > 0) {
      options.stats.normalParsed += 1;
      return first.rows;
    }
    // OCR ran but still no usable transactions — treat no-text inputs as
    // low-quality scans to ignore; keep text+incomplete as investigate targets.
    if (!first.hasText && !second.hasText) {
      options.stats.lowQualitySkipped += 1;
    } else if (!first.hasText && second.hasText && second.expectedStock === 0) {
      options.stats.lowQualitySkipped += 1;
    } else {
      options.stats.stillUnparseable += 1;
      if (second.expectedStock > second.parsedStock) {
        options.stats.incompleteCoverage += 1;
      }
    }
    options.ocrFailedKeys.add(cacheKey);
    log.warn(
      `House PTR ${filing.year}/${filing.docId} (${filing.member}): OCR+pdfplumber found no complete stock rows`,
    );
    return second.rows;
  } catch (err) {
    if (first.rows.length > 0) {
      options.stats.normalParsed += 1;
      return first.rows;
    }
    if (!first.hasText) options.stats.lowQualitySkipped += 1;
    else options.stats.stillUnparseable += 1;
    options.ocrFailedKeys.add(cacheKey);
    log.warn(
      `House PTR ${filing.year}/${filing.docId} (${filing.member}) OCR failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

function isoToday(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function isoDefaultStart(): string {
  return format(subDays(new Date(), config.FETCH_DAYS_BACK), 'yyyy-MM-dd');
}

/** Calendar years spanned by an inclusive ISO date range. */
export function yearsForDateRange(fromDate: string, toDate: string): number[] {
  const startYear = Number.parseInt(fromDate.slice(0, 4), 10);
  const endYear = Number.parseInt(toDate.slice(0, 4), 10);
  const years: number[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }
  return years;
}

export type FetchAllHouseOptions = {
  /** Annual House archives to download (defaults to the current calendar year). */
  years?: number[];
  /** Retry scanned PDFs with OCRmyPDF when normal text extraction finds no transactions. */
  enableOcrFallback?: boolean;
};

async function fetchHouseForYear(
  year: number,
  fromDate: string,
  toDate: string,
  options: FetchAllHouseOptions = {},
): Promise<FetchResult> {
  log.info(`fetchHouseForYear year=${year} from=${fromDate} to=${toDate}`);

  let filings: FilingIndex[];
  try {
    const zipBuf = await withRetry(() => downloadZip(year), 3, 1000);
    const xml = extractIndexXml(zipBuf, year);
    filings = parseIndex(xml, year, fromDate, toDate);
    log.info(`House ${year} index: ${filings.length} PTR filings in window`);
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) {
      log.warn(`House archive ${year}FD.zip not found — skipping`);
      return { success: true, records: [] };
    }
    const message = err instanceof AxiosError ? err.message : String(err);
    log.error(`House ${year} index fetch failed: ${message}`);
    return { success: false, records: [], error: `House ${year} index: ${message}` };
  }

  if (filings.length === 0) {
    return { success: true, records: [] };
  }

  const records: RawTransaction[] = [];
  let errors = 0;
  const pdfStats = emptyHousePdfStats();
  const ocrFailedKeys = new Set<string>();
  const parseOptions: ParseHousePdfOptions = {
    enableOcrFallback: options.enableOcrFallback === true,
    ocrFailedKeys,
    stats: pdfStats,
  };

  const debugLimit = process.env['DEBUG_PTR_LIMIT'] ? parseInt(process.env['DEBUG_PTR_LIMIT'], 10) : 0;
  const filingsToFetch = debugLimit > 0 ? filings.slice(0, debugLimit) : filings;
  if (debugLimit > 0) {
    log.warn(`DEBUG_PTR_LIMIT=${debugLimit} — fetching subset only`);
  }

  for (let i = 0; i < filingsToFetch.length; i++) {
    const f = filingsToFetch[i]!;
    try {
      const pdf = await withRetry(() => fetchPdfBuffer(f.year, f.docId), 2, 500);
      const parsed = await parseHousePdf(pdf, f, parseOptions);
      records.push(...parsed);
    } catch (err) {
      errors++;
      log.warn(`House PTR ${f.docId} (${f.member}) failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if ((i + 1) % 25 === 0 || i === filingsToFetch.length - 1) {
      log.info(
        `House ${year} progress: ${i + 1}/${filingsToFetch.length} PTRs → ${records.length} txs (${pdfStats.stillUnparseable} unparseable, ${pdfStats.lowQualitySkipped} low-quality, ${pdfStats.ocrSuccess} OCR ok)`,
      );
    }
    if (i < filingsToFetch.length - 1) await delay(PDF_DELAY_MS);
  }

  log.info(
    `fetchHouseForYear ${year} complete: ${filingsToFetch.length} filings → ${records.length} txs, ${pdfStats.stillUnparseable} unparseable, ${pdfStats.ocrAttempted} OCR attempted, ${errors} fetch errors`,
  );

  const partial = errors > filingsToFetch.length / 4;
  return {
    success: !partial,
    records,
    housePdfStats: pdfStats,
    error: partial ? `${errors}/${filings.length} House ${year} PDF fetches failed` : undefined,
  };
}

export async function fetchAllHouse(
  fromDate: string = isoDefaultStart(),
  toDate: string = isoToday(),
  options: FetchAllHouseOptions = {},
): Promise<FetchResult> {
  const years = options.years ?? [new Date().getFullYear()];
  log.info(`fetchAllHouse from=${fromDate} to=${toDate} years=${years.join(',')}`);

  if (years.length === 1) {
    return fetchHouseForYear(years[0]!, fromDate, toDate, options);
  }

  const records: RawTransaction[] = [];
  const errors: string[] = [];
  let housePdfStats = emptyHousePdfStats();
  let hadHardFailure = false;

  for (const year of years) {
    const result = await fetchHouseForYear(year, fromDate, toDate, options);
    records.push(...result.records);
    if (result.housePdfStats) {
      housePdfStats = mergeHousePdfStats(housePdfStats, result.housePdfStats);
    }
    if (result.error) errors.push(result.error);
    if (!result.success && result.records.length === 0) {
      hadHardFailure = true;
    }
  }

  const partial = errors.length > 0;
  return {
    success: !hadHardFailure,
    records,
    housePdfStats,
    error: partial ? errors.join(' | ') : undefined,
  };
}
