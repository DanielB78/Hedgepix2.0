/**
 * Headed demo of Find Trades for walkthrough video (Playwright records video).
 */
import { chromium } from "playwright";
import { mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.FIND_TRADES_URL ?? "http://localhost:3000/find-trades";
const OUT = "/opt/cursor/artifacts";
const VIDEO_DIR = "/tmp/find-trades-demo-video";

mkdirSync(OUT, { recursive: true });
mkdirSync(VIDEO_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    headless: true,
    slowMo: 350,
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1400, height: 900 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="find-trades-result-count"]');
  await page.waitForTimeout(800);

  await page.click('[data-testid="find-trades-add-filter"]');
  await page.waitForSelector('[data-testid="find-trades-filter-menu"]');
  await page.fill('[data-testid="find-trades-filter-search"]', "source");
  await page.click('[data-testid="find-trades-field-source"]');
  await page.waitForTimeout(400);

  const sourceRow = page.locator("div.flex.flex-wrap").filter({
    has: page.locator("span", { hasText: "Source" }),
  }).first();
  await sourceRow.locator("select").last().selectOption("senate");
  await page.waitForTimeout(700);

  await page.click('[data-testid="find-trades-add-filter"]');
  await page.waitForSelector('[data-testid="find-trades-filter-menu"]');
  await page.click('[data-testid="find-trades-field-transaction_type"]');
  await page.waitForTimeout(700);

  const sampleTicker = (
    await page.locator("tbody tr").first().locator("td").nth(3).innerText()
  )
    .trim()
    .toUpperCase();

  await page.click('[data-testid="find-trades-add-filter"]');
  await page.waitForSelector('[data-testid="find-trades-filter-menu"]');
  await page.click('[data-testid="find-trades-field-ticker"]');
  await page.waitForTimeout(300);
  const tickerRow = page.locator("div.flex.flex-wrap").filter({
    has: page.locator("span", { hasText: "Ticker" }),
  }).first();
  const valueInput = tickerRow.locator("input").last();
  await valueInput.fill(sampleTicker);
  await valueInput.blur();
  await page.waitForTimeout(800);

  await page.locator("tbody tr").first().click();
  await page.waitForTimeout(1200);
  await page.getByText("Matched because").first().waitFor();

  await page.screenshot({
    path: `${OUT}/find_trades_demo_final.png`,
    fullPage: false,
  });

  await page.click('[data-testid="find-trades-clear-all"]');
  await page.waitForTimeout(800);

  await context.close();
  await browser.close();

  const videos = readdirSync(VIDEO_DIR).filter((f) => f.endsWith(".webm"));
  if (!videos.length) throw new Error("No video produced");
  const dest = join(OUT, "find_trades_filter_builder_demo.webm");
  copyFileSync(join(VIDEO_DIR, videos[0]), dest);
  console.log("wrote", dest, "ticker", sampleTicker);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
