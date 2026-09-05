"""Every model call this monorepo makes, named.

A **job** is one kind of work someone asks a model to do: compose an article,
score a candidate, describe an image, suggest a field. Call sites name a job.
They never name a model, because the whole failure this package exists to
prevent is a model decision written down in 22 places and changed in 21.

The id is also the ``feature`` reported to the dashboard's usage collector, so
the usage history and the settings table line up on the same word. That is
finer-grained than what the collector receives today -- every Prompt2Blog
stage currently reports the single feature ``prompt2blog``, and the listicle
grill reports ``prompt2blog`` too, because it borrows that pipeline's code.
Rows recorded before the migration keep the old coarse feature; nothing
rewrites history.

The catalogue itself is ``jobs.json``, not this file. The dashboard owns the
live job-to-model table and has to render a settings screen from the same list
of jobs this package resolves against -- and the dashboard is TypeScript.
Holding the list in Python and a copy of it in TypeScript would rebuild, in a
new place, exactly the drift this package was written to end. So the data is
JSON, both runtimes read it, and this module is the Python reader.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

CATALOGUE_PATH = Path(__file__).with_name("jobs.json")

APP_ABW = "ai-blog-writer"
APP_LM = "location-manager"
APPS = frozenset({APP_ABW, APP_LM})

# The shape of the provider call, which decides how the gateway makes it.
CALL_TEXT = "text"
"""Prompt in, prose out."""

CALL_JSON = "json"
"""Prompt in, a JSON object out, parsed or schema-validated by the transport."""

CALL_GROUNDED_TEXT = "grounded_text"
"""Google Search grounding, prose plus the source URLs it read."""

CALL_GROUNDED_JSON = "grounded_json"
"""Google Search grounding, parsed into an object with its sources merged in."""

CALL_STRUCTURED = "structured"
"""A forced tool call, where the provider guarantees the shape."""

CALL_MULTIMODAL = "multimodal"
"""An image (or image plus prompt) in, text out."""

CALL_PLACES = "places"
"""Google Places. No model, no tokens, priced per request rather than per token."""

CALL_KINDS = frozenset(
    {
        CALL_TEXT,
        CALL_JSON,
        CALL_GROUNDED_TEXT,
        CALL_GROUNDED_JSON,
        CALL_STRUCTURED,
        CALL_MULTIMODAL,
        CALL_PLACES,
    }
)


@dataclass(frozen=True)
class Job:
    """One kind of work, and where in the repo it is asked for."""

    job_id: str
    app: str
    call: str
    summary: str
    # Where the call is made today. Kept because a job id is only useful if
    # you can find the code it names, and these move.
    site: str
    # What it runs on when nothing overrides it. The dashboard's table and an
    # operator's own choice both sit above this; see `settings.py`.
    default_model: Optional[str]

    @property
    def is_model_call(self) -> bool:
        """False for jobs that reach an API with no model behind it."""
        return self.call != CALL_PLACES


def _load(path: Path = CATALOGUE_PATH) -> tuple[Job, ...]:
    """Read the catalogue, refusing anything malformed.

    Strict on the way in. This list is what every call site resolves against
    and what the fallback is built from, so it is the last place a silent gap
    should be tolerated.
    """
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw = payload.get("jobs")
    if not isinstance(raw, list) or not raw:
        raise ValueError(f"{path.name} has no jobs")

    loaded: list[Job] = []
    seen: set[str] = set()
    for entry in raw:
        job_id = entry.get("id")
        if not isinstance(job_id, str) or "." not in job_id:
            raise ValueError(f"{path.name}: {job_id!r} is not an `area.job` id")
        if job_id in seen:
            raise ValueError(f"{path.name}: {job_id!r} is listed twice")
        seen.add(job_id)

        app = entry.get("app")
        if app not in APPS:
            raise ValueError(f"{path.name}: {job_id} belongs to unknown app {app!r}")

        call = entry.get("call")
        if call not in CALL_KINDS:
            raise ValueError(f"{path.name}: {job_id} has unknown call kind {call!r}")

        model = entry.get("defaultModel")
        if model is not None and not isinstance(model, str):
            raise ValueError(f"{path.name}: {job_id} has a non-string default model")
        if model is None and call != CALL_PLACES:
            raise ValueError(f"{path.name}: {job_id} makes a model call with no default")

        loaded.append(
            Job(
                job_id=job_id,
                app=app,
                call=call,
                summary=str(entry.get("summary", "")),
                site=str(entry.get("site", "")),
                default_model=model,
            )
        )
    return tuple(loaded)


JOBS: tuple[Job, ...] = _load()

JOBS_BY_ID: dict[str, Job] = {entry.job_id: entry for entry in JOBS}

DEFAULT_MODELS: dict[str, Optional[str]] = {
    entry.job_id: entry.default_model for entry in JOBS
}


class UnknownJob(KeyError):
    """A call site named a job the registry has never heard of."""


def job(job_id: str) -> Job:
    """The job with this id.

    Raises rather than falling back to a default model. A typo that silently
    ran on some other model would be the exact class of bug this package
    exists to remove.
    """
    try:
        return JOBS_BY_ID[job_id]
    except KeyError:
        near = sorted(
            other
            for other in JOBS_BY_ID
            if other.split(".", 1)[0] == job_id.split(".", 1)[0]
        )
        hint = f" Jobs in that namespace: {', '.join(near)}." if near else ""
        raise UnknownJob(f"No job named {job_id!r}.{hint}") from None


def jobs_for_app(app: str) -> tuple[Job, ...]:
    """Every job one app is responsible for."""
    return tuple(entry for entry in JOBS if entry.app == app)


def catalogue_payload() -> dict:
    """The catalogue as the dashboard serves it, for a settings screen."""
    return {
        "version": 1,
        "jobs": [
            {
                "id": entry.job_id,
                "app": entry.app,
                "call": entry.call,
                "summary": entry.summary,
                "site": entry.site,
                "defaultModel": entry.default_model,
            }
            for entry in JOBS
        ],
    }
