from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any

from app.shared.api_usage import observe_external_call, provider_for_llm
from app.shared.text import enforce_anti_ai_tells_markdown
from utils import get_vertex_llm, parse_json_response

from .config import DEFAULT_MODEL
from .pricing import MEASURED_COST_KEY
from .support import _safe_str

logger = logging.getLogger(__name__)

UsageRecorder = Callable[[str, Any], None]

# What the dashboard's API-usage monitor calls this work. The run id is not
# available here, so calls are correlated by run at the stage level instead --
# see `pricing.py` for the per-run ledger that does know it.
USAGE_FEATURE = "prompt2blog"


def _invoke_text_llm(
    *,
    prompt: str,
    max_tokens: int,
    temperature: float,
    model_name: str | None,
    usage_recorder: UsageRecorder | None = None,
) -> str:
    resolved_model = model_name or DEFAULT_MODEL
    # get_vertex_llm routes claude-* models to the Anthropic API.
    llm = get_vertex_llm(
        temperature=temperature,
        max_tokens=max_tokens,
        model_name=resolved_model,
    )
    reported_model = str(getattr(llm, "model_name", resolved_model))
    # The observation wraps the provider call and nothing else, so the duration
    # is the call's and a raised exception is recorded as a failed call before
    # it reaches the stage that catches it.
    with observe_external_call(
        provider=provider_for_llm(llm, reported_model),
        feature=USAGE_FEATURE,
        model=reported_model,
        endpoint="invoke_text",
    ) as observed:
        result = llm.invoke(prompt)
        # Reading the usage metadata is pure attribute access on the object the
        # call just filled in, so it belongs inside. Handing it to the run
        # ledger does not: a recorder that raised would otherwise be reported
        # as a failed provider call, which it is not.
        usage = _usage_with_measured_cost(llm)
        observed.record_usage(usage)
    if usage_recorder is not None:
        usage_recorder(reported_model, usage)
    text = _safe_str(result)
    if not text:
        raise RuntimeError("LLM returned empty response")
    return text


def _usage_with_measured_cost(llm: Any) -> Any:
    """Token counts, plus a per-call price when the provider reported one.

    Only the subscription CLI does; Vertex and the Anthropic API report tokens
    and leave costing to the rate table. Folded into the usage dict rather than
    threaded through a new recorder argument, so every existing recorder --
    including the test doubles that take exactly two positionals -- keeps
    working untouched.
    """
    usage = getattr(llm, "last_usage_metadata", None)
    cost = getattr(llm, "last_cost_usd", None)
    if cost is None or not isinstance(usage, dict):
        return usage
    return {**usage, MEASURED_COST_KEY: cost}


def _enforce_anti_ai_markdown_with_model(
    text: str,
    *,
    model_name: str | None,
    max_tokens: int,
    context: str,
    usage_recorder: UsageRecorder | None = None,
) -> str:
    return enforce_anti_ai_tells_markdown(
        text,
        repair=lambda repair_prompt: _invoke_text_llm(
            prompt=repair_prompt,
            max_tokens=max_tokens,
            temperature=0.1,
            model_name=model_name,
            usage_recorder=usage_recorder,
        ),
        context=context,
    )


# The parse error names what went wrong, so the excerpt only has to show the
# shape of the failure -- a fenced block, a preamble, a truncation. Sending
# more of the bad output costs input tokens and invites the model to anchor on
# text it has already been told is wrong.
JSON_RETRY_EXCERPT_CHARS = 1_200


