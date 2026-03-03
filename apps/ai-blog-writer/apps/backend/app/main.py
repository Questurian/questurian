import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[3]


def _load_local_env_file() -> None:
    """Load apps/backend/.env into process env if present."""
    env_path = ROOT / "apps/backend/.env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        # Respect shell-provided env vars over .env defaults.
        os.environ.setdefault(key, value.strip())


_load_local_env_file()

for rel_path in ("packages/shared/src", "packages/utils/src"):
    path = str(ROOT / rel_path)
    if path not in sys.path:
        sys.path.append(path)

from app.api import router  # noqa: E402

app = FastAPI(title="AI Blog Writer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(router)
