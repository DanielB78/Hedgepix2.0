# Local NAICS sector classification (BGE-small)

Uses `BAAI/bge-small-en-v1.5` via `sentence-transformers` (384-d embeddings).

Official US Census **2022 NAICS** industry templates (5-digit codes, ~690
labels) live under `naics/`. Each template embeds:

```
<code>
<industry name>
<description>
```

Vectors are cached under `cache/naics_embeddings.npz` so they are not recomputed
on every refresh.

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
PYTHONPATH=. python -m sector_classify.cli build-templates
PYTHONPATH=. python -m sector_classify.cli build-cache
```

The Census workbook is stored at `naics/2022_NAICS_Descriptions.xlsx` (downloaded
automatically if missing). The model downloads into the Hugging Face cache on
first use, then reuses the local copy.

## Classify titles

JSON array on stdin → JSON array on stdout (top 3 NAICS matches):

```bash
echo '[{"id":"a","title":"Chipmakers raise GPU prices"}]' \
  | PYTHONPATH=. .venv/bin/python -m sector_classify.cli classify
```

## Integration

The Node updater (`npm run update-data`) calls this CLI after fetching GDELT
titles and stores top-3 NAICS matches on `news_articles`, then deletes articles
older than 3 days (`published_at`).

If Python/deps are missing, news ingestion still succeeds without labels.
