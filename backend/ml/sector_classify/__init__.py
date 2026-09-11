"""Local BGE-small sector classifier for GDELT news titles."""

from .classify import (
  MODEL_NAME,
  build_prototype_cache,
  classify_titles,
  load_prototype_cache,
  load_sectors,
)

__all__ = [
  "MODEL_NAME",
  "build_prototype_cache",
  "classify_titles",
  "load_prototype_cache",
  "load_sectors",
]
