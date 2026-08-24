from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from app.shared.text import enforce_anti_ai_tells_markdown
from utils import get_vertex_llm, parse_json_response

from .config import DEFAULT_MODEL
from .support import _safe_str

logger = logging.getLogger(__name__)

UsageRecorder = Callable[[str, Any], None]


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
    result = llm.invoke(prompt)
    if usage_recorder is not None:
        usage_recorder(
            str(getattr(llm, "model_name", resolved_model)),
            getattr(llm, "last_usage_metadata", None),
        )
    text = _safe_str(result)
    if not text:
        raise RuntimeError("LLM returned empty response")
    return text


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


def _invoke_json_llm(
    *,
    prompt: str,
    max_tokens: int,
    temperature: float,
    model_name: str | None,
    usage_recorder: UsageRecorder | None = None,
) -> tuple[dict[str, Any], str]:
    strict_prompt = (
        f"{prompt}\n\n"
        "CRITICAL OUTPUT RULE:\n"
        "Return ONLY one valid JSON object.\n"
        "No prose, no markdown, no code fences."
    )

    current_prompt = strict_prompt
    last_error = "Unknown JSON parse failure"
    last_response = ""

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
