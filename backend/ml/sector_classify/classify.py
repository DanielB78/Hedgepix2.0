"""BGE-small sector classification helpers (local only)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBED_DIM = 384
# Average the top-K prototype similarities within each sector.
TOP_K = 3

ROOT = Path(__file__).resolve().parent
SECTORS_PATH = ROOT / "sectors.json"
CACHE_DIR = ROOT / "cache"
CACHE_PATH = CACHE_DIR / "prototype_embeddings.npz"

_model = None


def load_sectors() -> dict[str, list[str]]:
  with SECTORS_PATH.open(encoding="utf-8") as f:
    data = json.load(f)
  if not isinstance(data, dict) or not data:
    raise ValueError(f"Invalid sectors file: {SECTORS_PATH}")
  out: dict[str, list[str]] = {}
  for sector, phrases in data.items():
    cleaned = [str(p).strip() for p in phrases if str(p).strip()]
    if cleaned:
      out[str(sector)] = cleaned
  if not out:
    raise ValueError("No sector prototypes found")
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
  # normalize_embeddings=True yields unit vectors for cosine via dot product.
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
  CACHE_DIR.mkdir(parents=True, exist_ok=True)
  if CACHE_PATH.exists() and not force:
    return CACHE_PATH

  sectors = load_sectors()
  sector_names: list[str] = []
  phrases: list[str] = []
  for sector, protos in sectors.items():
    for phrase in protos:
      sector_names.append(sector)
      phrases.append(phrase)

  vectors = embed_texts(phrases)
  np.savez_compressed(
    CACHE_PATH,
    vectors=vectors,
    sectors=np.asarray(sector_names),
    phrases=np.asarray(phrases),
    model=np.asarray(MODEL_NAME),
    dim=np.asarray(EMBED_DIM),
  )
  return CACHE_PATH


def load_prototype_cache() -> dict[str, Any]:
  if not CACHE_PATH.exists():
    build_prototype_cache(force=True)
  data = np.load(CACHE_PATH, allow_pickle=False)
  vectors = np.asarray(data["vectors"], dtype=np.float32)
  sectors = [str(s) for s in data["sectors"].tolist()]
  phrases = [str(p) for p in data["phrases"].tolist()]
  if vectors.shape[1] != EMBED_DIM:
    raise RuntimeError(
      f"Cached embeddings dim {vectors.shape[1]} != {EMBED_DIM}; rebuild cache"
    )
  return {
    "vectors": _l2_normalize(vectors),
    "sectors": sectors,
    "phrases": phrases,
  }


def score_title_against_prototypes(
  title_vec: np.ndarray,
  cache: dict[str, Any],
  top_k: int = TOP_K,
) -> tuple[str, float]:
  """Return (best_sector, score) using mean of top-K prototype cosines."""
  sims = cache["vectors"] @ title_vec.astype(np.float32)
  by_sector: dict[str, list[float]] = {}
  for sector, score in zip(cache["sectors"], sims.tolist()):
    by_sector.setdefault(sector, []).append(float(score))

  best_sector = ""
  best_score = float("-inf")
  for sector, scores in by_sector.items():
    scores.sort(reverse=True)
    k = max(1, min(top_k, len(scores)))
    agg = float(sum(scores[:k]) / k)
    if agg > best_score:
      best_score = agg
      best_sector = sector
  return best_sector, best_score


def classify_titles(
  items: list[tuple[str, str]],
  top_k: int = TOP_K,
) -> list[dict[str, Any]]:
  """Classify (id, title) pairs. Returns [{id, sector, sector_score}, ...]."""
  if not items:
    return []
  cache = load_prototype_cache()
  titles = [title for _, title in items]
  title_vecs = embed_texts(titles)
  out: list[dict[str, Any]] = []
  for (item_id, _title), vec in zip(items, title_vecs):
    sector, score = score_title_against_prototypes(vec, cache, top_k=top_k)
    out.append(
      {
        "id": item_id,
        "sector": sector,
        "sector_score": round(float(score), 6),
      }
    )
  return out
