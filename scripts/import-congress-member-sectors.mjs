#!/usr/bin/env node
/**
 * Import generated congress_member_sector_exposure.json into Postgres.
 * Bridges bioguide → member_slug (exact + fuzzy aliases vs congress_trades).
 *
 * Usage (local):
 *   set -a && source backend/.env && set +a
 *   node scripts/import-congress-member-sectors.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const EXPOSURE_PATH = resolve(
  ROOT,
  "data/congress-sector/congress_member_sector_exposure.json",
);
const EVIDENCE_PATH = resolve(
  ROOT,
  "data/congress-sector/congress_member_sector_evidence.csv",
);

function slugify(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripHonorifics(name) {
  return String(name ?? "")
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv|md|phd)\b/gi, "")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Candidate slugs for a legislator display name. */
function candidateSlugs(name) {
  const cleaned = stripHonorifics(name);
  const out = new Set();
  out.add(slugify(cleaned));
  // Drop middle initials / middle names: First Last
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    out.add(slugify(`${parts[0]} ${parts[parts.length - 1]}`));
    // First MiddleInitial Last already covered; also First M Last without dots
  }
  // Nickname in quotes removed by stripHonorifics quotes
  return [...out].filter(Boolean);
}

function tokens(slug) {
  return slug.split("-").filter((t) => t && t.length > 1);
}

function bestTradeMatch(legislator, tradeRows) {
  const chamber = (legislator.chamber || "").toLowerCase();
  const state = (legislator.state || "").toLowerCase();
  const cands = new Set(candidateSlugs(legislator.name));
  for (const row of tradeRows) {
    if (cands.has(row.member_slug)) return row.member_slug;
  }
  const legToks = tokens(slugify(stripHonorifics(legislator.name)));
  const last = legToks[legToks.length - 1];
  const first = legToks[0];
  if (!last || !first) return null;

  let best = null;
  let bestScore = 0;
  for (const row of tradeRows) {
    if (chamber && row.chamber && row.chamber !== chamber) continue;
    // state often null on trades — only filter when both present
    if (state && row.state && row.state.toLowerCase() !== state) continue;
    const t = tokens(row.member_slug);
    if (!t.includes(last)) continue;
    let score = 2;
    if (t[0] === first) score += 3;
    else if (t[0]?.startsWith(first.slice(0, 1)) && first.length > 1) score += 1;
    else if (first.startsWith(t[0]?.slice(0, 2) ?? "xx")) score += 1;
    // Prefer shorter slug distance
    score -= Math.abs(t.length - legToks.length) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = row.member_slug;
    }
  }
  return bestScore >= 3 ? best : null;
}

function parseEvidenceCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = cols[i] ?? "";
    });
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

