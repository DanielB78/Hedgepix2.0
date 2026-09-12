#!/usr/bin/env python3
"""Build NAICS industry embedding templates from Census 2022 descriptions.

Uses 5-digit NAICS industries (~690 labels): the official industry level,
detailed enough for news classification. The News UI dropdown only lists
industries that currently appear on stored articles.
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NAICS_DIR = ROOT / "naics"
DEFAULT_XLSX = NAICS_DIR / "2022_NAICS_Descriptions.xlsx"
TEMPLATES_PATH = NAICS_DIR / "templates.json"
CENSUS_URL = (
  "https://www.census.gov/naics/2022NAICS/2022_NAICS_Descriptions.xlsx"
)

# Official NAICS "Industry" level (5-digit).
TARGET_CODE_LEN = 5


def ensure_xlsx(path: Path, download: bool = True) -> Path:
  if path.exists():
    return path
  if not download:
    raise FileNotFoundError(f"Missing NAICS workbook: {path}")
  path.parent.mkdir(parents=True, exist_ok=True)
  print(f"Downloading NAICS descriptions from Census…\n  {CENSUS_URL}")
  urllib.request.urlretrieve(CENSUS_URL, path)
  return path


def clean_title(title: str) -> str:
  text = re.sub(r"\s+", " ", (title or "").strip())
  # Census marks trilateral titles with a trailing "T".
  if text.endswith("T") and not text.endswith(" IT"):
    text = text[:-1].rstrip()
  return text


def clean_description(desc: str | None) -> str:
  if desc is None:
    return ""
  text = str(desc).replace("\r\n", "\n").replace("\r", "\n")
  # Drop cross-reference boilerplate — noisy for embeddings.
  cut = re.search(r"\n\s*Cross-References\.?", text, flags=re.IGNORECASE)
  if cut:
    text = text[: cut.start()]
  text = re.sub(r"\s+", " ", text).strip()
  if not text or text.upper() == "NULL":
    return ""
  if text.lower().startswith("see industry description"):
    return ""
  return text


def load_rows(xlsx_path: Path) -> list[dict[str, str]]:
  try:
    import openpyxl
  except ImportError as err:
    raise SystemExit(
      "openpyxl is required to build NAICS templates. "
      "Install with: pip install openpyxl"
    ) from err

  wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
  ws = wb.active
  rows: list[dict[str, str]] = []
  for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i == 0:
      continue
    raw_code = row[0]
    if raw_code is None:
      continue
    code = str(raw_code).strip()
    if code.endswith(".0"):
      code = code[:-2]
    if not code.isdigit():
      continue
    title = clean_title(str(row[1] or ""))
    desc = clean_description(row[2] if len(row) > 2 else None)
    if not title:
      continue
    rows.append({"code": code, "name": title, "description": desc})
  return rows


def resolve_description(
  code: str,
  by_code: dict[str, dict[str, str]],
  children_by_prefix: dict[str, list[dict[str, str]]],
) -> str:
  own = by_code.get(code, {}).get("description") or ""
  if own:
    return own
  # Prefer a child industry description, else summarize child titles.
  kids = children_by_prefix.get(code, [])
  for kid in kids:
    if kid.get("description"):
      return kid["description"]
  names = [k["name"] for k in kids if k.get("name")]
  if names:
    sample = ", ".join(names[:8])
    more = f", and {len(names) - 8} related industries" if len(names) > 8 else ""
    return f"Industry group covering: {sample}{more}."
  return by_code[code]["name"]


def build_templates(xlsx_path: Path) -> list[dict[str, str]]:
  rows = load_rows(xlsx_path)
  by_code = {r["code"]: r for r in rows}
  children_by_prefix: dict[str, list[dict[str, str]]] = {}
  for r in rows:
    if len(r["code"]) <= TARGET_CODE_LEN:
      continue
    prefix = r["code"][:TARGET_CODE_LEN]
    children_by_prefix.setdefault(prefix, []).append(r)

  templates: list[dict[str, str]] = []
  for r in rows:
    if len(r["code"]) != TARGET_CODE_LEN:
      continue
    description = resolve_description(r["code"], by_code, children_by_prefix)
    template_text = f"{r['code']}\n{r['name']}\n{description}"
    templates.append(
      {
        "code": r["code"],
        "name": r["name"],
        "description": description,
        "template_text": template_text,
      }
    )
  templates.sort(key=lambda t: t["code"])
  if not templates:
    raise RuntimeError("No NAICS templates produced")
  return templates


def write_templates(templates: list[dict[str, str]], out_path: Path) -> None:
  out_path.parent.mkdir(parents=True, exist_ok=True)
  payload = {
    "source": "US Census Bureau 2022 NAICS Descriptions",
    "code_length": TARGET_CODE_LEN,
    "model_hint": "BAAI/bge-small-en-v1.5",
    "count": len(templates),
    "templates": templates,
  }
  out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument(
    "--xlsx",
    type=Path,
    default=DEFAULT_XLSX,
    help="Path to 2022_NAICS_Descriptions.xlsx",
  )
  parser.add_argument(
    "--out",
    type=Path,
    default=TEMPLATES_PATH,
    help="Output JSON path",
  )
  parser.add_argument(
    "--no-download",
    action="store_true",
    help="Fail if the workbook is missing instead of downloading",
  )
  args = parser.parse_args(argv)

  xlsx = ensure_xlsx(args.xlsx, download=not args.no_download)
  templates = build_templates(xlsx)
  write_templates(templates, args.out)
  print(
    json.dumps(
      {
        "ok": True,
        "xlsx": str(xlsx),
        "out": str(args.out),
        "count": len(templates),
        "code_length": TARGET_CODE_LEN,
      }
    )
  )
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
