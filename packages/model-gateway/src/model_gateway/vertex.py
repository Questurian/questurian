"""Making the call, once, for everyone who makes it.

A call site names a job; this makes it. That ordering is the whole point --
reporting was previously wired per call site, so a call site nobody remembered
was a call site that reported nothing, which is why Location Manager has never
appeared on the usage dashboard at all. Here the call and the report are the
same statement, and forgetting stops being something a caller can do.

Three shapes, because three shapes exist:

``generate_text``      prompt in, prose out
``generate_from_image``  an image and a prompt in, prose out
``generate_grounded``  Google Search grounding, returning the raw response so
                       the caller can pull its sources out

The provider SDKs are imported inside the functions on purpose. This package
declares no dependencies -- it is imported by two services with unlike
dependency sets, and anything added here is added to both -- so the SDK has to
be the caller's to have, not this package's to require.

Behaviour preserved from the code this replaces, deliberately and to the
letter: only the grounded path retries an empty response, and only once; text
and image responses are stripped of surrounding quotes; an empty answer raises
rather than returning "".
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from typing import Any, Callable, Optional

from . import model_for
from .usage import PROVIDER_GOOGLE_VERTEX, observe_job_call

logger = logging.getLogger(__name__)

DEFAULT_LOCATION = "us-central1"

_initialized = False
_init_lock = threading.Lock()


class VertexNotConfigured(RuntimeError):
    """Vertex has no project to talk to."""


def project_and_location() -> tuple[str, str]:
    project = (os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
    if not project:
        raise VertexNotConfigured(
            "GOOGLE_CLOUD_PROJECT environment variable is required."
        )
    location = (
        os.getenv("GOOGLE_CLOUD_LOCATION") or DEFAULT_LOCATION
    ).strip() or DEFAULT_LOCATION
    return project, location


def ensure_initialized() -> None:
    """Initialise Vertex once per process."""
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:
            return
        project, location = project_and_location()
        from vertexai import init as vertex_init

        vertex_init(project=project, location=location)
        _initialized = True
        logger.info(
            "Vertex AI initialized (project=%s, location=%s)", project, location
        )


@dataclass(frozen=True)
class Generated:
    """What a call produced, and what actually produced it."""

    text: str
    # The model that served it, which is not always the one the job asked for:
    # a Claude name with no Claude path switched on is served by Gemini.
    model: str
    # The provider's own response object. Returned because the grounded path's
    # sources live on it and nothing else can get at them.
    raw: Any


def _response_text(response: Any) -> str:
    return (getattr(response, "text", "") or "").strip()


def _describe_empty(response: Any) -> str:
    candidates = list(getattr(response, "candidates", []) or [])
    candidate = candidates[0] if candidates else None
    return ", ".join(
        [
            f"finish_reason={getattr(candidate, 'finish_reason', None)}",
            f"finish_message={getattr(candidate, 'finish_message', None)}",
            f"prompt_feedback={getattr(response, 'prompt_feedback', None)}",
            f"response_id={getattr(response, 'response_id', None)}",
        ]
    )


def _with_empty_response_retry(generate: Callable[[], Any]) -> Any:
    """One retry when the model returns nothing at all.

    Vertex answers a RECITATION-stopped generation with an empty body rather
    than an error, and the second attempt usually succeeds. Worth exactly one
    retry: a second empty answer is a prompt problem, and paying for a third
    call will not fix it.
    """
    response = generate()
    if _response_text(response):
        return response

    logger.warning(
        "Vertex AI returned empty content; retrying once (%s)",
        _describe_empty(response),
    )
    response = generate()
    if _response_text(response):
        return response

    raise RuntimeError(
        f"Vertex AI returned empty JSON after one retry ({_describe_empty(response)})."
    )


# The token counts Vertex reports, under the names it reports them by. Both
# SDKs answer with an object rather than a dict -- a protobuf from `vertexai`,
# a pydantic model from `google-genai` -- and `normalize_token_usage` only
# reads dicts. Handing it the object straight through is how a call records a
# duration and no tokens: nothing raises, nothing warns, the row is just
# quietly empty. So the object is read attribute by attribute, here, once.
_USAGE_FIELDS = (
    "prompt_token_count",
    "candidates_token_count",
    "total_token_count",
    "cached_content_token_count",
    "thoughts_token_count",
)


def usage_dict(usage: Any) -> Optional[dict[str, int]]:
    """A provider's usage object as a plain dict, or None when it said nothing."""
    if usage is None:
        return None
    if isinstance(usage, dict):
        return usage

    counts: dict[str, int] = {}
    for field in _USAGE_FIELDS:
        value = getattr(usage, field, None)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        counts[field] = int(value)

    if not counts:
        # Better an obvious hole than a confident zero: a model reporting no
        # usage at all is worth noticing, and silently recording nothing is
        # how it stops being noticed.
        logger.warning(
            "Vertex reported usage this module could not read (%s)", type(usage).__name__
        )
        return None

    return _with_inferred_thinking(counts)