async function upsertChunk(client, table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  }
  const client = createClient(url, key, { auth: { persistSession: false } });

  const exposure = JSON.parse(readFileSync(EXPOSURE_PATH, "utf8"));
  const members = exposure.members ?? [];
  console.log(`Loading ${members.length} members from exposure JSON`);

  // Distinct trade identities for bridging.
  const tradeRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from("congress_trades")
      .select("member_slug, member, chamber, state")
      .not("member_slug", "is", null)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (!rows.length) break;
    tradeRows.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }
  const uniqueTrades = new Map();
  for (const row of tradeRows) {
    const slug = String(row.member_slug ?? "").trim();
    if (!slug || uniqueTrades.has(slug)) continue;
    uniqueTrades.set(slug, {
      member_slug: slug,
      member: row.member,
      chamber: row.chamber,
      state: row.state,
    });
  }
  const tradeList = [...uniqueTrades.values()];
  console.log(`Trade member identities: ${tradeList.length}`);

  const memberRows = [];
  const aliasRows = [];
  const labelRows = [];
  const topicRows = [];
  const assignmentRows = [];
  let linked = 0;

  for (const m of members) {
    const bioguide = m.bioguide;
    if (!bioguide) continue;
    const matchedSlug = bestTradeMatch(m, tradeList);
    const primarySlug =
      matchedSlug || candidateSlugs(m.name)[0] || slugify(m.name);
    if (matchedSlug) linked += 1;

    memberRows.push({
      bioguide,
      name: m.name,
      member_slug: primarySlug,
      chamber: m.chamber ? String(m.chamber).toLowerCase() : null,
      party: m.party ?? null,
      state: m.state ?? null,
      district: m.district ?? null,
      official_url: m.official_url ?? null,
      updated_at: new Date().toISOString(),
    });

    const aliases = new Set(candidateSlugs(m.name));
    if (matchedSlug) aliases.add(matchedSlug);
    aliases.add(primarySlug);
    for (const a of aliases) {
      if (!a) continue;
      aliasRows.push({ member_slug: a, bioguide });
    }

    for (const label of m.industry_labels ?? []) {
      if (label) labelRows.push({ bioguide, label: String(label) });
    }
    for (const topic of m.policy_topics ?? []) {
      if (topic) topicRows.push({ bioguide, topic: String(topic) });
    }
    for (const committee of m.committees ?? []) {
      assignmentRows.push({
        bioguide,
        committee_code: `name:${slugify(committee)}`,
        committee: committee,
        subcommittee: null,
        role: null,
        committee_rank: null,
        source_url: m.official_url ?? null,
      });
    }
    for (const sub of m.subcommittees ?? []) {
      assignmentRows.push({
        bioguide,
        committee_code: `sub:${slugify(sub)}`,
        committee: null,
        subcommittee: sub,
        role: null,
        committee_rank: null,
        source_url: m.official_url ?? null,
      });
    }
  }

  console.log(`Linked to trade slugs: ${linked}/${members.length}`);
  await upsertChunk(client, "congress_members", memberRows, "bioguide");

  const uniqueAliases = [
    ...new Map(
      aliasRows
        .filter((r) => r.member_slug && r.bioguide)
        .map((r) => [r.member_slug, r]),
    ).values(),
  ];
  await client.from("congress_member_slug_aliases").delete().neq("member_slug", "");
  for (let i = 0; i < uniqueAliases.length; i += 500) {
    const chunk = uniqueAliases.slice(i, i + 500);
    const { error } = await client
      .from("congress_member_slug_aliases")
      .insert(chunk);
    if (error) throw new Error(`aliases: ${error.message}`);
  }
  // Labels / topics: clear+insert via delete then upsert
  await client.from("congress_member_sector_labels").delete().neq("label", "");
  await client.from("congress_member_policy_topics").delete().neq("topic", "");
  await upsertChunk(
    client,
    "congress_member_sector_labels",
    labelRows,
    "bioguide,label",
  );
  await upsertChunk(
    client,
    "congress_member_policy_topics",
    topicRows,
    "bioguide,topic",
  );

  // Evidence
  let evidenceRows = [];
  try {
    evidenceRows = parseEvidenceCsv(readFileSync(EVIDENCE_PATH, "utf8")).map(
      (row) => ({
        bioguide: row.bioguide,
        label_type: row.label_type,
        label: row.label,
        committee_code: row.committee_code || null,
        committee: row.committee || null,
        subcommittee: row.subcommittee || null,
        role: row.role || null,
        basis: row.basis || null,
        source_url: row.source_url || null,
      }),
    );
  } catch (err) {
    console.warn(`Evidence CSV skipped: ${err.message}`);
  }
  if (evidenceRows.length) {
    await client
      .from("congress_member_sector_evidence")
      .delete()
      .neq("label", "");
    for (let i = 0; i < evidenceRows.length; i += 500) {
      const chunk = evidenceRows.slice(i, i + 500);
      const { error } = await client
        .from("congress_member_sector_evidence")
        .insert(chunk);
      if (error) throw new Error(`evidence: ${error.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        members: memberRows.length,
        aliases: uniqueAliases.length,
        industryLabels: labelRows.length,
        policyTopics: topicRows.length,
        evidence: evidenceRows.length,
        linkedToTrades: linked,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
