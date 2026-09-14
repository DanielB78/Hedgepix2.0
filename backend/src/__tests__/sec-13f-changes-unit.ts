import assert from "node:assert/strict";
import { classifyPositionChange } from "../sec/thirteenF.js";

assert.equal(classifyPositionChange(null, 1000), "NEW_POSITION");
assert.equal(classifyPositionChange(0, 1000), "NEW_POSITION");
assert.equal(classifyPositionChange(1000, null), "EXITED");
assert.equal(classifyPositionChange(1000, 0), "EXITED");
assert.equal(classifyPositionChange(1000, 1500), "INCREASED");
assert.equal(classifyPositionChange(1500, 1000), "REDUCED");
assert.equal(classifyPositionChange(1000, 1000), "UNCHANGED");
assert.equal(classifyPositionChange(null, null), "UNCHANGED");
assert.equal(classifyPositionChange(0, 0), "UNCHANGED");

console.log("sec-13f-changes-unit: OK");
