"""Where the job-to-model table comes from, and what happens when it does not.

The dashboard owns the table. This fetches it, caches it, and refreshes it on
a timer so an operator changing a job's model takes effect without a code
edit, a restart or a redeploy -- which is the whole point of moving the
decision out of 22 files.

The failure behaviour is the design, not an afterthought:

* **The dashboard being down never stops a model call.** Every read falls back
  to the last table successfully fetched, and before any fetch has succeeded,
  to ``defaults.json`` -- the models every job ran on the day the gateway was
  built. Dashboard down means "keep running on what we last read", never
  "stop".
* **A fetch failure is logged, not raised.** A settings bug must not become a
  pipeline bug, for the same reason usage reporting swallows its own errors.
* **A job the dashboard has never heard of falls back rather than failing.**
  The dashboard can be older than the code; a job added this morning must not
  break because the table has not caught up.
* **A model the dashboard names is accepted even if the rate table has never
  heard of it.** The call still runs and is reported unpriced, with the reason
  recorded. Refusing to call a model because we cannot price it would be the
  telemetry tail wagging the dog.

Resolution order for one job, highest first:

1. an explicit ``model`` argument at the call site (the operator dropdowns);
2. a per-job environment override, when one is set;
3. the dashboard's table;
4. ``defaults.json``.

The environment override sits above the dashboard on purpose: it is what
Location Manager's ``ALT_TEXT_MODEL`` and friends already do, and an env var
someone deliberately exported should not be silently overruled from a web UI.
The cost is that a job pinned by an env var ignores dashboard changes, which
is worth knowing before wondering why a flip did nothing -- ``pinned_jobs()``
reports exactly that.

Configuration, all optional. With no URL set this never makes a request and
every job resolves from ``defaults.json``:

``MODEL_GATEWAY_SETTINGS_URL``      where the table is served, e.g.
                                    ``http://localhost:4500/api/settings/v1/models``
``MODEL_GATEWAY_SETTINGS_KEY``      sent as ``x-usage-key`` when required
``MODEL_GATEWAY_SETTINGS_TTL``      seconds before a refetch (default 60)
``MODEL_GATEWAY_SETTINGS_TIMEOUT``  per-request timeout in seconds (default 2)
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Mapping, Optional

from .jobs import JOBS_BY_ID, Job, job as lookup_job

logger = logging.getLogger(__name__)

DEFAULTS_PATH = Path(__file__).with_name("defaults.json")

SOURCE_DASHBOARD = "dashboard"
SOURCE_DEFAULTS = "defaults"

DEFAULT_TTL_SECONDS = 60.0
DEFAULT_TIMEOUT_SECONDS = 2.0

# A per-job override is read from this name, upper-cased with dots and dashes
# turned into underscores: "lm.alt_text" -> MODEL_FOR_LM_ALT_TEXT.
ENV_OVERRIDE_PREFIX = "MODEL_FOR_"

# Legacy names that already pinned a model before the gateway existed. Kept so
# that installing the gateway cannot change what a machine with one of these
# exported actually calls. New overrides should use ENV_OVERRIDE_PREFIX.
LEGACY_ENV_OVERRIDES: dict[str, str] = {
    "lm.alt_text": "ALT_TEXT_MODEL",
    "lm.neighborhood_description": "NEIGHBORHOOD_DESCRIPTION_MODEL",
    "lm.accommodations_field_suggestion": "ACCOMMODATIONS_FIELD_SUGGESTION_MODEL",
    "lm.dining_field_suggestion": "ACCOMMODATIONS_FIELD_SUGGESTION_MODEL",
}


def env_override_name(job_id: str) -> str:
    """The environment variable that pins this job, in the general scheme."""
    return ENV_OVERRIDE_PREFIX + job_id.upper().replace(".", "_").replace("-", "_")


def env_override(job_id: str) -> Optional[str]:
    """A model pinned by the environment for this job, if one is set."""
    for name in (env_override_name(job_id), LEGACY_ENV_OVERRIDES.get(job_id)):
        if not name:
            continue
        raw = (os.getenv(name) or "").strip()
        if raw:
            return raw
    return None


@dataclass(frozen=True)
class ModelTable:
    """One reading of the job-to-model table, and where it came from."""

    models: Mapping[str, Optional[str]]
    source: str
    fetched_at: float

    def get(self, job_id: str) -> Optional[str]:
        return self.models.get(job_id)


def load_defaults(path: Path = DEFAULTS_PATH) -> ModelTable:
    """The checked-in table. Read once at import and never mutated."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    return ModelTable(
        models=_models_from_payload(payload, strict=True),
        source=SOURCE_DEFAULTS,
        fetched_at=0.0,
    )


def _models_from_payload(payload: Any, *, strict: bool = False) -> dict[str, Optional[str]]:
    """Read ``{"jobs": {id: {"model": ...}}}`` into a flat mapping.

    Unknown job ids are dropped with a warning rather than accepted: the
    dashboard is allowed to be newer or older than this code, and a typo in
    its table should not become a job id that no call site will ever ask for.
    """
    if not isinstance(payload, dict):
        raise ValueError("model table payload was not an object")
    raw_jobs = payload.get("jobs")
    if not isinstance(raw_jobs, dict):
        raise ValueError("model table payload had no 'jobs' object")

    models: dict[str, Optional[str]] = {}
    for job_id, entry in raw_jobs.items():
        if job_id not in JOBS_BY_ID:
            message = "model table names unknown job %r; ignoring it"
            if strict:
                raise ValueError(f"defaults.json names unknown job {job_id!r}")
            logger.warning(message, job_id)
            continue
        model = entry.get("model") if isinstance(entry, dict) else entry
        if model is not None and not isinstance(model, str):
            logger.warning("model table gave %r a non-string model; ignoring it", job_id)
            continue
        models[job_id] = model.strip() if isinstance(model, str) else None

    if strict:
        missing = sorted(set(JOBS_BY_ID) - set(models))
        if missing:
            raise ValueError(
                "defaults.json is missing a model for: " + ", ".join(missing)
            )
    return models


