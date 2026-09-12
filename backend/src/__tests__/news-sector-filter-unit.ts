import assert from "node:assert/strict";

/**
 * Mirrors src/lib/news.ts sector filter helpers (kept local so backend tests
 * do not import the Next.js path alias).
 */
type NewsArticle = {
  sector: string | null;
  sector_score: number | null;
  sector_1: string | null;
  sector_1_code: string | null;
  sector_1_score: number | null;
  sector_2: string | null;
  sector_2_code: string | null;
  sector_2_score: number | null;
  sector_3: string | null;
  sector_3_code: string | null;
  sector_3_score: number | null;
};

function articleSectorMatches(article: NewsArticle) {
  const rows: Array<[string | null, string | null, number | null]> = [
    [article.sector_1_code, article.sector_1, article.sector_1_score],
    [article.sector_2_code, article.sector_2, article.sector_2_score],
    [article.sector_3_code, article.sector_3, article.sector_3_score],
  ];
  const out: Array<{ code: string; name: string; score: number | null }> = [];
  for (const [code, name, score] of rows) {
    const c = code?.trim() || "";
    const n = name?.trim() || "";
    if (!c && !n) continue;
    out.push({
      code: c || n,
      name: n || c,
      score: typeof score === "number" && Number.isFinite(score) ? score : null,
    });
  }
  return out;
}

function articleMatchesSector(article: NewsArticle, sectorCode: string) {
  const needle = sectorCode.trim();
  if (!needle) return true;
  return articleSectorMatches(article).some((m) => m.code === needle);
}

function collectSectorOptions(articles: NewsArticle[]) {
  const byCode = new Map<string, string>();
  for (const article of articles) {
    for (const match of articleSectorMatches(article)) {
      if (!match.code) continue;
      if (!byCode.has(match.code)) byCode.set(match.code, match.name);
    }
  }
  return [...byCode.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}

const article: NewsArticle = {
  sector: "Semiconductor and Other Electronic Component Manufacturing",
  sector_score: 0.55,
  sector_1: "Semiconductor and Other Electronic Component Manufacturing",
  sector_1_code: "3344",
  sector_1_score: 0.55,
  sector_2: "Depository Credit Intermediation",
  sector_2_code: "5221",
  sector_2_score: 0.41,
  sector_3: "Software Publishers",
  sector_3_code: "5112",
  sector_3_score: 0.39,
};

assert.equal(articleSectorMatches(article).length, 3);
assert.equal(articleMatchesSector(article, "3344"), true);
assert.equal(articleMatchesSector(article, "5221"), true); // 2nd match
assert.equal(articleMatchesSector(article, "5112"), true); // 3rd match
assert.equal(articleMatchesSector(article, "1111"), false);
assert.equal(articleMatchesSector(article, ""), true);

const opts = collectSectorOptions([article]);
assert.ok(opts.some((o) => o.code === "5221"));
assert.ok(opts.some((o) => o.code === "3344"));

console.log("news-sector-filter unit tests passed");
