import hmac
import os
import sys
import logging
from logging.handlers import RotatingFileHandler
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator
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


# Where the model table and the usage collector live when nobody says
# otherwise. Everything in this repo runs on one machine, and a backend that
# only reads the dashboard when someone remembers to export a variable is a
# backend that does not read it -- which is exactly what happened here:
# Location Manager was wired and this was not, so the Models tab appeared to
# change all 39 of this app's jobs and silently changed none of them.
#
# Both fail soft. An unreachable dashboard leaves the gateway on the models
# checked into the registry and drops usage events on the floor.
DEFAULT_DASHBOARD = "http://localhost:4500"
os.environ.setdefault(
    "MODEL_GATEWAY_SETTINGS_URL", f"{DEFAULT_DASHBOARD}/api/settings/v1/models"
)
os.environ.setdefault("USAGE_MONITOR_URL", f"{DEFAULT_DASHBOARD}/api/usage/v1/events")

for rel_path in ("packages/shared/src", "packages/utils/src"):
    path = str(ROOT / rel_path)
    if path not in sys.path:
        sys.path.append(path)

from app.api import router  # noqa: E402
from app.core import fail_stale_runs  # noqa: E402
from app.core.staff_auth import staff_auth_required  # noqa: E402

logger = logging.getLogger(__name__)


def _configure_error_file_logging() -> Path:
    """Persist backend errors that would otherwise exist only in terminal scrollback."""
    log_path = Path(
        os.getenv("ABW_ERROR_LOG_PATH", ROOT / "logs/backend-errors.log")
    ).expanduser()
    log_path.parent.mkdir(parents=True, exist_ok=True)

    root_logger = logging.getLogger()
    resolved_path = log_path.resolve()
    for existing_handler in root_logger.handlers:
        if getattr(existing_handler, "_abw_error_log_path", None) == resolved_path:
            return log_path

    handler = RotatingFileHandler(
        log_path,
        maxBytes=2 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    handler.setLevel(logging.ERROR)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    handler._abw_error_log_path = resolved_path  # type: ignore[attr-defined]
    root_logger.addHandler(handler)
    return log_path


ERROR_LOG_PATH = _configure_error_file_logging()

# Paths reachable without an API key when ABW_API_KEY is set.
AUTH_EXEMPT_PATHS = {"/health"}
API_KEY_HEADER = "X-API-Key"

# The origin allowlist lives in app.core.cors so that request authentication can
# read it without importing this module. Re-exported here because that is where
# it used to live. `CORS_DENY_ALL` is the explicit ABW_ALLOWED_ORIGINS value
# meaning "this instance has no browser client", as distinct from the variable
# being forgotten.
from app.core.cors import (  # noqa: E402,F401
    CORS_DENY_ALL as CORS_DENY_ALL,
    resolve_cors_config as resolve_cors_config,
    resolve_cors_origins as resolve_cors_origins,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Refuse to serve a misconfigured origin policy. This runs here rather
    # than at import so the failure reaches the error log configured above
    # instead of only stderr, and so importing this module (tests, tooling)
    # never explodes on a half-configured local .env.
    if _cors_config_error is not None:
        logger.error(
            "Refusing to start: %s", _cors_config_error, exc_info=_cors_config_error
        )
        raise _cors_config_error

    if not staff_auth_required():
        logger.warning(
            "ABW_REQUIRE_STAFF_AUTH is disabled; costly and destructive "
            "routes are not protected by verified staff sessions"
        )

    # Pipelines run as in-process background tasks; runs left in-flight by
    # a previous process can never progress, so fail them at boot.
    stale_count = fail_stale_runs()
    if stale_count:
        logger.warning("Marked %d stale run(s) as failed after restart", stale_count)
    yield


app = FastAPI(title="AI Blog Writer", lifespan=lifespan)


def _read_bool_env(key: str, default: bool = False) -> bool:
    raw = os.getenv(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    """Reject requests without the configured API key.

    Disabled unless ABW_API_KEY is set, so local development keeps
    working with no configuration. Preflight requests and /health stay
    open: browsers send OPTIONS without custom headers, and health
    checks must not need credentials.
    """
    expected_key = os.getenv("ABW_API_KEY", "").strip()
    if (
        not expected_key
        or request.method == "OPTIONS"
        or request.url.path in AUTH_EXEMPT_PATHS
    ):
        return await call_next(request)

    provided_key = request.headers.get(API_KEY_HEADER, "")
    if not hmac.compare_digest(provided_key, expected_key):
        return JSONResponse(
            status_code=401,
            content={"detail": f"Missing or invalid {API_KEY_HEADER} header"},
        )

    return await call_next(request)


_cors_origins, _cors_config_error = resolve_cors_config(
    api_key=os.getenv("ABW_API_KEY", ""),
    raw_origins=os.getenv("ABW_ALLOWED_ORIGINS", ""),
)

_cors_wildcard = "*" in _cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # Credentialed CORS with a wildcard origin is rejected by browsers and
    # would require reflecting arbitrary origins, which defeats the origin
    # check. Only allow credentials when origins are pinned.
    allow_credentials=not _cors_wildcard,
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
    # This handler runs outside CORSMiddleware, so browser clients only see
    # the error payload if we add CORS headers here — following the same
    # origin policy as the middleware, never reflecting arbitrary origins
    # with credentials.
    response_headers: dict[str, str] = {}
    origin = request.headers.get("origin")
    if origin:
        if _cors_wildcard:
            response_headers["Access-Control-Allow-Origin"] = "*"
        elif origin in _cors_origins:
            response_headers["Access-Control-Allow-Origin"] = origin
            response_headers["Access-Control-Allow-Credentials"] = "true"
            response_headers["Vary"] = "Origin"
    return JSONResponse(
        status_code=500,
        headers=response_headers,
        content={"detail": detail, "error_id": error_id},
    )


app.include_router(router)
