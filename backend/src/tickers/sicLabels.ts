/**
 * Map SEC SIC codes / descriptions to broad sector + detailed industry.
 */

import type { SectorIndustry } from "./naicsLabels.js";

const SIC_RANGES: Array<{
  lo: number;
  hi: number;
  sector: string;
  industry?: string;
}> = [
  { lo: 100, hi: 999, sector: "Materials", industry: "Agriculture" },
  { lo: 1000, hi: 1499, sector: "Materials", industry: "Mining" },
  { lo: 1311, hi: 1389, sector: "Energy", industry: "Oil & gas" },
  { lo: 2911, hi: 2999, sector: "Energy", industry: "Petroleum refining" },
  { lo: 4900, hi: 4911, sector: "Utilities", industry: "Electric utilities" },
  { lo: 4911, hi: 4911, sector: "Utilities", industry: "Electric utilities" },
  { lo: 4931, hi: 4932, sector: "Utilities", industry: "Electric & gas utilities" },
  { lo: 4922, hi: 4925, sector: "Energy", industry: "Natural gas" },
  { lo: 4941, hi: 4971, sector: "Utilities", industry: "Water & utilities" },
  { lo: 2800, hi: 2821, sector: "Materials", industry: "Chemicals" },
  { lo: 2833, hi: 2836, sector: "Health Care", industry: "Pharmaceuticals" },
  { lo: 3841, hi: 3851, sector: "Health Care", industry: "Medical devices" },
  { lo: 3570, hi: 3579, sector: "Technology", industry: "Computer hardware" },
  { lo: 3670, hi: 3679, sector: "Technology", industry: "Semiconductors" },
  { lo: 7370, hi: 7379, sector: "Technology", industry: "Software & IT services" },
  { lo: 3600, hi: 3699, sector: "Industrials", industry: "Electrical equipment" },
  { lo: 3620, hi: 3621, sector: "Energy", industry: "Fuel cells & power equipment" },
  { lo: 3510, hi: 3599, sector: "Industrials", industry: "Machinery" },
  { lo: 3711, hi: 3716, sector: "Consumer", industry: "Automobiles" },
  { lo: 3720, hi: 3728, sector: "Industrials", industry: "Aerospace" },
  { lo: 4512, hi: 4581, sector: "Industrials", industry: "Airlines" },
  { lo: 4812, hi: 4899, sector: "Communication", industry: "Telecom" },
  { lo: 4832, hi: 4841, sector: "Communication", industry: "Broadcasting" },
  { lo: 5000, hi: 5999, sector: "Consumer", industry: "Retail & wholesale" },
  { lo: 6000, hi: 6299, sector: "Financials", industry: "Banks & lending" },
  { lo: 6300, hi: 6411, sector: "Financials", industry: "Insurance" },
  { lo: 6500, hi: 6799, sector: "Real Estate", industry: "Real estate" },
  { lo: 7000, hi: 7999, sector: "Consumer", industry: "Services" },
  { lo: 8000, hi: 8099, sector: "Health Care", industry: "Health services" },
];

const KEYWORD_INDUSTRY: Array<[RegExp, SectorIndustry]> = [
  [/\bnuclear\b|\boklo\b|\bsmr\b|\bsmall\s*modular\s*reactor/i, { sector: "Energy", industry: "Nuclear energy" }],
  [/\bfuel\s*cell|\bbloom\s*energy/i, { sector: "Energy", industry: "Fuel cells" }],
  [/\bhydrogen\b/i, { sector: "Energy", industry: "Hydrogen energy" }],
  [/\bsolar\b|\bphotovolta/i, { sector: "Energy", industry: "Solar energy" }],
  [/\bwind\b.*\b(power|energy|turbine)/i, { sector: "Energy", industry: "Wind energy" }],
  [/\boil\b|\bgas\b|\bpetroleum\b|\bcrude\b/i, { sector: "Energy", industry: "Oil & gas" }],
  [/\butilit/i, { sector: "Utilities", industry: "Utilities" }],
  [/\bsemiconductor|\bchip\b|\bfab\b/i, { sector: "Technology", industry: "Semiconductors" }],
  [/\bsoftware|\bsaas\b|\bcloud\b/i, { sector: "Technology", industry: "Software" }],
  [/\bbiotech|\bpharma|\bdrug\b/i, { sector: "Health Care", industry: "Biotech & pharma" }],
  [/\bbank\b|\blending\b/i, { sector: "Financials", industry: "Banking" }],
  [/\binsurance\b/i, { sector: "Financials", industry: "Insurance" }],
  [/\breit\b|\breal\s*estate/i, { sector: "Real Estate", industry: "Real estate" }],
  [/\bairline|\baerospace|\bdefense\b/i, { sector: "Industrials", industry: "Aerospace & defense" }],
  [/\brestaurant|\bhotel\b|\bleisure\b/i, { sector: "Consumer", industry: "Restaurants & leisure" }],
  [/\bretai(l|ler)\b/i, { sector: "Consumer", industry: "Retail" }],
  [/\btelecom|\bwireless\b/i, { sector: "Communication", industry: "Telecom" }],
  [/\bmedia\b|\bstreaming\b|\bbroadcast/i, { sector: "Communication", industry: "Media" }],
];

export function labelsFromSic(
  sic: string | number | null | undefined,
  sicDescription?: string | null,
): SectorIndustry | null {
  const fromDesc = labelsFromText(sicDescription);
  if (fromDesc) return fromDesc;

  const n = Number(String(sic ?? "").replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;

  // Prefer more specific overlapping ranges by checking exact-ish matches first
  let best: (typeof SIC_RANGES)[number] | null = null;
  for (const row of SIC_RANGES) {
    if (n >= row.lo && n <= row.hi) {
      if (!best || row.hi - row.lo < best.hi - best.lo) best = row;
    }
  }
  if (!best) return null;
  return {
    sector: best.sector,
    industry: best.industry ?? best.sector,
  };
}

export function labelsFromText(
  text: string | null | undefined,
): SectorIndustry | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  for (const [re, labels] of KEYWORD_INDUSTRY) {
    if (re.test(raw)) return labels;
  }
  return null;
}
