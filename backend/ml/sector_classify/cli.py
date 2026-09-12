#!/usr/bin/env python3
"""Local BGE-small NAICS sector classification for GDELT news titles.

Usage:
  # Build NAICS templates JSON from Census workbook (downloads if needed)
  python3 -m sector_classify.cli build-templates

  # Build / refresh NAICS embedding cache
  python3 -m sector_classify.cli build-cache

  # Classify titles from JSON stdin:
  #   [{"id":"...", "title":"..."}, ...]
  # writes JSON array to stdout with top-3 NAICS matches
  python3 -m sector_classify.cli classify
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .classify import (
  MODEL_NAME,
  build_prototype_cache,
  classify_titles,
  load_prototype_cache,
  load_templates,
)

ROOT = Path(__file__).resolve().parent


def cmd_build_templates(_: argparse.Namespace) -> int:
  from .build_naics_templates import main as build_main

  return int(build_main([]))


def cmd_build_cache(args: argparse.Namespace) -> int:
  # Ensure templates exist before embedding.
  load_templates()
  path = build_prototype_cache(force=bool(args.force))
  cache = load_prototype_cache()
  print(
    json.dumps(
      {
        "ok": True,
        "model": MODEL_NAME,
        "cache": str(path),
        "templates": len(cache["codes"]),
      }
    )
  )
  return 0


def cmd_classify(_: argparse.Namespace) -> int:
  raw = sys.stdin.read()
  if not raw.strip():
    print("[]")
    return 0
  try:
    payload = json.loads(raw)
  except json.JSONDecodeError as err:
    print(f"Invalid JSON on stdin: {err}", file=sys.stderr)
    return 1
  if not isinstance(payload, list):
    print("Expected a JSON array of {id, title} objects", file=sys.stderr)
    return 1

  items: list[tuple[str, str]] = []
  for row in payload:
    if not isinstance(row, dict):
      continue
    item_id = str(row.get("id") or "").strip()
    title = str(row.get("title") or "").strip()
    if item_id and title:
      items.append((item_id, title))

  if not items:
    print("[]")
    return 0

  # Ensure cache exists (embeds NAICS templates once).
  load_prototype_cache()
  results = classify_titles(items)
  print(json.dumps(results))
  return 0


def main(argv: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  sub = parser.add_subparsers(dest="command", required=True)

  p_tpl = sub.add_parser(
    "build-templates",
    help="Build NAICS templates JSON from Census descriptions",
  )
  p_tpl.set_defaults(func=cmd_build_templates)

  p_build = sub.add_parser("build-cache", help="Embed NAICS templates once")
  p_build.add_argument(
    "--force",
    action="store_true",
    help="Rebuild cache even if it already exists",
  )
  p_build.set_defaults(func=cmd_build_cache)

  p_cls = sub.add_parser("classify", help="Classify titles from JSON stdin")
  p_cls.set_defaults(func=cmd_classify)

  args = parser.parse_args(argv)
  return int(args.func(args))


if __name__ == "__main__":
  raise SystemExit(main())
