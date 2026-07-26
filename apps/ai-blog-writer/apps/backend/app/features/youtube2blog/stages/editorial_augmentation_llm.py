"""LLM execution policy for YouTube2Blog editorial augmentation."""

from __future__ import annotations

import logging
from typing import Any

from app.features.youtube2blog.config import (
    Y2B_EDITORIAL_AUGMENTATION_MAX_OUTPUT_TOKENS,
    Y2B_EDITORIAL_AUGMENTATION_MODEL,
)
from app.shared.text import enforce_anti_ai_tells_markdown
from utils import get_vertex_llm, parse_json_response

logger = logging.getLogger(__name__)

DEFAULT_MODEL = Y2B_EDITORIAL_AUGMENTATION_MODEL


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def invoke_json_llm(
    *, prompt: str, model_name: str = DEFAULT_MODEL
) -> tuple[dict[str, Any], str]:
    """Invoke the editorial model and retry malformed JSON responses."""
    strict_prompt = (
        f"{prompt}\n\n"
        "CRITICAL OUTPUT RULE:\n"
        "Return ONLY one valid JSON object.\n"
        "No prose, no markdown, no code fences."
    )

    llm = get_vertex_llm(
        temperature=0.05,
        max_tokens=Y2B_EDITORIAL_AUGMENTATION_MAX_OUTPUT_TOKENS,
        model_name=model_name,
    )

    current_prompt = strict_prompt
    last_error = "Unknown JSON parse failure"
    last_response = ""

    for attempt in range(1, 4):
        raw_response = _safe_str(llm.invoke(current_prompt))
        last_response = raw_response

        try:
            parsed = parse_json_response(raw_response)
            return parsed, raw_response
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            logger.warning(
                "YouTube2Blog editorial JSON parse failed (attempt %d): %s",
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


def enforce_editorial_anti_ai_tells(content: str, *, model_name: str) -> str:
    """Apply the shared prose policy using the editorial model for repairs."""
    return enforce_anti_ai_tells_markdown(
        content,
        repair=lambda repair_prompt: _safe_str(
            get_vertex_llm(
                temperature=0.1,
                max_tokens=Y2B_EDITORIAL_AUGMENTATION_MAX_OUTPUT_TOKENS,
                model_name=model_name,
            ).invoke(repair_prompt)
        ),
        context="youtube2blog editorial augmentation",
    )
