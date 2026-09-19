#!/usr/bin/env python3
"""Embed unique congress + ticker industry labels with BAAI/bge-small-en-v1.5."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "ml"))

from sector_classify.classify import MODEL_NAME, embed_texts  # noqa: E402

EXPOSURE = ROOT / "data" / "congress-sector" / "congress_member_sector_exposure.json"
TICKER_LABELS = ROOT / "src" / "data" / "tickerIndustryLabels.json"


def normalize_label(label: str) -> str:
  return " ".join(str(label).strip().lower().split())


def main() -> None:
  congress_labels: set[str] = set()
  exposure = json.loads(EXPOSURE.read_text(encoding="utf-8"))
  for member in exposure.get("members") or []:
    for label in member.get("industry_labels") or []:
      if label and str(label).strip():
        congress_labels.add(str(label).strip())

  ticker_labels: set[str] = set()
  tickers = json.loads(TICKER_LABELS.read_text(encoding="utf-8"))
  for row in tickers.values():
    primary = (row or {}).get("primary_industry")
    if primary:
      ticker_labels.add(str(primary).strip())
    for label in (row or {}).get("industries") or []:
      if label:
        ticker_labels.add(str(label).strip())

  # Prefer original casing from first seen; key by normalized.
  by_norm: dict[str, tuple[str, str]] = {}
  for label in sorted(congress_labels):
    by_norm.setdefault(normalize_label(label), (label, "congress"))
  for label in sorted(ticker_labels):
    by_norm.setdefault(normalize_label(label), (label, "ticker"))

  items = sorted(by_norm.items(), key=lambda x: x[0])
  texts = [orig for _, (orig, _) in items]
  print(f"Embedding {len(texts)} unique labels with {MODEL_NAME}…")
  vectors = embed_texts(texts)

  rows = []
  now = datetime.now(timezone.utc).isoformat()
  for i, (norm, (orig, source)) in enumerate(items):
    rows.append(
      {
        "normalized_label": norm,
        "label": orig,
        "label_source": source,
        "embedding": vectors[i].tolist(),
        "model_id": MODEL_NAME,
        "updated_at": now,
      }
    )

  out_path = ROOT / "data" / "congress-sector" / "sector_label_embeddings.json"
  out_path.write_text(json.dumps(rows), encoding="utf-8")
  print(f"Wrote {out_path} ({len(rows)} rows)")

  url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
  key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
  if not url or not key:
    print("No SUPABASE_URL/SERVICE_ROLE_KEY — skipped DB upsert")
    return

  # Prefer psycopg via DATABASE_URL if present; else PostgREST REST.
  database_url = os.environ.get("DATABASE_URL")
  if database_url:
    import psycopg

    with psycopg.connect(database_url) as conn:
      with conn.cursor() as cur:
        for row in rows:
          cur.execute(
            """
            insert into sector_label_embeddings
              (normalized_label, label, label_source, embedding, model_id, updated_at)
            values (%s,%s,%s,%s::jsonb,%s,%s)
            on conflict (normalized_label) do update set
              label = excluded.label,
              label_source = excluded.label_source,
              embedding = excluded.embedding,
              model_id = excluded.model_id,
              updated_at = excluded.updated_at
            """,
            (
              row["normalized_label"],
              row["label"],
              row["label_source"],
              json.dumps(row["embedding"]),
              row["model_id"],
              row["updated_at"],
            ),
          )
      conn.commit()
    print(f"Upserted {len(rows)} embeddings via DATABASE_URL")
    return

  import urllib.request

  # Chunked PostgREST upsert
  endpoint = url.rstrip("/") + "/rest/v1/sector_label_embeddings"
  for i in range(0, len(rows), 100):
    chunk = rows[i : i + 100]
    req = urllib.request.Request(
      endpoint,
      data=json.dumps(chunk).encode("utf-8"),
      method="POST",
      headers={
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates",
      },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
      resp.read()
  print(f"Upserted {len(rows)} embeddings via PostgREST")


if __name__ == "__main__":
  main()
