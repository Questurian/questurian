"""Sanitize and parse Writer Brief curator responses."""

from __future__ import annotations

from typing import Any

from utils import parse_json_response

from .angle_assignment import ListicleAngle
from .writer_brief_contracts import (
    MAX_SOURCE_FACTS,
    SourceFact,
    WriterBrief,
    empty_writer_brief,
)
from .writer_brief_policy import render_angle_directive_template


def extract_json(text: str) -> Any:
    try:
        return parse_json_response(text)
    except (RuntimeError, TypeError):
        return None


def parse_writer_brief_response(
    *,
    raw_text: str,
    venue_name: str,
    angle: ListicleAngle | None,
    angle_directive_template: str | None,
) -> tuple[WriterBrief, str | None]:
    """Return a parsed brief and any response fields that were dropped."""
    parsed = extract_json(raw_text)
    drop_reasons: list[str] = []
    fallback_directive = render_angle_directive_template(
        angle_directive_template, venue_name
    )

    if not isinstance(parsed, dict):
        return (
            empty_writer_brief(
                venue_name=venue_name,
                angle=angle,
                angle_directive=fallback_directive,
            ),
            "response was not a JSON object",
        )

    directive_raw = parsed.get("angle_directive")
    if isinstance(directive_raw, str) and directive_raw.strip():
        directive = directive_raw.strip().replace("{venue}", venue_name)
    else:
        drop_reasons.append("angle_directive missing; fell back to template")
        directive = fallback_directive

    facts_raw = parsed.get("source_facts")
    cleaned: list[SourceFact] = []
    if isinstance(facts_raw, list):
        for entry in facts_raw:
            if len(cleaned) >= MAX_SOURCE_FACTS:
                drop_reasons.append(
                    f"source_facts capped at {MAX_SOURCE_FACTS}; extras dropped"
                )
                break
            if not isinstance(entry, dict):
                drop_reasons.append("source_facts entry not an object")
                continue
            fact_raw = entry.get("fact")
            if not isinstance(fact_raw, str) or not fact_raw.strip():
                drop_reasons.append("source_facts entry missing fact text")
                continue
            citations_raw = entry.get("citations")
            citations = (
                [
                    citation.strip()
                    for citation in citations_raw
                    if isinstance(citation, str) and citation.strip()
                ]
                if isinstance(citations_raw, list)
                else []
            )
            cleaned.append(SourceFact(fact=fact_raw.strip(), citations=citations))
    else:
        drop_reasons.append("source_facts missing or not a list")

    return (
        WriterBrief(
            angle_directive=directive,
            source_facts=cleaned,
            angle=angle,
            venue=venue_name,
        ),
        "; ".join(drop_reasons) if drop_reasons else None,
    )


__all__ = ["extract_json", "parse_writer_brief_response"]
