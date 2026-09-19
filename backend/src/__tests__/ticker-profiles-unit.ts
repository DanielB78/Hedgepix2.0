/**
 * Unit checks for ticker sector / industry label helpers.
 */
import assert from "node:assert/strict";
import { labelsFromNaics } from "../tickers/naicsLabels.js";
import { labelsFromSic, labelsFromText } from "../tickers/sicLabels.js";

assert.equal(labelsFromNaics("221113")?.industry, "Nuclear energy");
assert.equal(labelsFromNaics("221113")?.sector, "Utilities");
assert.equal(labelsFromNaics("21112")?.sector, "Energy");
assert.equal(labelsFromNaics("33441")?.industry, "Semiconductors");

assert.equal(labelsFromText("Bloom Energy fuel cell systems")?.industry, "Fuel cells");
assert.equal(labelsFromText("Nuclear electric power generation")?.industry, "Nuclear energy");

const sic = labelsFromSic("4911", "Electric services");
assert.ok(sic);
assert.equal(sic.sector, "Utilities");

console.log("ticker sector label unit tests passed");
