import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { isCeoOfficerTitle, isPublicStockSecurityTitle } from "./ceoFilter.js";
import type { CeoStockPurchase } from "./types.js";

export type TsvRow = Record<string, string>;

/** Parse SEC DD-MON-YYYY (or ISO) into YYYY-MM-DD. */
export function parseSecDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
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

export function parseNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const t = String(value).trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function normalizeTicker(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.trim().toUpperCase();
  if (!t || t === "NONE" || t === "N/A" || t === "NA" || t === "--" || t === "NULL") {
    return null;
  }
  // Allow Class share classes like BRK.B
  if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(t)) return null;
  return t;
}

export function filingUrlFor(
  issuerCik: string | null,
  accessionNumber: string,
): string | null {
  if (!issuerCik || !accessionNumber) return null;
  const cikNum = String(issuerCik).replace(/^0+/, "") || "0";
  const acc = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${accessionNumber}-index.html`;
}

export function sourceIdFor(
  accessionNumber: string,
  nonderivTransSk: string,
  reportingOwnerCik: string | null,
): string {
  const basis = `${accessionNumber}|${nonderivTransSk}|${reportingOwnerCik ?? ""}`;
  return `sec4:${createHash("sha256").update(basis).digest("hex")}`;
}

async function readTsv(path: string): Promise<{ headers: string[]; rows: TsvRow[] }> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let headers: string[] | null = null;
  const rows: TsvRow[] = [];
  for await (const line of rl) {
    if (!line) continue;
    const cols = line.split("\t");
    if (!headers) {
      headers = cols.map((h) => h.replace(/^\uFEFF/, "").trim());
      continue;
    }
    const row: TsvRow = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]!] = cols[i] ?? "";
    }
    rows.push(row);
  }
  return { headers: headers ?? [], rows };
}

export type ExtractStats = {
  submissions: number;
  owners: number;
  transactions: number;
  form4: number;
  codeP: number;
  codeS: number;
  ceoHits: number;
  kept: number;
  skippedNoTicker: number;
  skippedNonStock: number;
  skippedNotCeo: number;
};

/**
 * Join SUBMISSION + REPORTINGOWNER + NONDERIV_TRANS for one unzipped quarter.
 */
export async function extractCeoPurchasesFromDir(
  dir: string,
  quarter: string,
): Promise<{ purchases: CeoStockPurchase[]; stats: ExtractStats }> {
  const path = await import("node:path");
  const submissionPath = path.join(dir, "SUBMISSION.tsv");
  const ownerPath = path.join(dir, "REPORTINGOWNER.tsv");
  const transPath = path.join(dir, "NONDERIV_TRANS.tsv");

  const [subFile, ownerFile, transFile] = await Promise.all([
    readTsv(submissionPath),
    readTsv(ownerPath),
    readTsv(transPath),
  ]);

  const submissions = new Map<string, TsvRow>();
  for (const row of subFile.rows) {
    submissions.set(row.ACCESSION_NUMBER ?? "", row);
  }

  const ownersByAcc = new Map<string, TsvRow[]>();
  for (const row of ownerFile.rows) {
    const acc = row.ACCESSION_NUMBER ?? "";
    const list = ownersByAcc.get(acc);
    if (list) list.push(row);
    else ownersByAcc.set(acc, [row]);
  }

  const stats: ExtractStats = {
    submissions: subFile.rows.length,
    owners: ownerFile.rows.length,
    transactions: transFile.rows.length,
    form4: 0,
    codeP: 0,
    codeS: 0,
    ceoHits: 0,
    kept: 0,
    skippedNoTicker: 0,
    skippedNonStock: 0,
    skippedNotCeo: 0,
  };

  const purchases: CeoStockPurchase[] = [];
  const seen = new Set<string>();

  for (const tx of transFile.rows) {
    const code = (tx.TRANS_CODE ?? "").trim().toUpperCase();
    if (code !== "P" && code !== "S") continue;
    if (code === "P") stats.codeP += 1;
    else stats.codeS += 1;

    const ad = (tx.TRANS_ACQUIRED_DISP_CD ?? "").trim().toUpperCase();
    // Purchases should be acquired (A); sales should be disposed (D).
    if (code === "P" && ad && ad !== "A") continue;
    if (code === "S" && ad && ad !== "D") continue;

    const acc = tx.ACCESSION_NUMBER ?? "";
    const sub = submissions.get(acc);
    if (!sub) continue;

    const doc = (sub.DOCUMENT_TYPE ?? "").trim().toUpperCase();
    if (doc !== "4") continue;
    stats.form4 += 1;

    const owners = (ownersByAcc.get(acc) ?? []).filter((o) =>
      isCeoOfficerTitle(o.RPTOWNER_TITLE, o.RPTOWNER_RELATIONSHIP),
    );
    if (owners.length === 0) {
      stats.skippedNotCeo += 1;
      continue;
    }
    stats.ceoHits += 1;

    const securityTitle = tx.SECURITY_TITLE ?? "";
    if (!isPublicStockSecurityTitle(securityTitle)) {
      stats.skippedNonStock += 1;
      continue;
    }

    const ticker = normalizeTicker(sub.ISSUERTRADINGSYMBOL);
    if (!ticker) {
      stats.skippedNoTicker += 1;
      continue;
    }

    // Prefer the first CEO reporting owner on the filing.
    const owner = owners[0]!;
    const nonderivSk = String(tx.NONDERIV_TRANS_SK ?? "").trim();
    if (!nonderivSk) continue;

    const reportingOwnerCik = (owner.RPTOWNERCIK ?? "").trim() || null;
    const issuerCik = (sub.ISSUERCIK ?? "").trim() || null;
    const sourceId = sourceIdFor(acc, nonderivSk, reportingOwnerCik);
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    purchases.push({
      sourceId,
      accessionNumber: acc,
      nonderivTransSk: nonderivSk,
      reportingOwnerCik,
      issuerCik,
      ceoName: (owner.RPTOWNERNAME ?? "").trim() || "Unknown",
      officerTitle: (owner.RPTOWNER_TITLE ?? "").trim() || null,
      issuerName: (sub.ISSUERNAME ?? "").trim() || null,
      ticker,
      securityTitle: securityTitle.trim() || null,
      transactionDate: parseSecDate(tx.TRANS_DATE),
      filingDate: parseSecDate(sub.FILING_DATE),
      sharesPurchased: parseNumber(tx.TRANS_SHARES),
      pricePerShare: parseNumber(tx.TRANS_PRICEPERSHARE),
      sharesOwnedAfter: parseNumber(tx.SHRS_OWND_FOLWNG_TRANS),
      ownershipType: (tx.DIRECT_INDIRECT_OWNERSHIP ?? "").trim() || null,
      filingUrl: filingUrlFor(issuerCik, acc),
      formType: "4",
      quarter,
      transactionCode: code as "P" | "S",
      rawSource: {
        accession_number: acc,
        nonderiv_trans_sk: nonderivSk,
        document_type: doc,
        trans_code: code,
        security_title: securityTitle,
        officer_title: owner.RPTOWNER_TITLE ?? null,
        relationship: owner.RPTOWNER_RELATIONSHIP ?? null,
      },
    });
    stats.kept += 1;
  }

  return { purchases, stats };
}
