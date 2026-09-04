#!/usr/bin/env python3
"""Test PaddleOCR House PTR parsing on the known 2026 scanned filings."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import house_ptr_paddleocr as paddle  # noqa: E402

SCANS_DIR = Path("/tmp/scans2026")
LIST_PATH = Path("/opt/cursor/artifacts/scanned_2026_filings.json")
OUT_PATH = Path("/opt/cursor/artifacts/paddleocr_2026_scan_report.json")


def main() -> int:
    filings = json.loads(LIST_PATH.read_text())
    report = {
        "scanned_filings_tested": 0,
        "filings_successfully_parsed": 0,
        "stock_rows_recovered": 0,
        "filings_still_unparseable": 0,
        "errors": 0,
        "elapsed_sec": 0.0,
        "results": [],
        "sample_rows": [],
        "garbled_or_suspicious": [],
    }
    t0 = time.time()

    for i, f in enumerate(filings):
        doc_id = str(f["doc_id"])
        pdf = SCANS_DIR / f"{doc_id}.pdf"
        report["scanned_filings_tested"] += 1
        print(f"[{i+1}/{len(filings)}] {doc_id} {f.get('member')} …", flush=True)
        if not pdf.exists():
            report["errors"] += 1
            report["filings_still_unparseable"] += 1
            report["results"].append(
                {
                    "doc_id": doc_id,
                    "member": f.get("member"),
                    "ok": False,
                    "error": "missing_pdf",
                    "parsed_stock_count": 0,
                }
            )
            continue
        try:
            result = paddle.parse_pdf(
                pdf,
                filing_date=f.get("filing_date"),
                doc_id=doc_id,
                member_hint=f.get("member"),
            )
        except Exception as exc:
            report["errors"] += 1
            report["filings_still_unparseable"] += 1
            report["results"].append(
                {
                    "doc_id": doc_id,
                    "member": f.get("member"),
                    "ok": False,
                    "error": str(exc),
                    "parsed_stock_count": 0,
                }
            )
            print(f"  ERROR {exc}", flush=True)
            continue

        n = int(result.get("parsed_stock_count") or 0)
        entry = {
            "doc_id": doc_id,
            "member": result.get("member") or f.get("member"),
            "ok": bool(result.get("ok")),
            "parsed_stock_count": n,
            "error": result.get("error"),
            "paddle_stats": result.get("paddle_stats"),
            "transactions": result.get("transactions") or [],
        }
        report["results"].append(entry)
        if n > 0:
            report["filings_successfully_parsed"] += 1
            report["stock_rows_recovered"] += n
            for tx in entry["transactions"][:5]:
                report["sample_rows"].append({"doc_id": doc_id, **{k: tx.get(k) for k in (
                    "ticker", "asset_name", "type", "transaction_date", "filing_date", "amount"
                )}})
                # Heuristic garbled flags for manual review
                name = str(tx.get("asset_name") or "")
                if sum(ch.isalpha() for ch in name) < max(3, len(name) // 3) or "□" in name:
                    report["garbled_or_suspicious"].append({"doc_id": doc_id, "tx": tx})
            print(f"  OK {n} stock rows", flush=True)
        else:
            report["filings_still_unparseable"] += 1
            print(f"  unparseable ({result.get('error')})", flush=True)

    report["elapsed_sec"] = round(time.time() - t0, 1)
    # Compact results for summary file (drop full txs in results list copy)
    slim = dict(report)
    slim["results"] = [
        {k: v for k, v in r.items() if k != "transactions"} | {
            "transaction_preview": [
                {
                    "ticker": t.get("ticker"),
                    "asset_name": t.get("asset_name"),
                    "type": t.get("type"),
                    "transaction_date": t.get("transaction_date"),
                    "amount": t.get("amount"),
                }
                for t in (r.get("transactions") or [])[:8]
            ]
        }
        for r in report["results"]
    ]
    OUT_PATH.write_text(json.dumps(slim, indent=2, ensure_ascii=False))
    print("\n=== SUMMARY ===")
    print(json.dumps({k: slim[k] for k in [
        "scanned_filings_tested",
        "filings_successfully_parsed",
        "stock_rows_recovered",
        "filings_still_unparseable",
        "errors",
        "elapsed_sec",
    ]}, indent=2))
    print(f"Wrote {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
