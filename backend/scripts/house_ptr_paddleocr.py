#!/usr/bin/env python3
"""
Parse scanned/image-only House PTR PDFs with PaddleOCR PP-StructureV3.

Maps reconstructed rows into the same transaction schema as house_ptr_pdfplumber.py.
Only accepts rows that pass strict validation (type, dates, amount, ticker when present).
"""

from __future__ import annotations

import html as html_lib
import json
import re
import sys
import warnings
from html.parser import HTMLParser
from pathlib import Path

warnings.filterwarnings("ignore")

ASSET_TYPE_MAP = {
    "ST": "Stock",
    "ET": "ETF / Fund",
}
STOCK_CODES = {"ST", "ET"}

# Paper-form amount bands (House PTR checkbox columns A–J).
AMOUNT_BANDS: list[tuple[str, int, int | None]] = [
    ("A", 1_000, 15_000),
    ("B", 15_001, 50_000),
    ("C", 50_001, 100_000),
    ("D", 100_001, 250_000),
    ("E", 250_001, 500_000),
    ("F", 500_001, 1_000_000),
    ("G", 1_000_001, 5_000_000),
    ("H", 5_000_001, 25_000_000),
    ("I", 25_000_001, 50_000_000),
    ("J", 50_000_001, None),
]

OWNER_MAP = {"SP": "spouse", "DC": "child", "JT": "joint"}

DATE_RE = re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b")
TICKER_PAREN_RE = re.compile(r"\(([A-Z][A-Z0-9./\-$]{0,8})\)")
TICKER_TRAIL_RE = re.compile(r"(?:^|[\s\-–—])([A-Z]{1,5})(?:\s*\[(?:ST|ET)\])?\s*$")
# OCR sometimes lowercases a leading letter: "lEUR" → IEUR-ish; keep strict uppercase tickers.
TICKER_LOOSE_TRAIL_RE = re.compile(r"(?:^|[\s\-–—])([A-Za-z]{1,5})\s*$")
MARKER_RE = re.compile(r"\[(ST|ET)\]", re.I)
OWNER_PREFIX_RE = re.compile(r"^(SP|DC|JT)\b", re.I)
CHECK_RE = re.compile(r"[Xx√✓✖✕☒☑]|□\s*[Xx]|\[\s*[Xx]\s*\]")
NOISE_ASSET_RE = re.compile(
    r"(?i)^(full\s*asset|provide\s*full|example\s*:|name\s*:|page\s*\d|"
    r"type\s*of|date\s*of|amount\s*of|periodic\s*transaction)"
)
BOND_RE = re.compile(
    r"(?i)\b(?:municipal\s+bond|muni(?:cipal)?\b|\bbonds?\b|\bnotes?\b|treasury\s+bill|"
    r"\bBE/?R\b|RV\s*BE|auth(?:ority)?\b.*(?:rev|revenue|elec|cultural)|"
    r"airports?\s+auth|energy\s+(?:northwest|auth)|certificate\s+of\s+deposit|\bcd\b)\b"
)
ETF_HINT_RE = re.compile(r"(?i)\b(?:etf|exchange[\s-]?traded|spdr|ishares|vanguard|invesco|proshares)\b")
STOCK_HINT_RE = re.compile(
    r"(?i)\b(?:common\s+stock|inc\.?|corp(?:oration)?|co\.?|ltd\.?|plc|holdings?)\b"
)

_PIPELINE = None


class _TableHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._in_cell = False

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"}:
            self._cell = []
            self._in_cell = True

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._row is not None and self._cell is not None:
            text = html_lib.unescape(" ".join(self._cell))
            text = re.sub(r"\s+", " ", text).strip()
            self._row.append(text)
            self._cell = None
            self._in_cell = False
        elif tag == "tr" and self._row is not None:
            if any(c.strip() for c in self._row):
                self.rows.append(self._row)
            self._row = None

    def handle_data(self, data: str) -> None:
        if self._in_cell and self._cell is not None:
            self._cell.append(data)


def parse_html_table(html: str) -> list[list[str]]:
    parser = _TableHTMLParser()
    try:
        parser.feed(html or "")
    except Exception:
        return []
    return parser.rows


def get_pipeline():
    global _PIPELINE
    if _PIPELINE is None:
        from paddleocr import PPStructureV3

        _PIPELINE = PPStructureV3(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            use_seal_recognition=False,
            use_formula_recognition=False,
            use_chart_recognition=False,
        )
    return _PIPELINE


def to_iso(mm: str, dd: str, yy: str) -> str | None:
    try:
        month, day, year = int(mm), int(dd), int(yy)
    except ValueError:
        return None
    if year < 100:
        year += 2000 if year < 70 else 1900
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    if year < 2000 or year > 2035:
        return None
    return f"{year:04d}-{month:02d}-{day:02d}"


