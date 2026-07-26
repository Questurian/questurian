"""Grounded execution and runtime fallbacks for one Research Profile."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from .angle_assignment import ListicleAngle
from .research_profile_contracts import (
    ResearchProfile,
    ResearchProfileTrace,
    fallback_profile,
)
from .research_profile_parsing import parse_research_profile_response
from .research_profile_prompt import build_research_profile_prompt

GroundedInvoker = Callable[..., Any]


def execute_research_profile(
    *,
    venue_name: str,
    location_label: str,
    category: str,
    requested_angle: ListicleAngle | None,
    grounded_model: str,
    invoke_grounded: GroundedInvoker,
    exception_logger: logging.Logger,
) -> tuple[ResearchProfile, ResearchProfileTrace]:
    prompt = build_research_profile_prompt(
        venue_name=venue_name,
        location_label=location_label,
        category=category,
        requested_angle=requested_angle,
    )
    try:
        result = invoke_grounded(
            prompt,
            model_name=grounded_model,
            fallback_model_name="gemini-2.5-flash",
            max_tokens=16384,
            temperature=0.1,
        )
    except Exception as exc:  # noqa: BLE001
        exception_logger.exception(
            "Research Profile grounded call failed for venue %r", venue_name
        )
        return (
            fallback_profile(
                requested_angle, warning="Research Profile grounded call failed."
            ),
            ResearchProfileTrace(
                prompt=prompt,
                model=grounded_model,
                error=f"grounded call raised: {exc!r}",
            ),
        )

    raw_text = getattr(result, "text", "") if result is not None else ""
    model_used = (
        getattr(result, "model_name", grounded_model)
        if result is not None
        else grounded_model
    )
    if not raw_text.strip():
        return (
            fallback_profile(
                requested_angle, warning="Research Profile returned empty text."
            ),
            ResearchProfileTrace(
                prompt=prompt,
                raw_response=raw_text,
                model=model_used,
                error="grounded call returned empty text",
            ),
        )

    profile, parser_reason = parse_research_profile_response(
        raw_text=raw_text,
        requested_angle=requested_angle,
    )
    return profile, ResearchProfileTrace(
        prompt=prompt,
        raw_response=raw_text,
        model=model_used,
        parser_dropped_reason=parser_reason,
    )


__all__ = ["GroundedInvoker", "execute_research_profile"]