def _with_inferred_thinking(counts: dict[str, int]) -> dict[str, int]:
    """Account for tokens the total counts and the named fields do not.

    The `vertexai` SDK's usage proto has exactly three fields -- prompt,
    candidates, total -- and no field for thinking tokens at all. On a thinking
    model the reasoning is therefore in the total and nowhere else, and reading
    only `candidates_token_count` charges for the visible answer and nothing
    for the reasoning that produced it. Google bills reasoning at the output
    rate.

    Measured on a real 2.5 Pro alt-text call: 1,381 prompt, 21 candidates,
    2,285 total. The 883 unaccounted tokens made the reported cost $0.0019
    against an actual $0.0108 -- understated 5.6x, silently, on every thinking
    call this service makes.

    So the remainder is attributed to reasoning. On a grounded call it may also
    include tool tokens, which would overstate slightly; that is the safer
    direction for a cost figure, and far better than being wrong by 5x in the
    direction of "cheaper than it was".
    """
    total = counts.get("total_token_count", 0)
    prompt = counts.get("prompt_token_count", 0)
    candidates = counts.get("candidates_token_count", 0)
    if "thoughts_token_count" in counts or not total:
        return counts

    unaccounted = total - prompt - candidates
    if unaccounted > 0:
        counts["thoughts_token_count"] = unaccounted
    return counts


def _resolve(job_id: str, override: Optional[str]) -> str:
    model = model_for(job_id, override=override)
    if not model:
        raise ValueError(f"{job_id} has no model behind it")
    return model


def _clean(text: str) -> str:
    return text.strip().strip('"').strip("'")


def generate_text(
    job_id: str,
    prompt: str,
    *,
    model: Optional[str] = None,
    endpoint: str = "generate_text",
) -> Generated:
    """Prompt in, prose out."""
    resolved = _resolve(job_id, model)
    ensure_initialized()
    from vertexai.generative_models import GenerativeModel

    with observe_job_call(
        job_id,
        provider=PROVIDER_GOOGLE_VERTEX,
        model=resolved,
        endpoint=endpoint,
    ) as observed:
        response = GenerativeModel(resolved).generate_content(prompt)
        observed.record_usage(usage_dict(getattr(response, "usage_metadata", None)))

    text = _clean(getattr(response, "text", "") or "")
    if not text:
        raise RuntimeError("Vertex AI returned empty text.")
    return Generated(text=text, model=resolved, raw=response)


def generate_from_image(
    job_id: str,
    image_data: bytes,
    content_type: str,
    prompt: str,
    *,
    model: Optional[str] = None,
    endpoint: str = "generate_from_image",
) -> Generated:
    """An image and a prompt in, prose out."""
    resolved = _resolve(job_id, model)
    ensure_initialized()
    from vertexai.generative_models import GenerativeModel, Part

    part = Part.from_data(data=image_data, mime_type=content_type)

    with observe_job_call(
        job_id,
        provider=PROVIDER_GOOGLE_VERTEX,
        model=resolved,
        endpoint=endpoint,
        # Not the image itself, obviously -- just enough to tell a run of
        # oversized uploads apart from a run of ordinary ones when the
        # duration chart goes strange.
        imageBytes=len(image_data),
        imageType=content_type,
    ) as observed:
        response = GenerativeModel(resolved).generate_content([part, prompt])
        observed.record_usage(usage_dict(getattr(response, "usage_metadata", None)))

    text = _clean(getattr(response, "text", "") or "")
    if not text:
        raise RuntimeError("Vertex AI returned empty alt text.")
    return Generated(text=text, model=resolved, raw=response)


class GroundingUnavailable(ImportError):
    """`google-genai` is not installed, so nothing can be grounded here."""


def generate_grounded(
    job_id: str,
    prompt: str,
    *,
    model: Optional[str] = None,
    endpoint: str = "generate_grounded",
) -> Generated:
    """Google Search grounding, with the response kept for its sources.

    Raises ``GroundingUnavailable`` rather than silently answering ungrounded.
    A caller that can degrade should decide to; one that cannot must not be
    handed an ungrounded answer wearing a grounded answer's shape.
    """
    resolved = _resolve(job_id, model)
    project, location = project_and_location()

    try:
        from google import genai
        from google.genai.types import GenerateContentConfig, GoogleSearch, Tool
    except ImportError as error:
        raise GroundingUnavailable(str(error)) from error

    client = genai.Client(vertexai=True, project=project, location=location)

    with observe_job_call(
        job_id,
        provider=PROVIDER_GOOGLE_VERTEX,
        model=resolved,
        endpoint=endpoint,
        grounded=True,
    ) as observed:
        response = _with_empty_response_retry(
            lambda: client.models.generate_content(
                model=resolved,
                contents=prompt,
                config=GenerateContentConfig(tools=[Tool(google_search=GoogleSearch())]),
            )
        )
        observed.record_usage(usage_dict(getattr(response, "usage_metadata", None)))

    return Generated(text=_response_text(response), model=resolved, raw=response)