def parse_dates(text: str) -> list[str]:
    out: list[str] = []
    for m in DATE_RE.finditer(text or ""):
        iso = to_iso(m.group(1), m.group(2), m.group(3))
        if iso:
            out.append(iso)
    return out


def is_checked(cell: str) -> bool:
    if not cell:
        return False
    t = cell.strip()
    if CHECK_RE.search(t):
        return True
    # Lone mark-like glyphs after OCR noise stripping
    cleaned = re.sub(r"[^\w√✓Xx]", "", t)
    return cleaned.upper() in {"X", "XX"}


def normalize_type(raw: str) -> str | None:
    t = re.sub(r"\s+", " ", (raw or "").strip()).lower()
    if not t:
        return None
    if "partial" in t and "sale" in t:
        return "Sale (Partial)"
    if t in {"p", "purchase", "buy", "bought"} or t.startswith("purchase"):
        return "Purchase"
    if t in {"s", "sale", "sell", "sold"} or t.startswith("sale"):
        return "Sale (Full)"
    if t in {"e", "exchange"} or t.startswith("exchange"):
        return "exchange"
    return None


def extract_ticker(asset: str) -> str | None:
    if not asset:
        return None
    m = TICKER_PAREN_RE.search(asset)
    if m:
        return m.group(1).upper()
    # Trailing ticker after dash/space: "Zoetis Inc ZTS", "… ETF - SHLD"
    m = re.search(r"(?:[\s\-–—])([A-Z]{1,5})\s*$", asset.strip())
    if m:
        tok = m.group(1)
        if tok not in {"INC", "CORP", "CO", "LTD", "PLC", "ETF", "TR", "THE", "AND", "OF", "FOR", "II", "WA", "TX"}:
            return tok
    m = TICKER_LOOSE_TRAIL_RE.search(asset.strip())
    if m:
        tok = m.group(1).upper()
        # Only accept mostly-letter tickers that look intentional (OCR case noise).
        if (
            tok.isalpha()
            and 2 <= len(tok) <= 5
            and tok
            not in {"INC", "CORP", "CO", "LTD", "PLC", "ETF", "TR", "THE", "AND", "OF", "FOR", "II", "WA", "TX", "AUTH"}
        ):
            return tok
    return None


def looks_like_stock_row(asset: str, ticker: str | None, marker: str | None) -> bool:
    if marker in STOCK_CODES:
        return True
    if not ticker:
        return False
    if BOND_RE.search(asset) and not ETF_HINT_RE.search(asset):
        return False
    # Reject obvious municipal / authority debt even when OCR mangled "Bond"
    low = asset.lower()
    if any(k in low for k in ("be/r", "rv be", "airports auth", "cultural", "muni")) and not ETF_HINT_RE.search(asset):
        return False
    if ETF_HINT_RE.search(asset) or STOCK_HINT_RE.search(asset) or MARKER_RE.search(asset):
        return True
    # Typed paper forms often list "Company Name TICKER" without Inc/Corp.
    if len(ticker) >= 1 and ticker.isalpha() and not BOND_RE.search(asset):
        return True
    return False


def asset_type_code(asset: str, marker: str | None) -> str:
    if marker in STOCK_CODES:
        return marker
    if ETF_HINT_RE.search(asset or ""):
        return "ET"
    return "ST"


def clean_asset_name(raw: str, ticker: str | None) -> str:
    name = re.sub(r"\s+", " ", (raw or "").strip())
    name = OWNER_PREFIX_RE.sub("", name).strip()
    name = MARKER_RE.sub("", name)
    name = re.sub(r"Provide full name.*$", "", name, flags=re.I)
    name = re.sub(r"\s+", " ", name).strip(" -:\t|")
    if ticker:
        name = re.sub(rf"\({re.escape(ticker)}\)", "", name, flags=re.I)
        name = re.sub(rf"(?:[\s\-–—]){re.escape(ticker)}\s*$", "", name).strip()
    return name or (ticker or "Unknown asset")


def format_amount(low: int, high: int | None) -> tuple[str, int, int | None]:
    if high is None:
        return f"${low:,}+", low, None
    return f"${low:,} - ${high:,}", low, high


