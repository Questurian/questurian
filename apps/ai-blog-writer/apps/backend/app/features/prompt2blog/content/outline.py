"""Section-plan normalisation for the Prompt2Blog outline stage.

The outline is the only place the pipeline reasons about article structure
before prose exists. Everything here is pure so the plan can be validated
against the article-type guideline without an LLM call.
"""

from __future__ import annotations

from typing import Any

from ..support import _safe_dict, _safe_int, _safe_str

# Compose requires at least three `##` headings, so a plan with fewer is not a
# usable plan for this pipeline.
MIN_OUTLINE_SECTIONS = 3

MAX_OUTLINE_SECTIONS = 12


def _sanitize_section(raw: Any) -> dict[str, Any] | None:
    record = _safe_dict(raw)
    heading = _safe_str(record.get("heading"))
    if not heading:
        return None
    return {
        "heading": heading,
        "purpose": _safe_str(record.get("purpose")) or "Purpose not stated.",
        "source_support": _safe_str(record.get("source_support"))
        or "Source support not stated.",
        "target_words": max(0, _safe_int(record.get("target_words"), default=0)),
    }


def _sanitize_outline(parsed: dict[str, Any]) -> dict[str, Any]:
    sections_raw = parsed.get("sections")
    sections: list[dict[str, Any]] = []
    if isinstance(sections_raw, list):
        for item in sections_raw[:MAX_OUTLINE_SECTIONS]:
            section = _sanitize_section(item)
            if section:
                sections.append(section)

    unsupported_raw = parsed.get("unsupported_requests")
    unsupported: list[str] = []
    if isinstance(unsupported_raw, list):
        unsupported = [_safe_str(item) for item in unsupported_raw if _safe_str(item)]

    return {
        "working_title": _safe_str(parsed.get("working_title")),
        "direct_answer_focus": _safe_str(parsed.get("direct_answer_focus")),
        "sections": sections,
        "takeaway_focus": _safe_str(parsed.get("takeaway_focus")),
        "guideline_alignment": _safe_str(parsed.get("guideline_alignment"))
        or "Guideline alignment not stated.",
        "unsupported_requests": unsupported,
    }


def validate_outline(
    outline: dict[str, Any],
    *,
    target_word_count: int,
) -> tuple[bool, dict[str, Any]]:
    """Check a plan against what compose structurally requires.

    An unusable plan is discarded rather than fed forward, so a bad outline
    degrades to the previous behaviour instead of misdirecting the draft.
    """
    sections = outline.get("sections") or []
    planned_words = sum(_safe_int(s.get("target_words"), default=0) for s in sections)

    within_budget = True
    if target_word_count > 0 and planned_words > 0:
        tolerance = max(200, int(target_word_count * 0.35))
        within_budget = abs(planned_words - target_word_count) <= tolerance

    checks = {
        "enough_sections": len(sections) >= MIN_OUTLINE_SECTIONS,
        "headings_unique": len({s["heading"].lower() for s in sections}) == len(
            sections
        ),
        "within_word_budget": within_budget,
    }
    diagnostics = {
        **checks,
        "section_count": len(sections),
        "planned_word_count": planned_words,
        "target_word_count": target_word_count,
    }
    return all(checks.values()), diagnostics


def format_outline_for_prompt(outline: dict[str, Any]) -> str:
    """Render a validated plan as the section brief compose writes against."""
    sections = outline.get("sections") or []
    if not sections:
        return "No outline was produced. Structure the article from the guideline."

    lines: list[str] = []
    direct_answer = _safe_str(outline.get("direct_answer_focus"))
    if direct_answer:
        lines.append(f"Direct answer near the top should cover: {direct_answer}")
        lines.append("")

    lines.append("Planned sections (use these as the `##` headings, in order):")
    for index, section in enumerate(sections, start=1):
        target = section.get("target_words") or 0
        budget = f" (~{target} words)" if target else ""
        lines.append(f"{index}. {section['heading']}{budget}")
        lines.append(f"   Purpose: {section['purpose']}")
        lines.append(f"   Source support: {section['source_support']}")

    takeaway = _safe_str(outline.get("takeaway_focus"))
    if takeaway:
        lines.append("")
        lines.append(f"Closing takeaways should land on: {takeaway}")

    unsupported = outline.get("unsupported_requests") or []
    if unsupported:
        lines.append("")
        lines.append(
            "The sources do not support the following. Mark them as not "
            "confirmed rather than inventing detail:"
        )
        lines.extend(f"- {item}" for item in unsupported)

    return "\n".join(lines)
