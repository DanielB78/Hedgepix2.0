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

unit("threshold constant is 0.85", () => {
  assert.equal(SECTOR_OVERLAP_THRESHOLD, 0.85);
});

unit("normalize collapses whitespace and lowercases", () => {
  assert.equal(
    normalizeSectorLabel("  Commercial   Aerospace "),
    "commercial aerospace",
  );
});

unit("direct match is case/whitespace insensitive", () => {
  const r = detectSectorOverlap(
    ["Commercial aerospace"],
    ["  commercial   Aerospace "],
  );
  assert.equal(r.has_sector_overlap, true);
  assert.equal(r.match_type, "direct");
  assert.equal(r.similarity, 1);
});

unit("embedding inclusive threshold: 0.85 matches, 0.8499 does not", () => {
  const a = new Float32Array([1, 0]);
  const mapHi = new Map<string, Float32Array>([
    ["a", a],
    ["b", new Float32Array([0.8500001, Math.sqrt(1 - 0.8500001 ** 2)])],
  ]);
  const hi = detectSectorOverlap(["A"], ["B"], mapHi);
  assert.equal(hi.has_sector_overlap, true);
  assert.equal(hi.match_type, "embedding");
  assert.ok((hi.similarity ?? 0) >= SECTOR_OVERLAP_THRESHOLD);

  const mapLo = new Map<string, Float32Array>([
    ["a", a],
    ["b", new Float32Array([0.8499, Math.sqrt(1 - 0.8499 ** 2)])],
  ]);
  const lo = detectSectorOverlap(["A"], ["B"], mapLo);
  assert.equal(lo.has_sector_overlap, false);
  assert.equal(lo.match_type, null);
});

unit("direct match short-circuits embedding", () => {
  const a = new Float32Array([1, 0]);
  const b = new Float32Array([0, 1]);
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
  const z = new Float32Array([0.88, Math.sqrt(1 - 0.88 ** 2), 0]);
  assert.ok(cosineSimilarity(x, z) >= SECTOR_OVERLAP_THRESHOLD);
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
