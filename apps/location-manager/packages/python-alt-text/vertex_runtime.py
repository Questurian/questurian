"""Environment loading and lazy Vertex initialization.

The model constants that used to live here are gone. Which model each job runs
on is the model gateway's answer now, taken from the dashboard's table and
falling back to the gateway's own registry -- see `generation.py`. The three
environment variables that pinned them still work exactly as they did; the
gateway reads them (`model_gateway.settings.LEGACY_ENV_OVERRIDES`), and a job
pinned that way still ignores the dashboard.

Leaving the constants here would have been worse than deleting them: they
would have read as the authority while deciding nothing, which is the precise
failure that let this service sit on 2.5 Pro through a sweep that moved
everything else.
"""

import logging
import os
import threading
from pathlib import Path

from vertexai import init as vertex_init


logger = logging.getLogger("vertex_alt_text")

DEFAULT_LOCATION = "us-central1"


def load_local_env_files() -> None:
    """Load repo env files when launched without exported shell vars."""
    service_dir = Path(__file__).resolve().parent
    repo_root = service_dir.parent.parent
    candidate_files = [
        repo_root / ".env",
        repo_root / "packages" / "server" / ".env",
        service_dir / ".env",
    ]
    for env_file in candidate_files:
        if not env_file.exists():
            continue
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key or key in os.environ:
                continue
            os.environ[key] = value.strip().strip('"').strip("'")


load_local_env_files()

_vertex_initialized = False
_vertex_init_lock = threading.Lock()


def ensure_vertex_initialized() -> None:
    global _vertex_initialized
    if _vertex_initialized:
        return
    with _vertex_init_lock:
        if _vertex_initialized:
            return
        project = (os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
        if not project:
            raise RuntimeError("GOOGLE_CLOUD_PROJECT environment variable is required.")
        location = (
            os.getenv("GOOGLE_CLOUD_LOCATION") or DEFAULT_LOCATION
        ).strip() or DEFAULT_LOCATION
        vertex_init(project=project, location=location)
        _vertex_initialized = True
        logger.info(
            "Vertex AI initialized (project=%s, location=%s)", project, location
        )
