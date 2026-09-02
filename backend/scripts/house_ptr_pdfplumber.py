#!/usr/bin/env python3
"""
Extract House PTR transactions with pdfplumber word coordinates.

Flow helper: Node downloads PDF (and optionally OCRs it), then calls this script.

Output JSON:
{
  "ok": true,
  "member": "...",
  "doc_id": "...",
  "transactions": [...],
  "expected_stock_count": N,
  "parsed_stock_count": M,
  "has_extractable_text": true,
  "error": null
}
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pdfplumber

STOCK_CODES = {"ST", "ET"}

ASSET_TYPE_MAP = {
    "ST": "Stock",
    "OP": "Stock Option",
    "GS": "Government Security",
    "MF": "Mutual Fund",
    "ET": "ETF",
    "CT": "Cryptocurrency",
    "CS": "Corporate Bond",
    "MS": "Municipal Security",
    "PE": "Private Equity",
    "RE": "Real Estate",
    "HE": "Hedge Fund",
    "OT": "Other",
}

OWNER_MAP = {"SP": "spouse", "DC": "child", "JT": "joint"}

DATE_RE = re.compile(r"\b(\d{1,2}/\d{1,2}/\d{4})\b")
AMOUNT_RE = re.compile(r"\$\s*([\d,]+)\s*-\s*\$\s*([\d,]+)")
# Handles "$15,001 - Stock (FERG) [ST] $50,000"
AMOUNT_FLEX_RE = re.compile(r"\$\s*([\d,]+)\s*-\s*(?:[^\$]{0,80})?\$\s*([\d,]+)")
MARKER_RE = re.compile(r"(?:\(([A-Z][A-Z0-9./\-]{0,8})\)\s*)?\[([A-Z]{2})\]")
TICKER_RE = re.compile(r"\(([A-Z][A-Z0-9./\-]{0,8})\)")
# Prefer partial-sale before bare S. No trailing \b after ')' (breaks on "S (partial) 03/...")
TYPE_RE = re.compile(r"(S\s*\(\s*partial\s*\)|(?<![A-Z])P(?![A-Z])|(?<![A-Z])S(?![A-Z])|(?<![A-Z])E(?![A-Z]))", re.I)
OWNER_PREFIX_RE = re.compile(r"^(SP|DC|JT)\b")
FILING_ID_RE = re.compile(r"Filing ID\s*#?\s*(\d+)", re.I)
NAME_RE = re.compile(r"Name:\s*(?:Hon\.\s*)?(.+)$", re.I)
NOISE_RE = re.compile(
    r"^(F(?:iling)?\s*S(?:tatus)?|S(?:ubholding)?\s*O|D(?:escription)?)\s*:",
    re.I,
)


def clean_nulls(s: str) -> str:
    return re.sub(r"[\x00]+", "", s)


def cluster_lines(words: list[dict], y_tol: float = 3.5) -> list[str]:
    if not words:
        return []
    words = sorted(words, key=lambda w: (w["top"], w["x0"]))
    lines: list[list[dict]] = []
    current: list[dict] = []
    current_top = None
    for w in words:
        if current_top is None or abs(w["top"] - current_top) <= y_tol:
            current.append(w)
            if current_top is None:
                current_top = w["top"]
            else:
                current_top = (current_top * (len(current) - 1) + w["top"]) / len(current)
        else:
            lines.append(current)
            current = [w]
            current_top = w["top"]
    if current:
        lines.append(current)

    out = []
    for group in lines:
        group = sorted(group, key=lambda w: w["x0"])
        text = clean_nulls(" ".join(w["text"] for w in group)).strip()
        if text:
            out.append(text)
    return out


def extract_lines(pdf_path: Path) -> tuple[list[str], bool]:
    lines: list[str] = []
    alpha = 0
    total = 0
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            words = page.extract_words(use_text_flow=False, keep_blank_chars=False) or []
            page_lines = cluster_lines(words)
            lines.extend(page_lines)
            page_text = " ".join(page_lines)
            alpha += sum(1 for c in page_text if c.isalpha())
            total += max(len(page_text), 1)
    has_text = alpha >= 40 and (alpha / total) > 0.05
    return lines, has_text


def to_iso(date_raw: str) -> str | None:
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", date_raw.strip())
    if not m:
        return None
    mm, dd, yyyy = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return f"{yyyy:04d}-{mm:02d}-{dd:02d}"


def normalize_type(raw: str) -> str:
    key = re.sub(r"\s+", " ", raw.strip())
    key = re.sub(r"S\s*\(\s*partial\s*\)", "S (partial)", key, flags=re.I)
    if re.fullmatch(r"S \(partial\)", key, flags=re.I):
        return "Sale (Partial)"
    upper = key.upper()
    if upper == "P":
        return "Purchase"
    if upper == "S":
        return "Sale (Full)"
    if upper == "E":
        return "exchange"
    return key


def parse_amount(block: str) -> tuple[int, int] | None:
    m = AMOUNT_RE.search(block)
    if not m:
        m = AMOUNT_FLEX_RE.search(block)
    if not m:
        return None
    low = int(m.group(1).replace(",", ""))
    high = int(m.group(2).replace(",", ""))
    if high < low:
        return None
    return low, high


def extract_member_and_doc(lines: list[str], fallback_doc: str | None) -> tuple[str, str]:
    member = "Unknown"
    doc_id = fallback_doc or "unknown"
    for line in lines[:50]:
        m = FILING_ID_RE.search(line)
        if m:
            doc_id = m.group(1)
        m = NAME_RE.search(line)
        if m:
            member = clean_nulls(m.group(1)).strip()
    return member, doc_id


def is_description_noise(line: str) -> bool:
    low = line.lower()
    if NOISE_RE.match(line):
        return True
    if "shares sold @" in low or "shares bought @" in low:
        return True
    if "the full transaction included" in low:
        return True
    return False


def window_text(lines: list[str], center: int, before: int = 1, after: int = 1) -> str:
    start = max(0, center - before)
    end = min(len(lines), center + after + 1)
    parts = []
    for ln in lines[start:end]:
        if is_description_noise(ln):
            continue
        parts.append(ln)
    return clean_nulls(re.sub(r"\s+", " ", " ".join(parts))).strip()


def find_marker_line_indexes(lines: list[str]) -> list[int]:
    return [i for i, ln in enumerate(lines) if MARKER_RE.search(ln)]


def parse_from_window(
    block: str,
    member: str,
    filing_date: str,
    doc_id: str,
    index: int,
    marker_line_index: int,
) -> dict | None:
    marker = MARKER_RE.search(block)
    if not marker:
        return None

    asset_code = marker.group(2).upper()
    ticker = marker.group(1)
    if not ticker:
        pre = block[: marker.start()]
        found = TICKER_RE.findall(pre)
        if found:
            ticker = found[-1]

    dates = DATE_RE.findall(block)
    if len(dates) < 2:
        return None
    tx_date = to_iso(dates[0])
    notif_date = to_iso(dates[1])
    if not tx_date:
        return None

    amount = parse_amount(block)
    if not amount:
        return None
    amount_low, amount_high = amount

    before_first_date = block.split(dates[0], 1)[0]
    type_matches = list(TYPE_RE.finditer(before_first_date))
    if not type_matches:
        type_matches = list(TYPE_RE.finditer(block))
    if not type_matches:
        return None
    type_label = normalize_type(type_matches[-1].group(1))

    owner = "self"
    owner_m = OWNER_PREFIX_RE.match(block)
    if owner_m:
        owner = OWNER_MAP.get(owner_m.group(1).upper(), "self")

    # Asset name: remove owner prefix, type token, marker, and trailing junk
    asset_name = before_first_date
    asset_name = OWNER_PREFIX_RE.sub("", asset_name)
    asset_name = TYPE_RE.sub(" ", asset_name)
    asset_name = MARKER_RE.sub(" ", asset_name)
    asset_name = re.sub(r"\bType Date Gains\b.*$", "", asset_name, flags=re.I)
    asset_name = re.sub(r"\$200\?", "", asset_name)
    asset_name = re.sub(r"^(?:F|Filer|Asset|SP)\s+", "", asset_name, flags=re.I)
    asset_name = re.sub(r"^SP(?=[A-Z])", "", asset_name)
    asset_name = re.sub(r"\s+", " ", asset_name).strip(" -:\t")
    if not asset_name or asset_name.upper() in {"FILING ID", "FILING", "ID"}:
        asset_name = ticker or "Unknown asset"
    if owner.upper() in {"FILING ID", "FILING", "ID", "STATUS"}:
        owner = "self"

    return {
        "politician": member,
        "transaction_date": tx_date,
        "filing_date": notif_date or filing_date or tx_date,
        "ticker": ticker,
        "asset_name": asset_name,
        "asset_type": ASSET_TYPE_MAP.get(asset_code, "Other"),
        "asset_type_code": asset_code,
        "type": type_label,
        "amount": f"${amount_low:,} - ${amount_high:,}",
        "amount_min": amount_low,
        "amount_max": amount_high,
        "owner": owner,
        "source_id": f"house_{doc_id}_{marker_line_index}",
        "raw_json": {
            "source": "house",
            "doc_id": doc_id,
            "parser": "pdfplumber",
            "asset_type_code": asset_code,
            "marker_line_index": marker_line_index,
            "block": block[:500],
        },
    }


def parse_transactions(lines: list[str], member: str, filing_date: str, doc_id: str) -> list[dict]:
    marker_idxs = find_marker_line_indexes(lines)
    rows: list[dict] = []
    seen_marker_lines: set[int] = set()

    for idx in marker_idxs:
        if idx in seen_marker_lines:
            continue
        # Prefer tight windows so description text from prior rows does not leak in.
        block = window_text(lines, idx, before=1, after=0)
        if not parse_amount(block) or len(DATE_RE.findall(block)) < 2:
            block = window_text(lines, idx, before=1, after=1)
        if not parse_amount(block) or len(DATE_RE.findall(block)) < 2:
            block = window_text(lines, idx, before=2, after=1)

        row = parse_from_window(block, member, filing_date, doc_id, len(rows), idx)
        if not row:
            continue
        seen_marker_lines.add(idx)
        rows.append(row)
    return rows


def expected_stock_count(lines: list[str]) -> int:
    """Count identifiable stock/ETF transaction rows.

    A stock row is identifiable when an [ST]/[ET] marker appears with nearby
    transaction context (type and/or dates). We intentionally do NOT require a
    parseable amount here — missing amounts should fail coverage validation.
    """
    count = 0
    for idx in find_marker_line_indexes(lines):
        marker_line = lines[idx]
        m = MARKER_RE.search(marker_line)
        if not m or m.group(2).upper() not in STOCK_CODES:
            continue
        identifiable = False
        for before, after in ((1, 0), (1, 1), (2, 1), (2, 2), (3, 2)):
            block = window_text(lines, idx, before=before, after=after)
            dates = DATE_RE.findall(block)
            has_type = bool(TYPE_RE.search(block))
            # Real PTR rows almost always have type + at least one date nearby.
            if has_type and len(dates) >= 1:
                identifiable = True
                break
            if len(dates) >= 2 and parse_amount(block):
                identifiable = True
                break
        if identifiable:
            count += 1
    return count


def parse_pdf(pdf_path: Path, filing_date: str | None = None, doc_id: str | None = None) -> dict:
    lines, has_text = extract_lines(pdf_path)
    member, doc = extract_member_and_doc(lines, doc_id)
    filing_date = filing_date or ""

    if not has_text:
        return {
            "ok": False,
            "member": member,
            "doc_id": doc,
            "transactions": [],
            "expected_stock_count": 0,
            "parsed_stock_count": 0,
            "has_extractable_text": False,
            "error": "no_extractable_text",
        }

    transactions = parse_transactions(lines, member, filing_date, doc)
    expected = expected_stock_count(lines)
    parsed_stock = sum(1 for t in transactions if t.get("asset_type_code") in STOCK_CODES)
    if expected < parsed_stock:
        expected = parsed_stock

    return {
        "ok": True,
        "member": member,
        "doc_id": doc,
        "transactions": transactions,
        "expected_stock_count": expected,
        "parsed_stock_count": parsed_stock,
        "has_extractable_text": True,
        "error": None,
    }


def main() -> int:
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "usage: house_ptr_pdfplumber.py <pdf> [filing_date] [doc_id]",
                }
            )
        )
        return 2
    pdf_path = Path(sys.argv[1])
    filing_date = sys.argv[2] if len(sys.argv) > 2 else None
    doc_id = sys.argv[3] if len(sys.argv) > 3 else None
    if not pdf_path.exists():
        print(json.dumps({"ok": False, "error": f"missing file: {pdf_path}"}))
        return 1
    print(json.dumps(parse_pdf(pdf_path, filing_date=filing_date, doc_id=doc_id), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
