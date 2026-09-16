#!/usr/bin/env python3
"""
Build a current House + Senate member -> sector exposure database.

This uses public committee/subcommittee assignments as a transparent proxy for
policy and oversight exposure. It does NOT assert that a member has material
nonpublic company information or has traded on it.

Outputs:
  congress_member_sector_exposure.sqlite
  congress_member_sector_exposure.json
  congress_member_sector_exposure.csv
  congress_member_sector_evidence.csv

Requirements:
  pip install requests

Run:
  python build_congress_member_sector_db.py
"""

from __future__ import annotations
import csv
import json
import sqlite3
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

import requests

BASE = Path(__file__).resolve().parent
RULES_PATH = BASE / "congress_sector_rules.json"

MEMBERSHIP_URL = "https://unitedstates.github.io/congress-legislators/committee-membership-current.json"
COMMITTEES_URL = "https://unitedstates.github.io/congress-legislators/committees-current.json"
LEGISLATORS_URL = "https://unitedstates.github.io/congress-legislators/legislators-current.json"

HEADERS = {
    "User-Agent": "Hedgepix congressional-sector-research/1.0 (research use)"
}

def get_json(url: str):
    r = requests.get(url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.json()

def norm(s):
    if not s:
        return ""
    s = s.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def current_term(legislator):
    terms = legislator.get("terms") or []
    if not terms:
        return {}
    # The source documents current members with their current term last.
    return terms[-1]

def build_legislator_map(legislators):
    out = {}
    for l in legislators:
        bioguide = (l.get("id") or {}).get("bioguide")
        if not bioguide:
            continue
        name = l.get("name") or {}
        term = current_term(l)
        full_name = name.get("official_full") or " ".join(
            x for x in [name.get("first"), name.get("middle"), name.get("last")] if x
        )
        out[bioguide] = {
            "bioguide": bioguide,
            "name": full_name,
            "party": term.get("party"),
            "state": term.get("state"),
            "district": term.get("district"),
            "chamber": "House" if term.get("type") == "rep" else "Senate" if term.get("type") == "sen" else None,
            "official_url": term.get("url"),
        }
    return out

def build_committee_map(committees):
    """
    membership keys use the parent thomas_id plus the subcommittee thomas_id.
    """
    out = {}
    for c in committees:
        parent_id = c.get("thomas_id")
        if not parent_id:
            continue
        chamber = c.get("type")
        out[parent_id] = {
            "committee_code": parent_id,
            "committee_name": c.get("name"),
            "subcommittee_name": None,
            "chamber": chamber,
            "url": c.get("url"),
            "jurisdiction": c.get("jurisdiction"),
            "is_subcommittee": False,
        }
        for sub in c.get("subcommittees") or []:
            sub_id = f"{parent_id}{sub.get('thomas_id','')}"
            out[sub_id] = {
                "committee_code": sub_id,
                "parent_code": parent_id,
                "committee_name": c.get("name"),
                "subcommittee_name": sub.get("name"),
                "chamber": chamber,
                "url": sub.get("url") or c.get("url"),
                "jurisdiction": sub.get("jurisdiction") or c.get("jurisdiction"),
                "is_subcommittee": True,
            }
    return out

def rule_matches(rule, meta):
    m = rule.get("match") or {}
    chamber = (meta.get("chamber") or "").lower()
    if m.get("chamber") and m["chamber"].lower() != chamber:
        return False

    committee = meta.get("committee_name") or ""
    sub = meta.get("subcommittee_name") or ""

    if m.get("committee") and norm(m["committee"]) != norm(committee):
        return False
    if m.get("subcommittee") and norm(m["subcommittee"]) != norm(sub):
        return False

    parent_contains = rule.get("parent_contains")
    if parent_contains and norm(parent_contains) not in norm(committee):
        return False

    return True

def add_rule_evidence(member, assignment, meta, rule, evidence_rows):
    assignment_name = meta.get("subcommittee_name") or meta.get("committee_name")
    for label in rule.get("industry_labels") or []:
        member["industry_labels"].add(label)
        evidence_rows.append({
            "bioguide": member["bioguide"],
            "member": member["name"],
            "chamber": member["chamber"],
            "label_type": "industry",
            "label": label,
            "committee_code": meta.get("committee_code"),
            "committee": meta.get("committee_name"),
            "subcommittee": meta.get("subcommittee_name"),
            "role": assignment.get("title"),
            "basis": rule.get("basis"),
            "source_url": meta.get("url"),
        })
    for topic in rule.get("policy_topics") or []:
        member["policy_topics"].add(topic)
        evidence_rows.append({
            "bioguide": member["bioguide"],
            "member": member["name"],
            "chamber": member["chamber"],
            "label_type": "policy_topic",
            "label": topic,
            "committee_code": meta.get("committee_code"),
            "committee": meta.get("committee_name"),
            "subcommittee": meta.get("subcommittee_name"),
            "role": assignment.get("title"),
            "basis": rule.get("basis"),
            "source_url": meta.get("url"),
        })

def main():
    rule_doc = json.loads(RULES_PATH.read_text(encoding="utf-8"))
    rules = rule_doc["rules"]

    print("Downloading current congressional committee data...")
    memberships = get_json(MEMBERSHIP_URL)
    committees = get_json(COMMITTEES_URL)
    legislators = get_json(LEGISLATORS_URL)

    cm = build_committee_map(committees)
    lm = build_legislator_map(legislators)

    members = {}
    evidence = []
    assignments_rows = []

    # Create records for all current House/Senate legislators, including those
    # whose assignments yield no clean industry match.
    for bioguide, base in lm.items():
        if base["chamber"] not in ("House", "Senate"):
            continue
        members[bioguide] = {
            **base,
            "industry_labels": set(),
            "policy_topics": set(),
            "committees": set(),
            "subcommittees": set(),
        }

    for committee_code, assigned_members in memberships.items():
        meta = cm.get(committee_code)
        if not meta:
            # Keep unknown committee codes from crashing the build.
            continue

        for a in assigned_members:
            bioguide = a.get("bioguide")
            if not bioguide:
                continue
            if bioguide not in members:
                # Fall back to membership name when legislator metadata lags.
                chamber = "House" if meta.get("chamber") == "house" else "Senate" if meta.get("chamber") == "senate" else None
                members[bioguide] = {
                    "bioguide": bioguide,
                    "name": a.get("name"),
                    "party": None,
                    "state": None,
                    "district": None,
                    "chamber": chamber,
                    "official_url": None,
                    "industry_labels": set(),
                    "policy_topics": set(),
                    "committees": set(),
                    "subcommittees": set(),
                }

            member = members[bioguide]
            if meta.get("committee_name"):
                member["committees"].add(meta["committee_name"])
            if meta.get("subcommittee_name"):
                member["subcommittees"].add(meta["subcommittee_name"])

            assignments_rows.append({
                "bioguide": bioguide,
                "member": member["name"],
                "chamber": member["chamber"],
                "committee_code": committee_code,
                "committee": meta.get("committee_name"),
                "subcommittee": meta.get("subcommittee_name"),
                "role": a.get("title"),
                "rank": a.get("rank"),
                "source_url": meta.get("url"),
            })

            for rule in rules:
                if rule_matches(rule, meta):
                    add_rule_evidence(member, a, meta, rule, evidence)

    # Deduplicate identical evidence produced by duplicate/current aliases.
    seen = set()
    deduped_evidence = []
    for e in evidence:
        key = (
            e["bioguide"], e["label_type"], e["label"],
            e["committee_code"], e["basis"]
        )
        if key in seen:
            continue
        seen.add(key)
        deduped_evidence.append(e)
    evidence = deduped_evidence

    # Serializable aggregate output
    serial = []
    for bioguide, m in sorted(members.items(), key=lambda kv: ((kv[1]["chamber"] or ""), kv[1]["name"] or "")):
        serial.append({
            "bioguide": bioguide,
            "name": m["name"],
            "chamber": m["chamber"],
            "party": m["party"],
            "state": m["state"],
            "district": m["district"],
            "official_url": m["official_url"],
            "industry_labels": sorted(m["industry_labels"]),
            "policy_topics": sorted(m["policy_topics"]),
            "committees": sorted(m["committees"]),
            "subcommittees": sorted(m["subcommittees"]),
        })

    json_out = BASE / "congress_member_sector_exposure.json"
    json_out.write_text(json.dumps({
        "generated_from": {
            "membership": MEMBERSHIP_URL,
            "committees": COMMITTEES_URL,
            "legislators": LEGISLATORS_URL,
        },
        "methodology_note": (
            "Industry labels are inferred from current public committee/subcommittee jurisdiction. "
            "They indicate policy/oversight exposure, not possession of material nonpublic company "
            "information and not misconduct."
        ),
        "members": serial,
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    # Flat member-level CSV
    csv_out = BASE / "congress_member_sector_exposure.csv"
    with csv_out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=[
            "bioguide","name","chamber","party","state","district",
            "industry_labels","policy_topics","committees","subcommittees","official_url"
        ])
        w.writeheader()
        for m in serial:
            w.writerow({
                **{k:m[k] for k in ["bioguide","name","chamber","party","state","district","official_url"]},
                "industry_labels": json.dumps(m["industry_labels"], ensure_ascii=False),
                "policy_topics": json.dumps(m["policy_topics"], ensure_ascii=False),
                "committees": json.dumps(m["committees"], ensure_ascii=False),
                "subcommittees": json.dumps(m["subcommittees"], ensure_ascii=False),
            })

    evidence_out = BASE / "congress_member_sector_evidence.csv"
    if evidence:
        with evidence_out.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(evidence[0].keys()))
            w.writeheader()
            w.writerows(evidence)

    # SQLite normalized database
    db_out = BASE / "congress_member_sector_exposure.sqlite"
    if db_out.exists():
        db_out.unlink()
    con = sqlite3.connect(db_out)
    con.executescript("""
    PRAGMA foreign_keys = ON;

    CREATE TABLE members (
      bioguide TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      chamber TEXT,
      party TEXT,
      state TEXT,
      district INTEGER,
      official_url TEXT
    );

    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bioguide TEXT NOT NULL,
      committee_code TEXT NOT NULL,
      committee TEXT,
      subcommittee TEXT,
      role TEXT,
      rank INTEGER,
      source_url TEXT,
      FOREIGN KEY (bioguide) REFERENCES members(bioguide)
    );

    CREATE TABLE member_labels (
      bioguide TEXT NOT NULL,
      label_type TEXT NOT NULL CHECK(label_type IN ('industry','policy_topic')),
      label TEXT NOT NULL,
      PRIMARY KEY (bioguide, label_type, label),
      FOREIGN KEY (bioguide) REFERENCES members(bioguide)
    );

    CREATE TABLE label_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bioguide TEXT NOT NULL,
      label_type TEXT NOT NULL,
      label TEXT NOT NULL,
      committee_code TEXT,
      committee TEXT,
      subcommittee TEXT,
      role TEXT,
      basis TEXT,
      source_url TEXT,
      FOREIGN KEY (bioguide) REFERENCES members(bioguide)
    );

    CREATE INDEX idx_member_labels_label ON member_labels(label_type, label);
    CREATE INDEX idx_evidence_member ON label_evidence(bioguide);
    CREATE INDEX idx_assignments_member ON assignments(bioguide);
    """)

    con.executemany(
        "INSERT INTO members VALUES (?,?,?,?,?,?,?)",
        [(m["bioguide"],m["name"],m["chamber"],m["party"],m["state"],m["district"],m["official_url"]) for m in serial]
    )
    con.executemany(
        """INSERT INTO assignments
           (bioguide,committee_code,committee,subcommittee,role,rank,source_url)
           VALUES (?,?,?,?,?,?,?)""",
        [(a["bioguide"],a["committee_code"],a["committee"],a["subcommittee"],a["role"],a["rank"],a["source_url"])
         for a in assignments_rows]
    )

    label_rows = []
    for m in serial:
        for x in m["industry_labels"]:
            label_rows.append((m["bioguide"],"industry",x))
        for x in m["policy_topics"]:
            label_rows.append((m["bioguide"],"policy_topic",x))
    con.executemany("INSERT OR IGNORE INTO member_labels VALUES (?,?,?)", label_rows)

    con.executemany(
        """INSERT INTO label_evidence
           (bioguide,label_type,label,committee_code,committee,subcommittee,role,basis,source_url)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        [(e["bioguide"],e["label_type"],e["label"],e["committee_code"],e["committee"],
          e["subcommittee"],e["role"],e["basis"],e["source_url"]) for e in evidence]
    )

    con.commit()
    con.close()

    print(f"Members: {len(serial)}")
    print(f"Industry/policy evidence rows: {len(evidence)}")
    print(f"Created: {db_out.name}")
    print(f"Created: {json_out.name}")
    print(f"Created: {csv_out.name}")
    print(f"Created: {evidence_out.name}")

if __name__ == "__main__":
    main()
