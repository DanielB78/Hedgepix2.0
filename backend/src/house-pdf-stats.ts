export type HousePdfParseStats = {
  normalParsed: number;
  ocrAttempted: number;
  ocrSuccess: number;
  stillUnparseable: number;
  lowQualitySkipped: number;
  incompleteCoverage: number;
};

export function emptyHousePdfStats(): HousePdfParseStats {
  return {
    normalParsed: 0,
    ocrAttempted: 0,
    ocrSuccess: 0,
    stillUnparseable: 0,
    lowQualitySkipped: 0,
    incompleteCoverage: 0,
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
      lowQualitySkipped: acc.lowQualitySkipped + part.lowQualitySkipped,
      incompleteCoverage: acc.incompleteCoverage + part.incompleteCoverage,
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
  console.log(`Low-quality scans skipped: ${stats.lowQualitySkipped}`);
  console.log(`Incomplete stock coverage: ${stats.incompleteCoverage}`);
  console.log(`Still unparseable (investigate): ${stats.stillUnparseable}`);
  console.log("");
}