@dataclass(frozen=True)
class SettingsConfig:
    url: Optional[str]
    key: Optional[str]
    ttl_seconds: float
    timeout_seconds: float

    @property
    def enabled(self) -> bool:
        return bool(self.url)


def _positive_float(raw: str, fallback: float) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return fallback
    return value if value > 0 else fallback


def config_from_env() -> SettingsConfig:
    return SettingsConfig(
        url=(os.getenv("MODEL_GATEWAY_SETTINGS_URL") or "").strip() or None,
        key=(os.getenv("MODEL_GATEWAY_SETTINGS_KEY") or "").strip() or None,
        ttl_seconds=_positive_float(
            (os.getenv("MODEL_GATEWAY_SETTINGS_TTL") or "").strip(),
            DEFAULT_TTL_SECONDS,
        ),
        timeout_seconds=_positive_float(
            (os.getenv("MODEL_GATEWAY_SETTINGS_TIMEOUT") or "").strip(),
            DEFAULT_TIMEOUT_SECONDS,
        ),
    )


Fetcher = Callable[[], Any]


def http_fetcher(config: SettingsConfig) -> Fetcher:
    """GET the table. Raises; the client decides what to do about it."""

    def fetch() -> Any:
        request = urllib.request.Request(config.url or "", method="GET")
        if config.key:
            request.add_header("x-usage-key", config.key)
        with urllib.request.urlopen(request, timeout=config.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))

    return fetch


class Settings:
    """The job-to-model table, kept fresh and never allowed to fail a call."""

    def __init__(
        self,
        config: Optional[SettingsConfig] = None,
        fetcher: Optional[Fetcher] = None,
        defaults: Optional[ModelTable] = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._config = config or config_from_env()
        self._fetcher = fetcher or (
            http_fetcher(self._config) if self._config.enabled else None
        )
        self._defaults = defaults or load_defaults()
        self._clock = clock
        self._lock = threading.Lock()
        self._live: Optional[ModelTable] = None
        self._next_fetch_at = 0.0
        self.failed_fetches = 0

    @property
    def config(self) -> SettingsConfig:
        return self._config

    def table(self) -> ModelTable:
        """The freshest table available, refetching if the cache has aged out."""
        if self._fetcher is None:
            return self._live or self._defaults
        now = self._clock()
        with self._lock:
            due = now >= self._next_fetch_at
        if due:
            self.refresh()
        return self._live or self._defaults

    def refresh(self) -> ModelTable:
        """Fetch now. Never raises; a failure keeps whatever was last read."""
        if self._fetcher is None:
            return self._defaults
        try:
            payload = self._fetcher()
            models = _models_from_payload(payload)
        except (urllib.error.URLError, OSError, ValueError, json.JSONDecodeError) as error:
            self.failed_fetches += 1
            # Every failure is survivable, so shouting about each one turns a
            # dashboard being down into log noise that hides real problems.
            if self.failed_fetches % 20 == 1:
                logger.warning(
                    "model settings unreachable (%s); still serving the %s table",
                    error,
                    (self._live or self._defaults).source,
                )
            with self._lock:
                # Back off a little rather than retrying on every single read.
                self._next_fetch_at = self._clock() + self._config.ttl_seconds
            return self._live or self._defaults
        except Exception:  # noqa: BLE001 - settings must never break a call
            self.failed_fetches += 1
            logger.debug("model settings fetch failed", exc_info=True)
            with self._lock:
                self._next_fetch_at = self._clock() + self._config.ttl_seconds
            return self._live or self._defaults

        table = ModelTable(
            models=models, source=SOURCE_DASHBOARD, fetched_at=time.time()
        )
        with self._lock:
            self._live = table
            self._next_fetch_at = self._clock() + self._config.ttl_seconds
            self.failed_fetches = 0
        return table

    def model_for(self, job_id: str, *, override: Optional[str] = None) -> Optional[str]:
        """Which model this job runs on, before Claude substitution.

        ``override`` is the operator's own choice from a model dropdown. It
        wins outright: the gateway decides defaults, not what a person sitting
        in front of the UI explicitly asked for.
        """
        entry: Job = lookup_job(job_id)
        if override and override.strip():
            return override.strip()

        pinned = env_override(job_id)
        if pinned:
            return pinned

        table = self.table()
        if job_id in table.models:
            return table.get(job_id)
        if table.source != SOURCE_DEFAULTS:
            logger.warning(
                "the %s model table does not name %r; falling back to the "
                "checked-in default",
                table.source,
                entry.job_id,
            )
        return self._defaults.get(job_id)

    def pinned_jobs(self) -> dict[str, str]:
        """Jobs an environment variable is holding, and what it holds them at.

        A pinned job ignores the dashboard. Worth being able to ask before
        wondering why a change had no effect.
        """
        pinned: dict[str, str] = {}
        for job_id in JOBS_BY_ID:
            value = env_override(job_id)
            if value:
                pinned[job_id] = value
        return pinned


_settings: Optional[Settings] = None
_settings_lock = threading.Lock()


def get_settings() -> Settings:
    """The process-wide settings client, built from the environment on first use."""
    global _settings
    with _settings_lock:
        if _settings is None:
            _settings = Settings()
        return _settings


def set_settings(settings: Optional[Settings]) -> None:
    """Replace the process-wide client. For tests and for explicit wiring."""
    global _settings
    with _settings_lock:
        _settings = settings
