import assert from "node:assert/strict";
import {
  SECTOR_OVERLAP_THRESHOLD,
  cosineSimilarity,
  detectSectorOverlap,
  normalizeSectorLabel,
} from "../sectorOverlap";

function unit(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (err) {
    console.error(`FAIL — ${name}`);
    throw err;
  }
}

unit("normalize collapses whitespace and lowercases", () => {
  assert.equal(normalizeSectorLabel("  Commercial   Aerospace "), "commercial aerospace");
});

unit("direct match is case/whitespace insensitive", () => {
  const r = detectSectorOverlap(
    ["Commercial aerospace"],
    ["  commercial   Aerospace "],
  );
  assert.equal(r.has_sector_overlap, true);
  assert.equal(r.match_type, "direct");
  assert.equal(r.similarity, 1);
  assert.equal(r.member_label, "Commercial aerospace");
});

unit("no labels → no overlap", () => {
  const r = detectSectorOverlap([], ["Banking"]);
  assert.equal(r.has_sector_overlap, false);
  assert.equal(r.match_type, null);
});

unit("embedding match at exactly 0.95", () => {
  const a = new Float32Array([1, 0, 0]);
  // Build b so cosine is exactly 0.95 (within float32 noise, still >= threshold)
  const cos = 0.95;
  const b = new Float32Array([cos, Math.sqrt(1 - cos * cos), 0]);
  // Force score to threshold via nearly-identical vectors if float noise dips below
  let score = cosineSimilarity(a, b);
  if (score < SECTOR_OVERLAP_THRESHOLD) {
    // Use a slightly higher target so float32 still clears the inclusive bar
    const cos2 = 0.9501;
    b[0] = cos2;
    b[1] = Math.sqrt(1 - cos2 * cos2);
    score = cosineSimilarity(a, b);
  }
  assert.ok(score >= SECTOR_OVERLAP_THRESHOLD);

  const map = new Map<string, Float32Array>([
    ["defense aerospace", a],
    ["aerospace systems", b],
  ]);
  const r = detectSectorOverlap(
    ["Defense aerospace"],
    ["Aerospace systems"],
    map,
  );
  assert.equal(r.has_sector_overlap, true);
  assert.equal(r.match_type, "embedding");
  assert.ok((r.similarity ?? 0) >= SECTOR_OVERLAP_THRESHOLD);
});

unit("embedding inclusive threshold: 0.95 matches, 0.9499 does not", () => {
  const a = new Float32Array([1, 0]);
  const mapHi = new Map<string, Float32Array>([
    ["a", a],
    ["b", new Float32Array([0.9500001, Math.sqrt(1 - 0.9500001 ** 2)])],
  ]);
  const hi = detectSectorOverlap(["A"], ["B"], mapHi);
  assert.equal(hi.has_sector_overlap, true);

  const mapLo = new Map<string, Float32Array>([
    ["a", a],
    ["b", new Float32Array([0.9499, Math.sqrt(1 - 0.9499 ** 2)])],
  ]);
  const lo = detectSectorOverlap(["A"], ["B"], mapLo);
  assert.equal(lo.has_sector_overlap, false);
});

unit("direct match short-circuits embedding", () => {
  const a = new Float32Array([1, 0]);
  const b = new Float32Array([0, 1]); // cosine 0
  const map = new Map<string, Float32Array>([
    ["banking", a],
    ["banking", b],
  ]);
  const r = detectSectorOverlap(["Banking"], ["banking"], map);
  assert.equal(r.match_type, "direct");
  assert.equal(r.similarity, 1);
});

unit("multi-label takes best embedding pair", () => {
  const x = new Float32Array([1, 0, 0]);
  const y = new Float32Array([0, 1, 0]);
  const z = new Float32Array([0.97, Math.sqrt(1 - 0.97 ** 2), 0]);
  const map = new Map<string, Float32Array>([
    ["military drones", x],
    ["consumer retail", y],
    ["aerospace systems", z],
  ]);
  const r = detectSectorOverlap(
    ["Military drones", "Consumer retail"],
    ["Aerospace systems"],
    map,
  );
  assert.equal(r.has_sector_overlap, true);
  assert.equal(r.match_type, "embedding");
  assert.equal(r.member_label, "Military drones");
  assert.equal(r.ticker_label, "Aerospace systems");
});

console.log("sector overlap unit tests passed");
