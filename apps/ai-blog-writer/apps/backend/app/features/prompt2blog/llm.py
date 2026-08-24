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
            current_prompt = (
                "Your previous output was invalid JSON.\n"
                "Return ONLY one strict JSON object.\n"
                "No markdown fences, no commentary.\n\n"
                f"Previous invalid output:\n{raw_response[:4000]}"
            )

    raise RuntimeError(
        "Failed to parse JSON LLM response: "
        f"{last_error}. Preview: {last_response[:240]}"
    )