def detect_amount_from_cells(cells: list[str]) -> tuple[int, int | None] | None:
    """Find a single checked amount band among trailing cells."""
    # Prefer cells that look like amount columns (often after dates).
    checked_idxs: list[int] = []
    for i, cell in enumerate(cells):
        if is_checked(cell):
            checked_idxs.append(i)
        # Band letter alone with check nearby is rare; also detect "A ... X"
        if re.match(r"^[A-J]\b", cell.strip(), re.I) and is_checked(cell):
            letter = cell.strip()[0].upper()
            for band, low, high in AMOUNT_BANDS:
                if band == letter:
                    return low, high

    # If exactly one trailing checked cell among last 10, map by position from end.
    trailing = cells[-12:] if len(cells) >= 12 else cells
    checks = [(i, c) for i, c in enumerate(trailing) if is_checked(c) and len(c) <= 4]
    if len(checks) == 1:
        # Heuristic: amount bands are the last 10 cells of a wide paper row.
        idx = checks[0][0]
        # Map from start of trailing window if window aligns to A..J
        if len(trailing) >= 10:
            band_offset = idx - (len(trailing) - 10)
            if 0 <= band_offset < 10:
                _letter, low, high = AMOUNT_BANDS[band_offset]
                return low, high
    return None


def extract_type_from_cells(cells: list[str]) -> str | None:
    """Infer Purchase/Sale from checkbox columns between asset and first date."""
    if not cells:
        return None

    asset_idx = None
    for i, cell in enumerate(cells):
        t = cell.strip()
        if len(t) >= 4 and sum(ch.isalpha() for ch in t) >= 4 and not NOISE_ASSET_RE.search(t):
            if not (parse_dates(t) and len(t) < 12):
                asset_idx = i
                break
    date_idx = None
    for i, cell in enumerate(cells):
        if parse_dates(cell):
            date_idx = i
            break
    if asset_idx is None or date_idx is None or date_idx <= asset_idx + 1:
        # Fall back: short cells before first date
        if date_idx is None:
            return None
        type_cells = [c for c in cells[:date_idx] if len(c.strip()) <= 8]
    else:
        type_cells = cells[asset_idx + 1 : date_idx]

    marks = [is_checked(c) for c in type_cells]
    if sum(marks) == 1:
        mi = marks.index(True)
        # Paper form order: Purchase | Sale | Exchange
        if len(type_cells) >= 3 and mi < 3:
            return ["Purchase", "Sale (Full)", "exchange"][mi]
        if mi == 0 and len(type_cells) == 1:
            return "Purchase"
        if len(type_cells) == 2:
            return "Purchase" if mi == 0 else "Sale (Full)"
        return ["Purchase", "Sale (Full)", "exchange"][min(mi, 2)]

    # Explicit words with a check in the same/next cell
    for i, cell in enumerate(type_cells):
        low = cell.lower()
        checked = is_checked(cell) or (i + 1 < len(type_cells) and is_checked(type_cells[i + 1]))
        if not checked:
            continue
        if "purchase" in low:
            return "Purchase"
        if "sale" in low:
            return "Sale (Full)"
        if "exchange" in low:
            return "exchange"
    return None


def find_asset_cell(cells: list[str]) -> str | None:
    for cell in cells:
        t = cell.strip()
        if len(t) < 4:
            continue
        if NOISE_ASSET_RE.search(t):
            continue
        if t.upper() in {"JT", "SP", "DC", "FILER"}:
            continue
        if parse_dates(t) and len(t) < 12:
            continue
        if re.fullmatch(r"[A-J]", t, re.I):
            continue
        # Prefer cells with letters
        if sum(ch.isalpha() for ch in t) >= 4:
            return t
    return None


def is_example_row(cells: list[str]) -> bool:
    joined = " ".join(cells).lower()
    return "example" in joined and "mega corp" in joined


def is_headerish_row(cells: list[str]) -> bool:
    joined = " ".join(cells).lower()
    if "full asset name" in joined and "transaction" in joined:
        return True
    if joined.count("date") >= 2 and "amount" in joined:
        return True
    return False


def parse_landscape_data_row(cells: list[str]) -> dict | None:
    if is_example_row(cells) or is_headerish_row(cells):
        return None
    asset = find_asset_cell(cells)
    if not asset:
        return None
    dates = []
    for cell in cells:
        dates.extend(parse_dates(cell))
    # Also search whole row
    if len(dates) < 1:
        dates = parse_dates(" ".join(cells))
    if len(dates) < 1:
        return None

    owner = "self"
    if cells and OWNER_PREFIX_RE.match(cells[0].strip()):
        owner = OWNER_MAP.get(cells[0].strip().upper()[:2], "self")
    elif OWNER_PREFIX_RE.match(asset):
        owner = OWNER_MAP.get(asset[:2].upper(), "self")

    marker_m = MARKER_RE.search(asset)
    marker = marker_m.group(1).upper() if marker_m else None
    ticker = extract_ticker(asset)
    tx_type = extract_type_from_cells(cells)
    amount = detect_amount_from_cells(cells)

    return {
        "asset_raw": asset,
        "ticker": ticker,
        "marker": marker,
        "type": tx_type,
        "tx_date": dates[0],
        "notif_date": dates[1] if len(dates) > 1 else None,
        "amount": amount,
        "owner": owner,
        "cells": cells,
    }


