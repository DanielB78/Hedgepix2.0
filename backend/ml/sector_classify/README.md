# Local sector classification (BGE-small)

Uses `BAAI/bge-small-en-v1.5` via `sentence-transformers` (384-d embeddings).

Prototype phrases live in `sectors.json`. Their vectors are cached under `cache/`
so they are not recomputed on every run.

## Setup (once per machine)

```bash
cd backend
npm run setup:sector-classify
```

Or manually:

```bash
cd backend/ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r sector_classify/requirements.txt
PYTHONPATH=. python -m sector_classify.cli build-cache
```

The model downloads into the Hugging Face cache on first use, then reuses the local copy.

## Classify titles

JSON array on stdin → JSON array on stdout:

```bash
echo '[{"id":"a","title":"Chipmakers raise GPU prices"}]' \
  | PYTHONPATH=. .venv/bin/python -m sector_classify.cli classify
```

## Integration

The Node updater (`npm run update-data`) calls this CLI after fetching GDELT
titles and stores `sector` + `sector_score` on `news_articles`.

If Python/deps are missing, news ingestion still succeeds without labels.
