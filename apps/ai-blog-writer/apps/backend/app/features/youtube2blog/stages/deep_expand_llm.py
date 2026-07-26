"""Shared LLM transport helpers for the deep-expand feature."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any, Protocol

from app.features.youtube2blog.config import Y2B_DEEP_EXPAND_MAX_OUTPUT_TOKENS


class Invokable(Protocol):
    def invoke(self, prompt: str) -> Any:
        """Invoke the configured model."""


GetLlm = Callable[..., Invokable]
ParseJson = Callable[[str], dict[str, Any]]


def invoke_json_llm(
    prompt: str,
    model_name: str,
    *,
    get_llm: GetLlm,
    parse_json: ParseJson,
    logger: logging.Logger,
) -> dict[str, Any]:
    """Invoke an LLM and retry malformed JSON responses up to three times."""
    strict_prompt = (
        f"{prompt}\n\n"
        "CRITICAL OUTPUT RULE:\n"
        "Return ONLY one valid JSON object.\n"
        "No prose, no markdown, no code fences."
    )
    llm = get_llm(temperature=0.1, max_tokens=4096, model_name=model_name)
    current_prompt = strict_prompt
    last_error = "Unknown parse failure"
    last_response = ""

    for attempt in range(1, 4):
        raw = str(llm.invoke(current_prompt)).strip()
        last_response = raw
        try:
            return parse_json(raw)
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            logger.warning(
                "Deep expand JSON parse failed (attempt %d): %s",
                attempt,
                last_error,
            )
            current_prompt = (
                "Your previous output was invalid JSON.\n"
                "Return ONLY one strict JSON object.\n"
                "No markdown fences, no commentary.\n\n"
                f"Previous invalid output:\n{raw[:4000]}"
            )

    raise RuntimeError(
        "Failed to parse JSON after 3 attempts: "
        f"{last_error}. Preview: {last_response[:240]}"
    )


def invoke_text_llm(prompt: str, model_name: str, *, get_llm: GetLlm) -> str:
    """Invoke an LLM using the deep-expansion output budget."""
    llm = get_llm(
        temperature=0.2,
        max_tokens=Y2B_DEEP_EXPAND_MAX_OUTPUT_TOKENS,
        model_name=model_name,
    )
    return str(llm.invoke(prompt)).strip()
