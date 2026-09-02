export type HousePdfParseStats = {
  normalParsed: number;
  ocrAttempted: number;
  ocrSuccess: number;
  stillUnparseable: number;
};

export function emptyHousePdfStats(): HousePdfParseStats {
  return {
    normalParsed: 0,
    ocrAttempted: 0,
    ocrSuccess: 0,
    stillUnparseable: 0,
  };
}

export function mergeHousePdfStats(
  ...parts: HousePdfParseStats[]
): HousePdfParseStats {
  return parts.reduce(
    (acc, part) => ({
      normalParsed: acc.normalParsed + part.normalParsed,
      ocrAttempted: acc.ocrAttempted + part.ocrAttempted,
      ocrSuccess: acc.ocrSuccess + part.ocrSuccess,
      stillUnparseable: acc.stillUnparseable + part.stillUnparseable,
    }),
    emptyHousePdfStats(),
  );
}

export function printHousePdfStats(stats: HousePdfParseStats): void {
  console.log("");
  console.log("House PDFs:");
  console.log(`Normal text parsed: ${stats.normalParsed}`);
  console.log(`OCR fallback attempted: ${stats.ocrAttempted}`);
  console.log(`OCR successfully parsed: ${stats.ocrSuccess}`);
  console.log(`Still unparseable: ${stats.stillUnparseable}`);
  console.log("");
}
