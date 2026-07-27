from __future__ import annotations

from typing import Any

from app.features.prompt2blog.content.outline import (
    MIN_OUTLINE_SECTIONS,
    _sanitize_outline,
    format_outline_for_prompt,
    validate_outline,
)


def _section(heading: str, words: int = 300) -> dict[str, Any]:
    return {
        "heading": heading,
        "purpose": f"Cover {heading}.",
        "source_support": "Backed by the source material.",
        "target_words": words,
    }


def _outline(*headings: str, words: int = 300) -> dict[str, Any]:
    return _sanitize_outline(
        {
            "working_title": "Peru Entry Rules",
            "direct_answer_focus": "What travelers need at the border.",
            "sections": [_section(heading, words) for heading in headings],
            "takeaway_focus": "Bring the right paperwork.",
            "guideline_alignment": "Covers planning and logistics.",
        }
    )


def test_sections_without_a_heading_are_dropped():
    outline = _sanitize_outline(
        {"sections": [_section("Entry Rules"), {"purpose": "orphan"}, None]}
    )

    assert [section["heading"] for section in outline["sections"]] == ["Entry Rules"]


def test_outline_needs_enough_sections_for_compose():
    thin = _outline("Entry Rules", "Getting Around")
    accepted, diagnostics = validate_outline(thin, target_word_count=600)

    # Compose requires at least three `##` headings, so a shorter plan is not
    # a usable plan.
    assert len(thin["sections"]) < MIN_OUTLINE_SECTIONS
    assert accepted is False
    assert diagnostics["enough_sections"] is False


def test_outline_rejects_duplicate_headings():
    duplicated = _outline("Entry Rules", "Entry Rules", "Getting Around")
    accepted, diagnostics = validate_outline(duplicated, target_word_count=900)

    assert accepted is False
    assert diagnostics["headings_unique"] is False


def test_outline_rejects_a_plan_that_ignores_the_word_budget():
    bloated = _outline("A", "B", "C", words=1200)
    accepted, diagnostics = validate_outline(bloated, target_word_count=900)

    assert accepted is False
    assert diagnostics["within_word_budget"] is False
    assert diagnostics["planned_word_count"] == 3600


def test_outline_accepts_a_workable_plan():
    workable = _outline("Entry Rules", "Getting Around", "Where to Stay")
    accepted, diagnostics = validate_outline(workable, target_word_count=900)

    assert accepted is True
    assert diagnostics["section_count"] == 3


def test_word_budget_is_not_checked_when_the_brief_has_no_target():
    plan = _outline("A", "B", "C", words=50)
    accepted, _ = validate_outline(plan, target_word_count=0)

    assert accepted is True


def test_formatted_outline_carries_headings_and_budgets_to_compose():
    rendered = format_outline_for_prompt(
        _outline("Entry Rules", "Getting Around", "Where to Stay")
    )

    assert "1. Entry Rules (~300 words)" in rendered
    assert "Direct answer near the top should cover" in rendered
    assert "Closing takeaways should land on" in rendered


def test_unsupported_requests_are_passed_through_as_do_not_invent():
    outline = _sanitize_outline(
        {
            "sections": [_section("Entry Rules")],
            "unsupported_requests": ["Current visa fees"],
        }
    )
    rendered = format_outline_for_prompt(outline)

    assert "Current visa fees" in rendered
    assert "not confirmed" in rendered


def test_empty_outline_tells_compose_to_fall_back_to_the_guideline():
    rendered = format_outline_for_prompt(_sanitize_outline({}))

    assert "No outline was produced" in rendered
