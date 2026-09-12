"""BGE-small NAICS sector classification helpers (local only)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBED_DIM = 384
TOP_N = 3

ROOT = Path(__file__).resolve().parent
NAICS_DIR = ROOT / "naics"
TEMPLATES_PATH = NAICS_DIR / "templates.json"
CACHE_DIR = ROOT / "cache"
CACHE_PATH = CACHE_DIR / "naics_embeddings.npz"

_model = None


def load_templates() -> list[dict[str, str]]:
  if not TEMPLATES_PATH.exists():
    from .build_naics_templates import main as build_main

    build_main([])
  with TEMPLATES_PATH.open(encoding="utf-8") as f:
    data = json.load(f)
  templates = data.get("templates") if isinstance(data, dict) else None
  if not isinstance(templates, list) or not templates:
    raise ValueError(f"Invalid NAICS templates file: {TEMPLATES_PATH}")
  out: list[dict[str, str]] = []
  for row in templates:
    if not isinstance(row, dict):
      continue
    code = str(row.get("code") or "").strip()
    name = str(row.get("name") or "").strip()
    description = str(row.get("description") or "").strip()
    template_text = str(row.get("template_text") or "").strip()
    if not template_text:
      template_text = f"{code}\n{name}\n{description}".strip()
    if code and name and template_text:
      out.append(
        {
          "code": code,
          "name": name,
          "description": description,
          "template_text": template_text,
        }
      )
  if not out:
    raise ValueError("No NAICS templates found")
  return out


def get_model():
  """Load sentence-transformers model (downloads once into HF cache)."""
  global _model
  if _model is None:
    from sentence_transformers import SentenceTransformer

    _model = SentenceTransformer(MODEL_NAME)
  return _model


def _l2_normalize(matrix: np.ndarray) -> np.ndarray:
  norms = np.linalg.norm(matrix, axis=1, keepdims=True)
  norms = np.maximum(norms, 1e-12)
  return matrix / norms


def embed_texts(texts: list[str]) -> np.ndarray:
  model = get_model()
  vectors = model.encode(
    texts,
    normalize_embeddings=True,
    show_progress_bar=False,
  )
  arr = np.asarray(vectors, dtype=np.float32)
  if arr.ndim != 2 or arr.shape[1] != EMBED_DIM:
    raise RuntimeError(
      f"Expected (*, {EMBED_DIM}) embeddings, got shape {arr.shape}"
    )
  return arr


def build_prototype_cache(force: bool = False) -> Path:
  """Embed NAICS templates once and cache vectors on disk."""
  CACHE_DIR.mkdir(parents=True, exist_ok=True)
  if CACHE_PATH.exists() and not force:
    return CACHE_PATH

  templates = load_templates()
  texts = [t["template_text"] for t in templates]
  codes = [t["code"] for t in templates]
  names = [t["name"] for t in templates]
  vectors = embed_texts(texts)
  np.savez_compressed(
    CACHE_PATH,
    vectors=vectors,
    codes=np.asarray(codes),
    names=np.asarray(names),
    model=np.asarray(MODEL_NAME),
    dim=np.asarray(EMBED_DIM),
  )
  return CACHE_PATH


def load_prototype_cache() -> dict[str, Any]:
  if not CACHE_PATH.exists():
    build_prototype_cache(force=True)
  data = np.load(CACHE_PATH, allow_pickle=False)
  vectors = np.asarray(data["vectors"], dtype=np.float32)
  codes = [str(c) for c in data["codes"].tolist()]
  names = [str(n) for n in data["names"].tolist()]
  if vectors.shape[1] != EMBED_DIM:
    raise RuntimeError(
      f"Cached embeddings dim {vectors.shape[1]} != {EMBED_DIM}; rebuild cache"
    )
  if len(codes) != vectors.shape[0] or len(names) != vectors.shape[0]:
    raise RuntimeError("NAICS cache length mismatch; rebuild cache")
  return {
    "vectors": _l2_normalize(vectors),
    "codes": codes,
    "names": names,
  }


def top_matches_for_vector(
  title_vec: np.ndarray,
  cache: dict[str, Any],
  top_n: int = TOP_N,
) -> list[dict[str, Any]]:
  sims = cache["vectors"] @ title_vec.astype(np.float32)
  order = np.argsort(-sims)[: max(1, top_n)]
  matches: list[dict[str, Any]] = []
  for idx in order.tolist():
    matches.append(
      {
        "code": cache["codes"][idx],
        "name": cache["names"][idx],
        "score": round(float(sims[idx]), 6),
      }
    )
  return matches


def classify_titles(
  items: list[tuple[str, str]],
  top_n: int = TOP_N,
) -> list[dict[str, Any]]:
  """Classify (id, title) pairs.

  Returns:
    [{
      id,
      sector, sector_score, sector_code,   # best match (compat)
      sectors: [{code, name, score}, ...]  # top N
    }, ...]
  """
  if not items:
    return []
  cache = load_prototype_cache()
  titles = [title for _, title in items]
  title_vecs = embed_texts(titles)
  out: list[dict[str, Any]] = []
  for (item_id, _title), vec in zip(items, title_vecs):
    matches = top_matches_for_vector(vec, cache, top_n=top_n)
    best = matches[0] if matches else None
    out.append(
      {
        "id": item_id,
        "sector": best["name"] if best else "",
        "sector_code": best["code"] if best else "",
        "sector_score": best["score"] if best else 0.0,
        "sectors": matches,
      }
    )
  return out
