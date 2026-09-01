import assert from "node:assert/strict";
import {
  historyDateWindows,
  houseArchiveYears,
  yearDateBounds,
  HISTORY_START_YEAR,
} from "../backfill-history.js";

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

function testHouseArchiveYears() {
  const years = houseArchiveYears(2012, 2014);
  assert.deepEqual(years, [2012, 2013, 2014]);
  assert.equal(houseArchiveYears(HISTORY_START_YEAR, HISTORY_START_YEAR).length, 1);
}

function testYearDateBounds() {
  assert.deepEqual(yearDateBounds(2012, "2012-01-01", "2026-09-01"), {
    fromDate: "2012-01-01",
    toDate: "2012-12-31",
  });
  assert.deepEqual(yearDateBounds(2026, "2012-01-01", "2026-09-01"), {
    fromDate: "2026-01-01",
    toDate: "2026-09-01",
  });
}

testHistoryWindows();
testHouseArchiveYears();
testYearDateBounds();
console.log("backfill-history tests passed");
