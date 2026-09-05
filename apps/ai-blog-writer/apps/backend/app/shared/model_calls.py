"""Every model call this backend makes, named by its job and reported.

A call site names a job -- ``images.alt_text``, ``itinerary.title`` -- and this
module resolves the model, times the call, and reports it to the dashboard's
usage collector. A call site that names a model is a bug; so is one that has
to remember to report itself.

Why here and not in ``model_gateway``
-------------------------------------
Location Manager's calls *are* made inside the gateway, because it uses the
Vertex SDK directly and the whole call fits in one place. This backend does
not: its calls go through LangChain, a forced-tool path, a REST grounding
path, and a Claude CLI transport, carrying accumulated policy -- a 64,000
output-token floor, Gemini 3's separate endpoint, two independent Claude
switches. Reimplementing that inside a package that deliberately has no
dependencies would be a rewrite wearing a refactor's clothes, and the one
thing this work must not do is quietly change what a job runs on.

So the gateway decides the model and owns the reporting; this module is the
one place in this backend that performs a call. That is the property that
matters: there is a single seam, and it cannot be bypassed by forgetting.

Why ``app.shared`` and not ``packages/utils``
---------------------------------------------
Several tests replace ``utils`` in ``sys.modules`` with a process-global stub.
A new name there, imported at module scope by a pipeline, breaks every test
that imports after one of those stubs is installed. See ``api_usage.py`` and
``provider_faults.py``, which live here for the same reason.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from model_gateway import model_for
from model_gateway.usage import (
    PROVIDER_GOOGLE_VERTEX,
    observe_job_call,
    provider_for_llm,
)

from app.shared.writer_invocation import (
    StructuredWriterResult,
    WriterResult,
    invoke_anthropic_structured,
    invoke_writer_model,
)

logger = logging.getLogger(__name__)


def resolve(job_id: str, override: Optional[str] = None) -> str:
    """The model this job will run on, refusing a job that has none."""
    model = model_for(job_id, override=override)
    if not model:
        raise ValueError(f"{job_id} has no model behind it")
    return model


def writer_text(
    job_id: str,
    *,
    prompt: str,
    max_tokens: int = 16384,
    temperature: float = 0.15,
    model: Optional[str] = None,
    endpoint: str = "writer_text",
) -> WriterResult:
    """A free-text writer call, reported under its job."""
    resolved = resolve(job_id, model)
    with observe_job_call(
        job_id,
        provider=PROVIDER_GOOGLE_VERTEX,
        model=resolved,
        endpoint=endpoint,
    ) as observed:
        result = invoke_writer_model(
            prompt=prompt,
            model_name=resolved,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        # The model that answered, not the one asked for: a Claude name with
        # no Claude path switched on is served by Gemini, and the spend
        # belongs to whatever actually ran.
        observed.set_model(result.model_name)
        observed.set_provider(_provider_for(result.model_name))
        observed.record_usage(result.usage)
    return result


def structured(
    job_id: str,
    *,
    prompt: str,
    tool_name: str,
    tool_description: str,
    input_schema: dict[str, Any],
    max_tokens: int = 4096,
    model: Optional[str] = None,
    endpoint: str = "structured",
) -> StructuredWriterResult:
    """A forced-tool call, where the provider guarantees the shape."""
    resolved = resolve(job_id, model)
    with observe_job_call(
        job_id,
        provider=PROVIDER_GOOGLE_VERTEX,
        model=resolved,
        endpoint=endpoint,
    ) as observed:
        # Named for Anthropic, dispatches per provider. The name is older than
        # the routing.
        result = invoke_anthropic_structured(
            prompt=prompt,
            model_name=resolved,
            tool_name=tool_name,
            tool_description=tool_description,
            input_schema=input_schema,
            max_tokens=max_tokens,
        )
        observed.set_model(result.model_name)
        observed.set_provider(_provider_for(result.model_name))
        observed.record_usage(result.usage)
    return result


def multimodal_text(
    job_id: str,
    parts: list[Any],
    *,
    model: Optional[str] = None,
    endpoint: str = "multimodal",
) -> str:
    """An image (plus a prompt) in, text out.

    Built here rather than through ``utils.invoke_vertex_multimodal_text``
    because that helper returns only the string and drops the response, and
    the response is where the token counts are. Five image jobs were reporting
    nothing at all partly because of that.
    """
    resolved = resolve(job_id, model)
    from utils import get_vertex_generative_model  # type: ignore
    from model_gateway.vertex import usage_dict

    with observe_job_call(
        job_id,
        provider=PROVIDER_GOOGLE_VERTEX,
        model=resolved,
        endpoint=endpoint,
    ) as observed:
        response = get_vertex_generative_model(model_name=resolved).generate_content(parts)
        observed.record_usage(usage_dict(getattr(response, "usage_metadata", None)))

    return str(getattr(response, "text", "") or "").strip()


def grounded_text(
    job_id: str,
    prompt: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.05,
    timeout_seconds: Optional[int] = None,
    fallback_model: Optional[str] = None,
    model: Optional[str] = None,
    endpoint: str = "grounded",
) -> Any:
    """A Google Search grounded call, reported under its job.

    Returns whatever the grounding helper returns, ``None`` included: a search
    that found nothing is a real answer this pipeline already handles, and
    turning it into an exception here would change behaviour.
    """
    resolved = resolve(job_id, model)
    from utils import invoke_google_grounded_text  # type: ignore

    kwargs: dict[str, Any] = {
        "model_name": resolved,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if fallback_model is not None:
        kwargs["fallback_model_name"] = fallback_model
    if timeout_seconds is not None:
        kwargs["timeout_seconds"] = timeout_seconds

    with observe_job_call(
        job_id,
        provider=PROVIDER_GOOGLE_VERTEX,
        model=resolved,
        endpoint=endpoint,
        grounded=True,
    ) as observed:
        result = invoke_google_grounded_text(prompt, **kwargs)
        if result is not None:
            # The REST path reports the model that served it, which is the
            # fallback when the first choice failed.
            observed.set_model(getattr(result, "model_name", None) or resolved)
            observed.record_usage(
                {
                    "input_tokens": getattr(result, "input_tokens", 0) or 0,
                    "output_tokens": getattr(result, "output_tokens", 0) or 0,
                    "total_tokens": getattr(result, "total_tokens", 0) or 0,
                }
            )
        else:
            # Recorded rather than left blank: a search that returns nothing
            # still cost time, and a run of them is worth being able to see.
            observed.add_metadata(emptyResult=True)
    return result


def _provider_for(model_name: Optional[str]) -> str:
    """Which provider a resolved model name belongs to."""
    return provider_for_llm(None, model_name)
