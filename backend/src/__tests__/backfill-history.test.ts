import assert from "node:assert/strict";
import { historyDateWindows } from "../backfill-history.js";

function testHistoryWindows() {
  const windows = historyDateWindows("2012-01-01", "2014-06-15");
  assert.equal(windows.length, 3);
  assert.equal(windows[0].fromDate, "2012-01-01");
  assert.equal(windows[0].toDate, "2013-01-01");
  assert.equal(windows[1].fromDate, "2013-01-02");
  assert.equal(windows[2].toDate, "2014-06-15");

  const single = historyDateWindows("2026-01-01", "2026-03-01");
  assert.equal(single.length, 1);
  assert.equal(single[0].fromDate, "2026-01-01");
  assert.equal(single[0].toDate, "2026-03-01");
}

testHistoryWindows();
console.log("backfill-history tests passed");
