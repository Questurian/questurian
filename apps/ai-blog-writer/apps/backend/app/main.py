import os
import sys
import logging
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
logger = logging.getLogger(__name__)


def _read_bool_env(key: str, default: bool = False) -> bool:
    raw = os.getenv(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def handle_unexpected_exception(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    error_id = str(uuid4())
    logger.exception(
        "Unhandled API exception | error_id=%s method=%s path=%s",
        error_id,
        request.method,
        request.url.path,
    )

    expose_details = _read_bool_env("API_EXPOSE_ERROR_DETAILS", default=False)
    detail = str(exc) if expose_details else "Internal server error"
    response_headers: dict[str, str] = {}
    origin = request.headers.get("origin")
    if origin:
        # Ensure browser clients can read error payloads for unhandled exceptions.
        response_headers["Access-Control-Allow-Origin"] = origin
        response_headers["Access-Control-Allow-Credentials"] = "true"
        response_headers["Vary"] = "Origin"
    return JSONResponse(
        status_code=500,
        headers=response_headers,
        content={"detail": detail, "error_id": error_id},
    )


app.include_router(router)
