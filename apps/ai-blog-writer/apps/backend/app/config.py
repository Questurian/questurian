import os
from pathlib import Path

PIPELINE_VERSION = os.getenv("PIPELINE_VERSION", "0.1.0")
_DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "data"
DATA_DIR = Path(os.getenv("DATA_DIR", str(_DEFAULT_DATA_DIR)))
DB_PATH = DATA_DIR / "pipeline.db"
WEAVIATE_URL = os.getenv("WEAVIATE_URL", "http://localhost:8080")