def parse_transposed_page(rows: list[list[str]]) -> list[dict]:
    """Recover per-column type/amount/dates from rotated page-2 style tables."""
    purchase_marks: list[bool] = []
    sale_marks: list[bool] = []
    amount_by_col: dict[int, tuple[int, int | None]] = {}
    tx_dates: list[str | None] = []
    notif_dates: list[str | None] = []
    assets: list[str | None] = []

    for row in rows:
        if not row:
            continue
        label = row[0].strip().lower()
        rest = row[1:]
        joined = " ".join(row).lower()

        if "purchase" in label or (label == "" and "purchase" in joined and "sale" not in label):
            if any(is_checked(c) for c in rest) or "purchase" in label:
                purchase_marks = [is_checked(c) for c in rest]
                continue
        if re.match(r"^sale\b", label) or label == "sale":
            sale_marks = [is_checked(c) for c in rest]
            continue

        # Amount band rows: label contains A/$1,000 etc.
        band_hit: tuple[int, int | None] | None = None
        head = row[0]
        # Prefer explicit letter tokens; A often appears as "$15,000 A $1,000-"
        for letter, low, high in reversed(AMOUNT_BANDS):  # J..A so "A" isn't false-positive in "Over"
            if re.search(rf"(?:^|[\s$]){letter}(?:\b|[\s$\-])", head, re.I):
                band_hit = (low, high)
                break
        if band_hit is None and re.search(r"\$\s*1,?000", head) and re.search(r"15,?000", head):
            band_hit = (AMOUNT_BANDS[0][1], AMOUNT_BANDS[0][2])
        if band_hit is not None and any(is_checked(c) for c in rest):
            for i, c in enumerate(rest):
                if is_checked(c):
                    amount_by_col[i] = band_hit

        if "notified" in joined and parse_dates(" ".join(rest)):
            notif_dates = []
            for c in rest:
                ds = parse_dates(c)
                notif_dates.append(ds[0] if ds else None)
            continue
        if ("trans" in label and "date" in joined) or (
            "action date" in joined and "notified" not in joined
        ):
            tx_dates = []
            for c in rest:
                ds = parse_dates(c)
                tx_dates.append(ds[0] if ds else None)
            continue

        if "full asset" in joined or "provide full name" in joined:
            assets = []
            for c in rest:
                t = c.strip()
                if len(t) >= 4 and sum(ch.isalpha() for ch in t) >= 4 and not NOISE_ASSET_RE.search(t):
                    assets.append(t)
                else:
                    assets.append(None)
            continue

    n = max(
        len(purchase_marks),
        len(sale_marks),
        len(tx_dates),
        len(notif_dates),
        len(assets),
        (max(amount_by_col.keys()) + 1) if amount_by_col else 0,
        0,
    )
    out: list[dict] = []
    for i in range(n):
        tx_type = None
        if i < len(purchase_marks) and purchase_marks[i]:
            tx_type = "Purchase"
        if i < len(sale_marks) and sale_marks[i]:
            tx_type = "Sale (Full)"
        amount = amount_by_col.get(i)
        asset = assets[i] if i < len(assets) else None
        tx_date = tx_dates[i] if i < len(tx_dates) else None
        notif = notif_dates[i] if i < len(notif_dates) else None
        if not any([tx_type, amount, asset, tx_date]):
            continue
        ticker = extract_ticker(asset) if asset else None
        marker_m = MARKER_RE.search(asset) if asset else None
        out.append(
            {
                "asset_raw": asset,
                "ticker": ticker,
                "marker": marker_m.group(1).upper() if marker_m else None,
                "type": tx_type,
                "tx_date": tx_date,
                "notif_date": notif,
                "amount": amount,
                "owner": "self",
                "col_index": i,
            }
        )
    return out


def merge_partial(base: dict, extra: dict) -> dict:
    out = dict(base)
    for k, v in extra.items():
        if k in {"cells", "col_index"}:
            continue
        if out.get(k) in (None, "", []):
            out[k] = v
    return out


