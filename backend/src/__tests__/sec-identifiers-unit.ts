import assert from "node:assert/strict";
import { normalizeCik, parseMasterIndex, sourceId } from "../sec/identifiers.js";

function testNormalizeCik() {
  assert.equal(normalizeCik("0000320193"), "320193");
  assert.equal(normalizeCik(320193), "320193");
  assert.equal(normalizeCik(""), "");
  assert.equal(normalizeCik(null), "");
  assert.equal(normalizeCik("0"), "0");
}

function testSourceId() {
  const a = sourceId("acc-1", "sk-1");
  const b = sourceId("acc-1", "sk-1");
  const c = sourceId("acc-1", "sk-2");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 40);
  // Null/undefined parts should be treated consistently (empty string).
  assert.equal(sourceId("x", null), sourceId("x", undefined));
}

function testParseMasterIndex() {
  const text = [
    "Description:           Master Index of EDGAR Dissemination Feed",
    "",
    "CIK|Company Name|Form Type|Date Filed|Filename",
    "--------------------------------------------------------------------------------",
    "1000097|KINGDON CAPITAL MANAGEMENT, L.L.C.|13F-HR|2026-08-14|edgar/data/1000097/0001000097-26-000006.txt",
    "320193|Apple Inc.|8-K|2026-08-01|edgar/data/320193/0000320193-26-000045.txt",
    "",
  ].join("\n");

  const rows = parseMasterIndex(text);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    cik: "1000097",
    companyName: "KINGDON CAPITAL MANAGEMENT, L.L.C.",
    formType: "13F-HR",
    dateFiled: "2026-08-14",
    filename: "edgar/data/1000097/0001000097-26-000006.txt",
    accession: "0001000097-26-000006",
  });
  assert.equal(rows[1]!.formType, "8-K");
  assert.equal(rows[1]!.accession, "0000320193-26-000045");
}

testNormalizeCik();
testSourceId();
testParseMasterIndex();

console.log("sec-identifiers-unit: OK");
