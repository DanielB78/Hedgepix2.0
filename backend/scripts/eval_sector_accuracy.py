#!/usr/bin/env python3
"""Accuracy eval: 50 labeled generic headlines vs BGE-small sector classifier.

  cd backend
  PYTHONPATH=ml ml/.venv/bin/python scripts/eval_sector_accuracy.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

from sector_classify.classify import classify_titles, load_sectors  # noqa: E402

# (expected_sector, title) — generic headlines aligned to sectors.json keys.
LABELED: list[tuple[str, str]] = [
  # Semiconductors (5)
  ("Semiconductors", "Chip foundry expands advanced wafer production capacity"),
  ("Semiconductors", "GPU makers report surging demand for AI accelerators"),
  ("Semiconductors", "Memory chip prices rise as NAND supply tightens"),
  ("Semiconductors", "Semiconductor equipment orders climb on fab upgrades"),
  ("Semiconductors", "Processor manufacturer unveils next-generation CPU architecture"),
  # Electric Utilities (4)
  ("Electric Utilities", "Power utility files rate case to fund transmission upgrades"),
  ("Electric Utilities", "Grid operators warn of summer electricity demand spikes"),
  ("Electric Utilities", "Electric company invests in renewable generation and storage"),
  ("Electric Utilities", "Regional blackout highlights aging power infrastructure risks"),
  # Banks & Financials (4)
  ("Banks & Financials", "Large bank posts higher net interest margins in quarterly results"),
  ("Banks & Financials", "Lenders set aside more reserves for potential credit losses"),
  ("Banks & Financials", "Investment bank fee income rises on dealmaking rebound"),
  ("Banks & Financials", "Mortgage lending slows as deposit competition intensifies"),
  # Oil & Gas (3)
  ("Oil & Gas", "Crude oil prices jump after OPEC signals output restraint"),
  ("Oil & Gas", "Natural gas producers increase drilling in key shale basins"),
  ("Oil & Gas", "Refinery margins strengthen amid rising fuel demand"),
  # Healthcare & Pharma (3)
  ("Healthcare & Pharma", "Drugmaker wins regulatory approval for new cancer therapy"),
  ("Healthcare & Pharma", "Biotech firm reports positive late-stage clinical trial data"),
  ("Healthcare & Pharma", "Hospital chain expands outpatient services across major cities"),
  # Software & Internet (3)
  ("Software & Internet", "Cloud software provider grows subscription revenue double digits"),
  ("Software & Internet", "Cybersecurity company detects large enterprise software breach"),
  ("Software & Internet", "Social platform advertising sales accelerate in key markets"),
  # Consumer Retail (3)
  ("Consumer Retail", "Retail chain reports stronger same-store sales this quarter"),
  ("Consumer Retail", "E-commerce platform sees holiday shopping traffic surge"),
  ("Consumer Retail", "Discount retailer expands store footprint in suburban markets"),
  # Autos & EVs (3)
  ("Autos & EVs", "Electric vehicle deliveries rise as battery costs decline"),
  ("Autos & EVs", "Automaker recalls vehicles over safety software defect"),
  ("Autos & EVs", "Charging network expands highway coverage for EV drivers"),
  # Defense & Aerospace (3)
  ("Defense & Aerospace", "Defense contractor wins multiyear military aircraft order"),
  ("Defense & Aerospace", "Aerospace supplier ramps production for commercial jet programs"),
  ("Defense & Aerospace", "Pentagon budget proposal boosts weapons systems spending"),
  # Real Estate (3)
  ("Real Estate", "Commercial landlords face higher office vacancy rates"),
  ("Real Estate", "Home prices cool as mortgage rates pressure buyers"),
  ("Real Estate", "REIT raises dividend after strong apartment rent growth"),
  # Telecom (3)
  ("Telecom", "Wireless carrier adds subscribers after 5G network expansion"),
  ("Telecom", "Telecom firms bid aggressively in spectrum auction"),
  ("Telecom", "Broadband provider expands fiber internet to rural communities"),
  # Mining & Materials (3)
  ("Mining & Materials", "Copper mining output falls after prolonged worker strike"),
  ("Mining & Materials", "Lithium prices rebound on electric battery materials demand"),
  ("Mining & Materials", "Steel producers lift prices amid stronger industrial demand"),
  # Insurance (2)
  ("Insurance", "Insurers raise premiums after costly catastrophe claim season"),
  ("Insurance", "Property casualty underwriting results improve for major carrier"),
  # Media & Entertainment (2)
  ("Media & Entertainment", "Streaming service gains subscribers with exclusive content slate"),
  ("Media & Entertainment", "Studio reports record box office weekend for franchise sequel"),
  # Agriculture & Food (2)
  ("Agriculture & Food", "Grain exporters benefit from stronger crop harvest forecasts"),
  ("Agriculture & Food", "Food producers raise prices as fertilizer costs climb"),
  # Macro & Markets (4)
  ("Macro & Markets", "Federal Reserve signals higher interest rates to cool inflation"),
  ("Macro & Markets", "Stock market rally follows better-than-expected jobs report"),
  ("Macro & Markets", "Bond yields climb as investors reassess recession risk"),
  ("Macro & Markets", "Global equity indexes fall on weaker economic outlook data"),
]


def main() -> int:
  assert len(LABELED) == 50, f"expected 50 labels, got {len(LABELED)}"
  sectors = load_sectors()
  unknown = sorted({exp for exp, _ in LABELED if exp not in sectors})
  if unknown:
    print("Unknown expected sectors:", unknown, file=sys.stderr)
    print("Known:", sorted(sectors), file=sys.stderr)
    return 1

  items = [(f"t{i}", title) for i, (_, title) in enumerate(LABELED, start=1)]
  predictions = classify_titles(items)
  by_id = {row["id"]: row for row in predictions}

  rows: list[dict] = []
  correct = 0
  for i, (expected, title) in enumerate(LABELED, start=1):
    pred = by_id[f"t{i}"]
    got = pred["sector"]
    score = float(pred["sector_score"])
    ok = got == expected
    if ok:
      correct += 1
    rows.append(
      {
        "n": i,
        "title": title,
        "expected": expected,
        "predicted": got,
        "sector_score": round(score, 4),
        "correct": ok,
      }
    )

  total = len(rows)
  accuracy = correct / total if total else 0.0
  by_sector: dict[str, dict[str, int]] = {}
  for row in rows:
    bucket = by_sector.setdefault(row["expected"], {"n": 0, "correct": 0})
    bucket["n"] += 1
    if row["correct"]:
      bucket["correct"] += 1

  out = {
    "model": "BAAI/bge-small-en-v1.5",
    "total": total,
    "correct": correct,
    "accuracy": round(accuracy, 4),
    "accuracy_pct": round(accuracy * 100, 1),
    "per_sector": {
      k: {
        "n": v["n"],
        "correct": v["correct"],
        "accuracy_pct": round(100.0 * v["correct"] / v["n"], 1),
      }
      for k, v in sorted(by_sector.items())
    },
    "rows": rows,
  }

  artifacts = Path("/opt/cursor/artifacts")
  artifacts.mkdir(parents=True, exist_ok=True)
  out_path = artifacts / "sector_accuracy_eval_50.json"
  out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")

  print(f"Accuracy: {correct}/{total} = {out['accuracy_pct']}%")
  print(f"Wrote {out_path}")
  print("\n## Per-sector")
  print("| Sector | N | Correct | Accuracy |")
  print("|--------|--:|--------:|---------:|")
  for sector, stats in out["per_sector"].items():
    print(
      f"| {sector} | {stats['n']} | {stats['correct']} | {stats['accuracy_pct']}% |"
    )

  print("\n## All 50")
  print("| # | OK | Expected | Predicted | Score | Title |")
  print("|---|:--:|----------|-----------|------:|-------|")
  for row in rows:
    mark = "Y" if row["correct"] else "N"
    title = row["title"].replace("|", "\\|")
    print(
      f"| {row['n']} | {mark} | {row['expected']} | {row['predicted']} | {row['sector_score']} | {title} |"
    )
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