def validate_and_build(
    partial: dict,
    member: str,
    filing_date: str,
    doc_id: str,
    index: int,
) -> dict | None:
    asset_raw = partial.get("asset_raw") or ""
    ticker = partial.get("ticker")
    marker = partial.get("marker")
    tx_type = partial.get("type")
    tx_date = partial.get("tx_date")
    notif = partial.get("notif_date")
    amount = partial.get("amount")
    owner = partial.get("owner") or "self"

    if not tx_type or tx_type not in {"Purchase", "Sale (Full)", "Sale (Partial)", "exchange"}:
        return None
    if not tx_date:
        return None
    # Notification date should not precede the trade by years (common OCR YY error).
    if notif and notif < tx_date:
        try:
            ty = int(tx_date[:4])
            ny = int(notif[:4])
            if ty - ny >= 2:
                notif = filing_date or tx_date
        except ValueError:
            notif = filing_date or tx_date
    if not amount or not isinstance(amount, tuple) or len(amount) != 2:
        return None
    low, high = amount
    if not isinstance(low, int) or low < 1:
        return None
    if high is not None and (not isinstance(high, int) or high < low):
        return None

    if not looks_like_stock_row(asset_raw, ticker, marker):
        return None
    if ticker is not None:
        if not re.fullmatch(r"[A-Z][A-Z0-9./\-$]{0,8}", ticker):
            return None

    code = asset_type_code(asset_raw, marker)
    amount_str, amin, amax = format_amount(low, high)
    asset_name = clean_asset_name(asset_raw, ticker)

    return {
        "politician": member,
        "transaction_date": tx_date,
        "filing_date": notif or filing_date or tx_date,
        "ticker": ticker,
        "asset_name": asset_name,
        "asset_type": ASSET_TYPE_MAP.get(code, "Stock"),
        "asset_type_code": code,
        "type": tx_type,
        "amount": amount_str,
        "amount_min": amin,
        "amount_max": amax,
        "owner": owner,
        "source_id": f"house_{doc_id}_paddle_{index}",
        "raw_json": {
            "source": "house",
            "doc_id": doc_id,
            "parser": "paddleocr-ppstructurev3",
            "asset_type_code": code,
            "asset_raw": asset_raw[:300],
        },
    }


def extract_member_from_texts(texts: list[str], fallback: str) -> str:
    for t in texts[:40]:
        m = re.search(r"NAME\s*:?\s*(.+)$", t, re.I)
        if m:
            name = m.group(1).strip(" :\t")
            if len(name) >= 4 and sum(c.isalpha() for c in name) >= 4:
                return name
    # Sometimes name is on its own line after NAME
    for i, t in enumerate(texts[:40]):
        if re.fullmatch(r"NAME\s*:?", t.strip(), re.I) and i + 1 < len(texts):
            cand = texts[i + 1].strip()
            if len(cand) >= 4 and "telephone" not in cand.lower():
                return cand
    return fallback or "Unknown"


def extract_ocr_words(result) -> list[dict]:
    try:
        ocr = result["overall_ocr_res"] or {}
    except Exception:
        return []
    texts = list(ocr.get("rec_texts") or [])
    boxes = ocr.get("rec_boxes")
    if boxes is None:
        return []
    out: list[dict] = []
    for i, text in enumerate(texts):
        if i >= len(boxes):
            break
        b = boxes[i]
        if hasattr(b, "tolist"):
            b = b.tolist()
        x1, y1, x2, y2 = [float(v) for v in b[:4]]
        out.append(
            {
                "text": str(text),
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "cx": (x1 + x2) / 2,
                "cy": (y1 + y2) / 2,
            }
        )
    return out


def page_image_gray(result):
    """Return grayscale ndarray aligned to OCR coordinates, or None."""
    try:
        import numpy as np
        from PIL import Image
    except Exception:
        return None

    img_info = None
    try:
        img_info = result.img if hasattr(result, "img") else None
    except Exception:
        img_info = None
    if not isinstance(img_info, dict):
        return None

    for key in ("preprocessed_img", "overall_ocr_res", "layout_det_res"):
        cand = img_info.get(key)
        if cand is None:
            continue
        try:
            if hasattr(cand, "shape"):
                arr = np.asarray(cand)
                if arr.ndim == 3:
                    # RGB/BGR
                    if arr.shape[2] >= 3:
                        gray = (0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]).astype(
                            "float32"
                        )
                        return gray
                if arr.ndim == 2:
                    return arr.astype("float32")
            if isinstance(cand, Image.Image):
                return np.asarray(cand.convert("L"), dtype="float32")
        except Exception:
            continue
    return None


def dark_ratio(gray, cx: float, cy: float, rad: int = 10) -> float:
    if gray is None:
        return 0.0
    h, w = gray.shape[:2]
    x = int(round(cx))
    y = int(round(cy))
    x1, x2 = max(0, x - rad), min(w, x + rad)
    y1, y2 = max(0, y - rad), min(h, y + rad)
    patch = gray[y1:y2, x1:x2]
    if patch.size == 0:
        return 0.0
    return float((patch < 145).mean())


