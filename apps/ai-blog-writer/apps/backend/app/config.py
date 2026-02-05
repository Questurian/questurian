import os
from pathlib import Path

PIPELINE_VERSION = os.getenv("PIPELINE_VERSION", "0.1.0")
DATA_DIR = Path(os.getenv("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "pipeline.db"
WEAVIATE_URL = os.getenv("WEAVIATE_URL", "http://localhost:8080")
