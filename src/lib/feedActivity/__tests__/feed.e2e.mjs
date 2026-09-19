/**
 * Playwright smoke test for Feed page.
 * Run: node src/lib/feedActivity/__tests__/feed.e2e.mjs
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const BASE = process.env.FEED_URL ?? "http://localhost:3000/watchlist";
const OUT = "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(120000);

  console.log("goto", BASE);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="feed-result-count"]');

  const countText = await page.locator('[data-testid="feed-result-count"]').innerText();
  console.log("count:", countText);
  assert.match(countText, /\d[\d,]* ticker/);

  // Nav active — Watchlist label
  const feedNav = page.locator('nav a', { hasText: "Watchlist" }).first();
  await assert.ok(await feedNav.count());

  await page.screenshot({ path: `${OUT}/feed_initial_3m.png`, fullPage: false });

  // Switch to 6 months
  await page.click('[data-testid="feed-tf-6m"]');
  await page.waitForURL(/tf=6m/);
  await page.waitForSelector('[data-testid="feed-result-count"]');
  await page.waitForTimeout(500);
  const sixText = await page.locator('[data-testid="feed-result-count"]').innerText();
  console.log("6m:", sixText);
  await page.screenshot({ path: `${OUT}/feed_6m.png`, fullPage: false });

  // Filter downtrend
  await page.selectOption('[data-testid="feed-trend"]', "down");
  await page.waitForURL(/trend=down/);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('[data-testid="feed-result-count"]');
  const downText = await page.locator('[data-testid="feed-result-count"]').innerText();
  console.log("downtrend filter:", downText);
  await page.screenshot({ path: `${OUT}/feed_downtrend_filter.png`, fullPage: false });

  const n = Number(downText.replace(/,/g, "").match(/(\d+)/)?.[1] ?? "0");
  // Intro should describe buyer-specific overlap focus
  const intro = await page.locator("text=buyer-specific").count();
  assert.ok(intro >= 1, "intro should mention buyer-specific patterns");

  if (n > 0) {
    const firstRow = page.locator('tbody tr[data-testid^="feed-row-"]').first();
    await firstRow.click();
    await page.waitForSelector('[data-testid="feed-ticker-detail"]', {
      timeout: 30000,
    });
    await page.waitForSelector('[data-testid="feed-strongest-signals"]', {
      timeout: 15000,
    });
    const signals = await page.getByText("Strongest Signals").count();
    assert.ok(signals >= 1);
    // Chart should load (PriceChart uses SVG)
    await page.waitForSelector('[data-testid="feed-ticker-detail"] svg', {
      timeout: 30000,
    });
    const viewTrades = await page.getByTestId("feed-view-all-trades").count();
    assert.ok(viewTrades >= 1);
    await page.screenshot({
      path: `${OUT}/feed_expanded_ticker.png`,
      fullPage: false,
    });
  }

  // Back to 3m all
  await page.click('[data-testid="feed-tf-3m"]');
  await page.waitForTimeout(500);

  console.log("feed e2e: ok");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