def infer_column_xs(words: list[dict]) -> dict[str, float]:
    """Infer Purchase/Sale/Exchange and amount-band column centers from OCR headers."""
    cols: dict[str, float] = {}
    # Amount band letters near the amount header row
    letter_hits: dict[str, list[float]] = {b[0]: [] for b in AMOUNT_BANDS}
    for w in words:
        t = w["text"].strip()
        if re.fullmatch(r"[A-J]", t):
            letter_hits[t].append(w["cx"])
        if re.fullmatch(r"1", t) and 1400 > w["cx"] > 1300:
            # OCR often reads band I as "1"
            letter_hits["I"].append(w["cx"])
    for letter, xs in letter_hits.items():
        if xs:
            cols[letter] = sorted(xs)[len(xs) // 2]

    # Type headers
    for w in words:
        low = re.sub(r"[^a-z]", "", w["text"].lower())
        if low.startswith("purchase") or low == "purchas":
            cols.setdefault("purchase", w["cx"])
        elif low == "sale" or low.startswith("sale"):
            cols.setdefault("sale", w["cx"])
        elif low.startswith("exchange"):
            cols.setdefault("exchange", w["cx"])

    # Fallback type columns relative to first amount band / date columns
    date_xs = [w["cx"] for w in words if parse_dates(w["text"])]
    date_xs_sorted = sorted(date_xs)
    if "A" in cols:
        a_x = cols["A"]
        cols.setdefault("exchange", a_x - 220)
        cols.setdefault("sale", a_x - 280)
        cols.setdefault("purchase", a_x - 340)
    elif len(date_xs_sorted) >= 2:
        # Dates are typically left of amount bands
        mid = date_xs_sorted[len(date_xs_sorted) // 2]
        cols.setdefault("purchase", mid - 160)
        cols.setdefault("sale", mid - 110)
        cols.setdefault("exchange", mid - 60)

    # If only one of purchase/sale found, synthesize neighbors (~40-50px apart on these forms)
    if "sale" in cols and "purchase" not in cols:
        cols["purchase"] = cols["sale"] - 45
    if "purchase" in cols and "sale" not in cols:
        cols["sale"] = cols["purchase"] + 45
    if "sale" in cols and "exchange" not in cols:
        cols["exchange"] = cols["sale"] + 45

    # Synthesize missing amount letters from spacing
    known = [(k, cols[k]) for k in "ABCDEFGHIJ" if k in cols]
    if len(known) >= 2:
        known.sort(key=lambda kv: kv[1])
        gaps = [known[i + 1][1] - known[i][1] for i in range(len(known) - 1)]
        gap = sorted(gaps)[len(gaps) // 2]
        # Fill from A outward using first known
        base_letter, base_x = known[0]
        base_idx = "ABCDEFGHIJ".index(base_letter)
        for i, letter in enumerate("ABCDEFGHIJ"):
            cols.setdefault(letter, base_x + (i - base_idx) * gap)
    return cols


def cluster_word_rows(words: list[dict], y_tol: float = 14.0) -> list[list[dict]]:
    if not words:
        return []
    ordered = sorted(words, key=lambda w: (w["cy"], w["cx"]))
    rows: list[list[dict]] = []
    cur: list[dict] = []
    cur_y = None
    for w in ordered:
        if cur_y is None or abs(w["cy"] - cur_y) <= y_tol:
            cur.append(w)
            cur_y = w["cy"] if cur_y is None else (cur_y * 0.7 + w["cy"] * 0.3)
        else:
            rows.append(cur)
            cur = [w]
            cur_y = w["cy"]
    if cur:
        rows.append(cur)
    return rows


def parse_geometry_rows(words: list[dict], gray) -> list[dict]:
    """Build transaction partials from OCR word geometry + checkbox ink."""
    cols = infer_column_xs(words)
    partials: list[dict] = []
    for row_words in cluster_word_rows(words):
        texts = [w["text"] for w in row_words]
        joined = " ".join(texts)
        if is_example_row(texts) or "mega corp" in joined.lower():
            continue
        if NOISE_ASSET_RE.search(joined):
            continue

        dates: list[tuple[str, float]] = []
        for w in row_words:
            for d in parse_dates(w["text"]):
                dates.append((d, w["cx"]))
        if not dates:
            continue
        dates.sort(key=lambda t: t[1])
        tx_date = dates[0][0]
        notif = dates[1][0] if len(dates) > 1 else None

        # Asset = longest alpha-heavy token left of first date
        first_date_x = dates[0][1]
        asset_candidates = [
            w
            for w in row_words
            if w["cx"] < first_date_x - 20
            and sum(c.isalpha() for c in w["text"]) >= 4
            and not re.fullmatch(r"JT|SP|DC", w["text"].strip(), re.I)
            and not NOISE_ASSET_RE.search(w["text"])
        ]
        if not asset_candidates:
            continue
        asset_w = max(asset_candidates, key=lambda w: sum(c.isalpha() for c in w["text"]))
        asset = asset_w["text"].strip()
        row_y = asset_w["cy"]

        owner = "self"
        for w in row_words:
            if re.fullmatch(r"JT|SP|DC", w["text"].strip(), re.I):
                owner = OWNER_MAP.get(w["text"].strip().upper(), "self")
                break

        # Checkbox ink for type / amount
        tx_type = None
        type_scores = {
            "Purchase": dark_ratio(gray, cols["purchase"], row_y) if "purchase" in cols else 0.0,
            "Sale (Full)": dark_ratio(gray, cols["sale"], row_y) if "sale" in cols else 0.0,
            "exchange": dark_ratio(gray, cols["exchange"], row_y) if "exchange" in cols else 0.0,
        }
        # Also count OCR'd X marks near type columns
        for w in row_words:
            if not re.fullmatch(r"[Xx×√✓]", w["text"].strip()):
                continue
            for name, key in (("Purchase", "purchase"), ("Sale (Full)", "sale"), ("exchange", "exchange")):
                if key in cols and abs(w["cx"] - cols[key]) < 28 and abs(w["cy"] - row_y) < 22:
                    type_scores[name] = max(type_scores[name], 0.5)

        ranked_types = sorted(type_scores.items(), key=lambda kv: kv[1], reverse=True)
        # Prefer Purchase/Sale; Exchange is rare and grid lines often create false ink.
        ps = sorted(
            [("Purchase", type_scores["Purchase"]), ("Sale (Full)", type_scores["Sale (Full)"])],
            key=lambda kv: kv[1],
            reverse=True,
        )
        exch = type_scores["exchange"]
        if ps[0][1] >= 0.11 and ps[0][1] >= ps[1][1] + 0.015:
            tx_type = ps[0][0]
        elif exch >= 0.20 and exch >= ps[0][1] + 0.08:
            tx_type = "exchange"
        elif ranked_types and ranked_types[0][1] >= 0.18 and ranked_types[0][0] != "exchange":
            if len(ranked_types) == 1 or ranked_types[0][1] >= ranked_types[1][1] + 0.04:
                tx_type = ranked_types[0][0]

        amount = None
        amount_scores: list[tuple[float, tuple[int, int | None]]] = []
        for letter, low, high in AMOUNT_BANDS:
            if letter not in cols:
                continue
            score = dark_ratio(gray, cols[letter], row_y)
            for w in row_words:
                if re.fullmatch(r"[Xx×√✓]", w["text"].strip()) and abs(w["cx"] - cols[letter]) < 24:
                    score = max(score, 0.5)
            amount_scores.append((score, (low, high)))
        amount_scores.sort(key=lambda t: t[0], reverse=True)
        if amount_scores and amount_scores[0][0] >= 0.10:
            if len(amount_scores) == 1 or amount_scores[0][0] >= amount_scores[1][0] + 0.03:
                amount = amount_scores[0][1]

        marker_m = MARKER_RE.search(asset)
        partials.append(
            {
                "asset_raw": asset,
                "ticker": extract_ticker(asset),
                "marker": marker_m.group(1).upper() if marker_m else None,
                "type": tx_type,
                "tx_date": tx_date,
                "notif_date": notif,
                "amount": amount,
                "owner": owner,
                "row_y": row_y,
            }
        )
    return partials


def run_structure(pdf_path: Path) -> list[dict]:
    pipeline = get_pipeline()
    max_pages = int((__import__("os").environ.get("HOUSE_PADDLE_MAX_PAGES") or "12"))
    results = list(pipeline.predict(input=str(pdf_path)))
    if max_pages > 0:
        results = results[:max_pages]
    pages: list[dict] = []
    for r in results:
        texts = []
        try:
            ocr = r["overall_ocr_res"] or {}
            texts = list(ocr.get("rec_texts") or [])
        except Exception:
            texts = []
        tables = []
        try:
            for t in r.get("table_res_list") or []:
                html = t.get("pred_html") or ""
                tables.append(parse_html_table(html))
        except Exception:
            tables = []
        words = extract_ocr_words(r)
        gray = page_image_gray(r)
        # Fallback render via pypdfium when paddle img dict is unavailable
        if gray is None:
            try:
                import numpy as np
                import pypdfium2 as pdfium

                page_index = r["page_index"] if "page_index" in r else len(pages)
                doc = pdfium.PdfDocument(str(pdf_path))
                try:
                    pil = doc[page_index].render(scale=2).to_pil().convert("L")
                    gray = np.asarray(pil, dtype="float32")
                finally:
                    doc.close()
            except Exception:
                gray = None
        pages.append(
            {
                "texts": texts,
                "tables": tables,
                "words": words,
                "gray": gray,
            }
        )
    return pages


def reconstruct_transactions(
    pages: list[dict],
    member: str,
    filing_date: str,
    doc_id: str,
) -> tuple[list[dict], dict]:
    geometry: list[dict] = []
    landscape: list[dict] = []
    rejected = 0

    for page in pages:
        geometry.extend(parse_geometry_rows(page.get("words") or [], page.get("gray")))
        for table in page.get("tables") or []:
            labels = " ".join((row[0] if row else "") for row in table[:20]).lower()
            # Skip clearly vertical/misoriented amount-axis tables; geometry path is better.
            if labels.count("purchase") + labels.count("sale") >= 1 and "full asset" not in labels:
                continue
            for row in table:
                partial = parse_landscape_data_row(row)
                if partial:
                    landscape.append(partial)

    # Prefer geometry rows; fill gaps from landscape table cells by ticker/date.
    merged: list[dict] = []
    if geometry:
        for geo in geometry:
            best = geo
            for land in landscape:
                if geo.get("tx_date") and land.get("tx_date") == geo.get("tx_date"):
                    if (geo.get("ticker") and land.get("ticker") == geo.get("ticker")) or (
                        geo.get("asset_raw")
                        and land.get("asset_raw")
                        and geo["asset_raw"][:20] == land["asset_raw"][:20]
                    ):
                        best = merge_partial(geo, land)
                        break
            merged.append(best)
        # Landscape-only assets not seen in geometry
        geo_keys = {
            (g.get("ticker"), g.get("tx_date"), (g.get("asset_raw") or "")[:24]) for g in geometry
        }
        for land in landscape:
            key = (land.get("ticker"), land.get("tx_date"), (land.get("asset_raw") or "")[:24])
            if key not in geo_keys:
                merged.append(land)
    else:
        merged = landscape

    txs: list[dict] = []
    seen: set[tuple] = set()
    for partial in merged:
        row = validate_and_build(partial, member, filing_date, doc_id, len(txs))
        if not row:
            rejected += 1
            continue
        key = (
            row.get("ticker"),
            row.get("transaction_date"),
            row.get("type"),
            row.get("amount"),
            row.get("asset_name"),
        )
        if key in seen:
            continue
        seen.add(key)
        txs.append(row)

    stats = {
        "geometry_candidates": len(geometry),
        "landscape_candidates": len(landscape),
        "rejected_invalid": rejected,
        "accepted": len(txs),
    }
    return txs, stats


def parse_pdf(
    pdf_path: Path,
    filing_date: str | None = None,
    doc_id: str | None = None,
    member_hint: str | None = None,
) -> dict:
    filing_date = filing_date or ""
    doc = doc_id or pdf_path.stem
    try:
        pages = run_structure(pdf_path)
    except Exception as exc:
        return {
            "ok": False,
            "member": member_hint or "Unknown",
            "doc_id": doc,
            "transactions": [],
            "expected_stock_count": 0,
            "parsed_stock_count": 0,
            "has_extractable_text": False,
            "error": f"paddleocr_failed: {exc}",
            "parser": "paddleocr-ppstructurev3",
        }

    all_texts: list[str] = []
    for p in pages:
        all_texts.extend(p.get("texts") or [])
    member = extract_member_from_texts(all_texts, member_hint or "Unknown")

    transactions, stats = reconstruct_transactions(pages, member, filing_date, doc)
    parsed_stock = sum(1 for t in transactions if t.get("asset_type_code") in STOCK_CODES)

    return {
        "ok": parsed_stock > 0,
        "member": member,
        "doc_id": doc,
        "transactions": transactions,
        "expected_stock_count": parsed_stock,
        "parsed_stock_count": parsed_stock,
        "has_extractable_text": False,
        "error": None if parsed_stock > 0 else "no_validated_stock_rows",
        "parser": "paddleocr-ppstructurev3",
        "paddle_stats": stats,
        "page_count": len(pages),
    }


def main() -> int:
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "usage: house_ptr_paddleocr.py <pdf> [filing_date] [doc_id] [member]",
                }
            )
        )
        return 2
    pdf = Path(sys.argv[1])
    filing_date = sys.argv[2] if len(sys.argv) > 2 else None
    doc_id = sys.argv[3] if len(sys.argv) > 3 else None
    member = sys.argv[4] if len(sys.argv) > 4 else None
    if not pdf.exists():
        print(json.dumps({"ok": False, "error": f"missing pdf: {pdf}"}))
        return 1
    result = parse_pdf(pdf, filing_date=filing_date, doc_id=doc_id, member_hint=member)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
