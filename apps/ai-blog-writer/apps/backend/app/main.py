import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[3]
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
