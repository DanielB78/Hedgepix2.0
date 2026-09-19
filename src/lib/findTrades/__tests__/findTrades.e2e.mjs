/**
 * Playwright smoke test for Find Trades filter builder.
 * Run: npx playwright test --config=src/lib/findTrades/__tests__/playwright.config.ts
 * Or: node --import tsx src/lib/findTrades/__tests__/findTrades.e2e.mjs
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const BASE = process.env.FIND_TRADES_URL ?? "http://localhost:3000/find-trades";
const OUT = "/opt/cursor/artifacts";

mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(60000);

  console.log("goto", BASE);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="find-trades-result-count"]');

  const initialText = await page
    .locator('[data-testid="find-trades-result-count"]')
    .innerText();
  console.log("initial:", initialText);
  assert.match(initialText, /\d[\d,]* matching trade/);
  const initialCount = Number(
    initialText.replace(/,/g, "").match(/(\d+)/)?.[1] ?? "0",
  );
  assert.ok(initialCount > 100, "expected a sizable trade universe");

  await page.screenshot({
    path: `${OUT}/find_trades_initial.png`,
    fullPage: false,
  });

  // Add Source = Senate
  await page.click('[data-testid="find-trades-add-filter"]');
  await page.waitForSelector('[data-testid="find-trades-filter-menu"]');
  await page.fill('[data-testid="find-trades-filter-search"]', "source");
  await page.click('[data-testid="find-trades-field-source"]');
  await page.waitForTimeout(300);

  // Source defaults to house in enum order — switch to senate
  const sourceSelects = page.locator("select");
  // Operator + value selects on the condition row — last select is value for enum
  const conditionRow = page.locator(".rounded-md.border").filter({
    hasText: "Source",
  }).first();
  await conditionRow.locator("select").last().selectOption("senate");
  await page.waitForTimeout(200);

  const afterSource = await page
    .locator('[data-testid="find-trades-result-count"]')
    .innerText();
  console.log("after source:", afterSource);
  const afterSourceCount = Number(
    afterSource.replace(/,/g, "").match(/(\d+)/)?.[1] ?? "0",
  );
  assert.ok(
    afterSourceCount < initialCount && afterSourceCount > 0,
    `Senate filter should narrow (${afterSourceCount} vs ${initialCount})`,
  );
  await page.screenshot({
    path: `${OUT}/find_trades_source_senate.png`,
    fullPage: false,
  });

  // Add Transaction type = Buy
  await page.click('[data-testid="find-trades-add-filter"]');
  await page.waitForSelector('[data-testid="find-trades-filter-menu"]');
  await page.fill('[data-testid="find-trades-filter-search"]', "transaction type");
  await page.click('[data-testid="find-trades-field-transaction_type"]');
  await page.waitForTimeout(200);
  // Buy is first enum value — already default equals buy
  const afterBuy = await page
    .locator('[data-testid="find-trades-result-count"]')
    .innerText();
  console.log("after buy:", afterBuy);
  const afterBuyCount = Number(
    afterBuy.replace(/,/g, "").match(/(\d+)/)?.[1] ?? "0",
  );
  assert.ok(afterBuyCount <= afterSourceCount);

  // Add Ticker using a symbol that appears in the current results
  const sampleTicker = (
    await page.locator("tbody tr").first().locator("td").nth(3).innerText()
  )
    .trim()
    .toUpperCase();
  console.log("sample ticker from results:", sampleTicker);
  assert.ok(sampleTicker && sampleTicker !== "—");

  await page.click('[data-testid="find-trades-add-filter"]');
  await page.waitForSelector('[data-testid="find-trades-filter-menu"]');
  await page.click('[data-testid="find-trades-field-ticker"]');
  await page.waitForTimeout(200);
  const tickerInput = page
    .locator(".rounded-md.border")
    .filter({ hasText: /^Ticker/ })
    .locator('input[type="text"], input:not([type])')
    .first();
  // Prefer the value input in the Ticker condition row (not search)
  const tickerRow = page.locator("div.flex.flex-wrap").filter({
    has: page.locator("span", { hasText: "Ticker" }),
  }).first();
  const valueInput = tickerRow.locator("input").last();
  await valueInput.click();
  await valueInput.fill(sampleTicker);
  await valueInput.dispatchEvent("input");
  await valueInput.blur();
  await page.waitForTimeout(400);

  const narrowText = await page
    .locator('[data-testid="find-trades-result-count"]')
    .innerText();
  const narrowCount = Number(
    narrowText.replace(/,/g, "").match(/(\d+)/)?.[1] ?? "0",
  );
  console.log("after ticker:", narrowText);
  assert.ok(narrowCount >= 1, "expected at least one matching trade");
  assert.ok(narrowCount <= afterBuyCount);

  await page.screenshot({
    path: `${OUT}/find_trades_narrowed.png`,
    fullPage: false,
  });

  // Expand first result
  await page.locator("tbody tr").first().click();
  await page.waitForTimeout(400);
  const matchedBecause = await page.getByText("Matched because").count();
  assert.ok(matchedBecause >= 1, "expanded row should show Matched because");
  await page.screenshot({
    path: `${OUT}/find_trades_expanded_match.png`,
    fullPage: false,
  });

  // Clear all
  await page.click('[data-testid="find-trades-clear-all"]');
  await page.waitForTimeout(200);
  const cleared = await page
    .locator('[data-testid="find-trades-result-count"]')
    .innerText();
  const clearedCount = Number(
    cleared.replace(/,/g, "").match(/(\d+)/)?.[1] ?? "0",
  );
  assert.equal(clearedCount, initialCount);
  console.log("cleared back to", cleared);

  console.log("findTrades e2e: ok");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