def _invoke_schema_json_llm(
    *,
    prompt: str,
    max_tokens: int,
    temperature: float,
    model_name: str | None,
    schema: dict[str, Any],
    usage_recorder: UsageRecorder | None = None,
) -> tuple[dict[str, Any], str] | None:
    """One validated call, or None if this provider cannot make one.

    Capability is asked of the object the factory returned rather than inferred
    from the model name, so the question is "can this thing enforce a schema"
    and not "do I believe this name is served by something that can". A
    provider without the method falls through to asking in prose.

    There is no retry here on purpose. The retry loop below exists because a
    model asked in prose can return something unparseable; a validated call
    either produced a conforming object or failed for a reason that asking
    again three times would not fix -- and each of those attempts is a full
    article rewrite on the writer model.
    """
    llm = get_vertex_llm(
        temperature=temperature,
        max_tokens=max_tokens,
        model_name=model_name or DEFAULT_MODEL,
    )
    invoke_json = getattr(llm, "invoke_json", None)
    if not callable(invoke_json):
        return None

    reported_model = str(getattr(llm, "model_name", model_name or DEFAULT_MODEL))
    with observe_external_call(
        provider=provider_for_llm(llm, reported_model),
        feature=USAGE_FEATURE,
        model=reported_model,
        endpoint="invoke_json",
    ) as observed:
        parsed = invoke_json(prompt, input_schema=schema)
        usage = _usage_with_measured_cost(llm)
        observed.record_usage(usage)
    if usage_recorder is not None:
        usage_recorder(reported_model, usage)
    if not isinstance(parsed, dict):
        raise RuntimeError("Schema-validated LLM response was not an object")
    # The trace wants the raw response the stage saw. There was no prose reply
    # to record, so this is the validated object rendered back -- honest about
    # what happened rather than an empty string in the trace.
    return parsed, json.dumps(parsed, ensure_ascii=False)


def _invoke_json_llm(
    *,
    prompt: str,
    max_tokens: int,
    temperature: float,
    model_name: str | None,
    schema: dict[str, Any] | None = None,
    usage_recorder: UsageRecorder | None = None,
) -> tuple[dict[str, Any], str]:
    if schema is not None:
        validated = _invoke_schema_json_llm(
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            model_name=model_name,
            schema=schema,
            usage_recorder=usage_recorder,
        )
        if validated is not None:
            return validated

    strict_prompt = (
        f"{prompt}\n\n"
        "CRITICAL OUTPUT RULE:\n"
        "Return ONLY one valid JSON object.\n"
        "No prose, no markdown, no code fences."
    )

    current_prompt = strict_prompt
    last_error = "Unknown JSON parse failure"
    last_response = ""

    # The retry below is for output that could not be parsed, and nothing else.
    # `_invoke_text_llm` raises outside the inner `try`, so a provider fault --
    # an exhausted account above all -- leaves this loop on the first attempt
    # rather than paying for two more calls that cannot succeed. Keep it that
    # way: widening the `except` to cover the invoke would re-introduce exactly
    # the wasted calls this loop's shape prevents.

    for attempt in range(1, 4):
        raw_response = _invoke_text_llm(
            prompt=current_prompt,
            max_tokens=max_tokens,
            temperature=temperature if attempt == 1 else 0.0,
            model_name=model_name,
            usage_recorder=usage_recorder,
        )
        last_response = raw_response

        try:
            parsed = parse_json_response(raw_response)
            return parsed, raw_response
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            logger.warning(
                "Prompt2Blog JSON parse failed (attempt %d): %s",
                attempt,
                last_error,
            )
            # The retry used to send only the truncated bad output. That
            # discarded the task, the source material and the schema, so the
            # model was asked to re-emit a full article as JSON while no
            # longer able to see the article -- and the two paid retries after
            # a compose failure could not have succeeded on their own terms.
            # The instructions come back, and the parse error goes with them:
            # naming what was wrong is worth more than a longer sample of the
            # output that was wrong.
            current_prompt = (
                f"{strict_prompt}\n\n"
                "RETRY NOTICE\n"
                "Your previous response to this exact task could not be parsed "
                f"as JSON: {last_error}\n"
                "Return the same content again as one strict JSON object. "
                "No markdown fences, no commentary, no text before or after "
                "the object.\n\n"
                "Start of the unparseable response, for reference only:\n"
                f"{raw_response[:JSON_RETRY_EXCERPT_CHARS]}"
            )

    raise RuntimeError(
        "Failed to parse JSON LLM response: "
        f"{last_error}. Preview: {last_response[:240]}"
    )
