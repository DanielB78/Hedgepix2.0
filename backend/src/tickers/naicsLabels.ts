/**
 * Map NAICS codes (2–5 digit) to broad sector + detailed industry labels.
 * Used when seeding from the S&P 500 NAICS spreadsheet map.
 */

export type SectorIndustry = {
  sector: string;
  industry: string;
};

const TWO_DIGIT: Record<string, string> = {
  "11": "Materials",
  "21": "Energy",
  "22": "Utilities",
  "23": "Industrials",
  "31": "Consumer",
  "32": "Materials",
  "33": "Industrials",
  "42": "Consumer",
  "44": "Consumer",
  "45": "Consumer",
  "48": "Industrials",
  "49": "Industrials",
  "51": "Communication",
  "52": "Financials",
  "53": "Real Estate",
  "54": "Technology",
  "55": "Financials",
  "56": "Industrials",
  "61": "Consumer",
  "62": "Health Care",
  "71": "Consumer",
  "72": "Consumer",
  "81": "Industrials",
  "92": "Financials",
};

/** More specific industry labels keyed by longest matching NAICS prefix. */
const INDUSTRY_PREFIXES: Array<[string, string]> = [
  ["221113", "Nuclear energy"],
  ["22111", "Electric power generation"],
  ["22112", "Electric power transmission"],
  ["22121", "Natural gas distribution"],
  ["21112", "Oil & gas extraction"],
  ["21113", "Natural gas extraction"],
  ["21311", "Oil & gas support"],
  ["32411", "Petroleum refining"],
  ["4861", "Pipeline transport"],
  ["33591", "Battery & fuel cells"],
  ["335999", "Fuel cells & energy storage"],
  ["33361", "Turbines & power equipment"],
  ["33441", "Semiconductors"],
  ["334111", "Computer hardware"],
  ["51121", "Software"],
  ["51321", "Software publishers"],
  ["51821", "Cloud & data processing"],
  ["54151", "IT services"],
  ["52211", "Commercial banking"],
  ["52311", "Investment banking"],
  ["5239", "Investment advice & funds"],
  ["5241", "Insurance carriers"],
  ["5311", "Real estate lessors"],
  ["5312", "Real estate agents"],
  ["6211", "Ambulatory health care"],
  ["6221", "Hospitals"],
  ["3254", "Pharmaceuticals"],
  ["3391", "Medical devices"],
  ["3361", "Motor vehicles"],
  ["3364", "Aerospace"],
  ["4811", "Airlines"],
  ["4821", "Rail transport"],
  ["5151", "Broadcasting"],
  ["5161", "Internet publishing"],
  ["5171", "Wired telecom"],
  ["5173", "Wireless telecom"],
  ["5121", "Motion picture & video"],
  ["7225", "Restaurants"],
  ["4451", "Grocery stores"],
  ["4551", "Department stores"],
  ["4571", "Gasoline stations"],
  ["311", "Food products"],
  ["3121", "Beverages"],
  ["315", "Apparel"],
  ["322", "Paper products"],
  ["325", "Chemicals"],
  ["326", "Plastics & rubber"],
  ["327", "Nonmetallic minerals"],
  ["331", "Primary metals"],
  ["332", "Fabricated metals"],
  ["333", "Machinery"],
  ["334", "Electronics"],
  ["335", "Electrical equipment"],
  ["337", "Furniture"],
  ["423", "Wholesale durables"],
  ["424", "Wholesale nondurables"],
];

INDUSTRY_PREFIXES.sort((a, b) => b[0].length - a[0].length);

export function labelsFromNaics(code: string | null | undefined): SectorIndustry | null {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (digits.length < 2) return null;

  const sector = TWO_DIGIT[digits.slice(0, 2)] ?? "Other";
  let industry = sector;
  for (const [prefix, label] of INDUSTRY_PREFIXES) {
    if (digits.startsWith(prefix)) {
      industry = label;
      break;
    }
  }
  return { sector, industry };
}

export function naicsDisplayName(code: string | null | undefined): string | null {
  const labels = labelsFromNaics(code);
  return labels?.industry ?? null;
}
