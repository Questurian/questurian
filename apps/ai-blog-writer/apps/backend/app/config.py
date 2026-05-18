import os
from pathlib import Path

PIPELINE_VERSION = os.getenv("PIPELINE_VERSION", "0.1.0")
_DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "data"
DATA_DIR = Path(os.getenv("DATA_DIR", str(_DEFAULT_DATA_DIR)))
DB_PATH = DATA_DIR / "pipeline.db"
WEAVIATE_URL = os.getenv("WEAVIATE_URL", "http://localhost:8080")
LM_API_URL = os.getenv("LM_API_URL", "http://localhost:4002")

# Markdown article-type guidelines live under apps/backend/data/guidelines.
# DATA_DIR is the app-root data folder (pipeline.db), not backend package data.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_ARTICLE_GUIDELINES_DIR = _BACKEND_ROOT / "data" / "guidelines"
ARTICLE_GUIDELINES_DIR = Path(
    os.getenv("ARTICLE_GUIDELINES_DIR", str(_DEFAULT_ARTICLE_GUIDELINES_DIR))
)
