import assert from "node:assert/strict";
import type { NewsArticle } from "../news";
import {
  buildTrendingSectorBlocks,
  filterArticlesBySectors,
  type NewsTickerMove,
} from "../newsTickerMoves";

function article(partial: Partial<NewsArticle> & { id: string }): NewsArticle {
  return {
    source: "gdelt",
    title: "Test",
    url: "https://example.com",
    published_at: "2026-09-12T12:00:00Z",
    domain: "example.com",
    image_url: null,
    language: "en",
    gdelt_id: null,
    source_hash: partial.id,
    created_at: "2026-09-12T12:00:00Z",
    sector: null,
    sector_score: null,
    sector_1: null,
    sector_1_code: null,
    sector_1_score: null,
    sector_2: null,
    sector_2_code: null,
    sector_2_score: null,
    sector_3: null,
    sector_3_code: null,
    sector_3_score: null,
    ...partial,
  };
}

const a1 = article({
  id: "a1",
  title: "AI concerns",
  sector_1: "R&D Social Sciences",
  sector_1_code: "54172",
  sector_2: "Computer Systems Design",
  sector_2_code: "54151",
});

const a2 = article({
  id: "a2",
  title: "Phones",
  sector_1: "Electronics Retail",
  sector_1_code: "44921",
  sector_2: "Telephone Apparatus",
  sector_2_code: "33421",
});

const moves: NewsTickerMove[] = [
  {
    article_id: "a1",
    ticker: "ORCL",
    matched_naics_codes: ["54151"],
    event_return_pct: -8.9,
    historical_typical_move_pct: 2.1,
    abnormality_ratio: 4.1,
    is_abnormal: true,
    window_hours: 24,
    checked_at: null,
  },
  {
    article_id: "a1",
    ticker: "ADBE",
    matched_naics_codes: ["54151"],
    event_return_pct: 5.0,
    historical_typical_move_pct: 1.9,
    abnormality_ratio: 2.6,
    is_abnormal: true,
    window_hours: 24,
    checked_at: null,
  },
  {
    article_id: "a2",
    ticker: "CSCO",
    matched_naics_codes: ["33421", "33422"],
    event_return_pct: 1.9,
    historical_typical_move_pct: 0.65,
    abnormality_ratio: 2.96,
    is_abnormal: true,
    window_hours: 24,
    checked_at: null,
  },
];

const blocks = buildTrendingSectorBlocks([a1, a2], moves);
assert.equal(blocks.length, 2);
assert.equal(blocks[0]!.code, "54151");
assert.equal(blocks[0]!.abnormalCount, 2);
assert.equal(blocks[0]!.articles.length, 1);
assert.equal(blocks[0]!.articles[0]!.article.id, "a1");
assert.equal(blocks[0]!.articles[0]!.highlight?.ticker, "ORCL");
assert.equal(blocks[1]!.code, "33421");
assert.equal(blocks[1]!.abnormalCount, 1);

const filtered = filterArticlesBySectors([a1, a2], ["33421"]);
assert.equal(filtered.length, 1);
assert.equal(filtered[0]!.id, "a2");

const union = filterArticlesBySectors([a1, a2], ["54151", "33421"]);
assert.equal(union.length, 2);

const none = filterArticlesBySectors([a1, a2], []);
assert.equal(none.length, 2);

console.log("news-ticker-moves unit tests passed");
