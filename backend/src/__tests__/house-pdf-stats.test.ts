import assert from "node:assert/strict";
import {
  emptyHousePdfStats,
  mergeHousePdfStats,
} from "../house-pdf-stats.js";

const sample = {
  normalParsed: 10,
  ocrAttempted: 4,
  ocrSuccess: 3,
  stillUnparseable: 1,
  lowQualitySkipped: 2,
  incompleteCoverage: 1,
};

assert.deepEqual(emptyHousePdfStats(), {
  normalParsed: 0,
  ocrAttempted: 0,
  ocrSuccess: 0,
  stillUnparseable: 0,
  lowQualitySkipped: 0,
  incompleteCoverage: 0,
});

assert.deepEqual(mergeHousePdfStats(sample, sample), {
  normalParsed: 20,
  ocrAttempted: 8,
  ocrSuccess: 6,
  stillUnparseable: 2,
  lowQualitySkipped: 4,
  incompleteCoverage: 2,
});

console.log("house-pdf-stats tests passed");
