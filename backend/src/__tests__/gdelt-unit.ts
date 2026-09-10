import assert from "node:assert/strict";
import {
  newsSourceHash,
  normalizeGdeltArticle,
  parseGdeltSeenDate,
} from "../news/gdelt.js";

function testParseSeenDate() {
  assert.equal(parseGdeltSeenDate("20260910T150000Z"), "2026-09-10T15:00:00Z");
  assert.equal(parseGdeltSeenDate("bad"), null);
  assert.equal(parseGdeltSeenDate(null), null);
}

function testSourceHashStable() {
  const a = newsSourceHash({
    url: "https://Example.com/story?utm_source=x#frag",
    title: "  Markets  Rally  ",
    publishedAt: "2026-09-10T15:00:00Z",
  });
  const b = newsSourceHash({
    url: "https://example.com/story",
    title: "Markets Rally",
    publishedAt: "2026-09-10T15:00:00Z",
  });
  assert.equal(a, b);
  assert.equal(a.length, 64);
}

function testNormalize() {
  const article = normalizeGdeltArticle({
    url: "https://www.reuters.com/markets/us/story-1?utm_medium=rss",
    title: "  Stocks climb  ",
    seendate: "20260910T120000Z",
    domain: "reuters.com",
    language: "English",
    socialimage: "https://example.com/img.jpg",
  });
  assert.ok(article);
  assert.equal(article!.title, "Stocks climb");
  assert.equal(article!.domain, "reuters.com");
  assert.equal(article!.source, "gdelt");
  assert.equal(article!.published_at, "2026-09-10T12:00:00Z");
  assert.ok(article!.gdelt_id?.startsWith("gdelt:"));
  assert.equal(article!.source_hash.length, 64);
  assert.equal(
    normalizeGdeltArticle({ url: "", title: "x" }),
    null,
  );
}

testParseSeenDate();
testSourceHashStable();
testNormalize();
console.log("gdelt unit tests passed");
