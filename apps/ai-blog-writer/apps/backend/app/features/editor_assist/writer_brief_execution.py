"""Curator execution and runtime fallbacks for one Writer Brief."""

from __future__ import annotations

import logging
from collections.abc import Callable

from .angle_assignment import ListicleAngle
from .research_profile import ResearchProfile
from .writer_brief_contracts import (
    WriterBrief,
    WriterBriefTrace,
    empty_writer_brief,
)
from .writer_brief_parsing import parse_writer_brief_response
from .writer_brief_policy import (
    get_angle_directive_template,
    render_angle_directive_template,
)
from .writer_brief_prompt import build_curator_prompt

CuratorInvoker = Callable[..., tuple[str, str]]


def execute_writer_brief(
    *,
    venue_name: str,
    location_label: str,
    category: str,
    angle: ListicleAngle | None,
    research_profile: ResearchProfile,
    model_name: str,
    max_tokens: int,
    temperature: float,
    invoke_curator: CuratorInvoker,
    exception_logger: logging.Logger,
) -> tuple[WriterBrief, WriterBriefTrace]:
    angle_directive_template = get_angle_directive_template(category, angle)
    prompt = build_curator_prompt(
        venue_name=venue_name,
        location_label=location_label,
        category=category,
        angle=angle,
        angle_directive_template=angle_directive_template,
        research_profile=research_profile,
    )

    try:
        raw_text, resolved_model = invoke_curator(
            prompt=prompt,
            model_name=model_name,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except Exception as exc:  # noqa: BLE001
        exception_logger.exception(
            "Writer Brief curator call failed for venue %r", venue_name
        )
        return (
            _fallback_brief(venue_name, angle, angle_directive_template),
            WriterBriefTrace(
                prompt=prompt,
                model=model_name,
                error=f"curator call raised: {exc!r}",
            ),
        )

    if not raw_text.strip():
        return (
            _fallback_brief(venue_name, angle, angle_directive_template),
            WriterBriefTrace(
                prompt=prompt,
                raw_response=raw_text,
                model=resolved_model,
                error="curator returned empty text",
            ),
        )

    brief, drop_reason = parse_writer_brief_response(
        raw_text=raw_text,
        venue_name=venue_name,
        angle=angle,
        angle_directive_template=angle_directive_template,
    )
    return brief, WriterBriefTrace(
        prompt=prompt,
        raw_response=raw_text,
        model=resolved_model,
        parser_dropped_reason=drop_reason,
    )


def _fallback_brief(
    venue_name: str,
    angle: ListicleAngle | None,
    angle_directive_template: str | None,
) -> WriterBrief:
    return empty_writer_brief(
        venue_name=venue_name,
        angle=angle,
        angle_directive=render_angle_directive_template(
            angle_directive_template, venue_name
        ),
    )


__all__ = ["CuratorInvoker", "execute_writer_brief"]
