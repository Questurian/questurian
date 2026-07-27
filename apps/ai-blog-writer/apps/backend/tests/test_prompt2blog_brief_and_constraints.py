from __future__ import annotations

from typing import Any

from app.features.prompt2blog.config import PROMPT2BLOG_CREATIVITY_TEMPERATURES
from app.features.prompt2blog.input import _build_writing_brief_from_input
from app.features.prompt2blog.models import Prompt2BlogInputRequest
from app.features.prompt2blog.quality import (
    _build_constraint_checks,
    _extract_narrative_focus,
    _should_run_repair,
)
from app.features.prompt2blog.support import (
    _format_hard_constraints,
    _format_style_directive,
)


def _option_context() -> dict[str, Any]:
    return {
        "tone": {"id": "practical", "label": "Practical", "instructions": "Be direct."},
        "length": {
            "id": "medium",
            "label": "Medium",
            "instructions": "Balance depth.",
            "paragraph_length": "Medium (3-5 sentences per paragraph)",
            "target_word_count": 900,
        },
        "brand_voice": {
            "id": "questurian-default",
            "label": "Questurian Default",
            "instructions": "Stay globally minded.",
        },
        "creativity_level": "high",
    }


def _request(**overrides: Any) -> Prompt2BlogInputRequest:
    payload: dict[str, Any] = {
        "article_type_id": 7,
        "source_material": ["Peru source material."],
        "article_goal": "Explain Peru entry rules.",
        "target_reader": "First-time visitors",
        "destination_context": "Peru",
        "tone_id": "practical",
        "length_id": "medium",
        "must_include": ["Mention visa on arrival"],
        "negative_instructions": ["Never say hidden gem"],
    }
    payload.update(overrides)
    return Prompt2BlogInputRequest(**payload)


def _brief(**overrides: Any) -> dict[str, Any]:
    return _build_writing_brief_from_input(
        _request(**overrides),
        option_context=_option_context(),
        cleaned_sources=["Peru source material about entry rules."],
    )


def test_brief_no_longer_carries_a_copy_of_the_sources():
    brief = _brief()

    # The brief is serialized into every prompt. Carrying raw_input.blobs meant
    # each call received the sources three times over.
    assert "raw_input" not in brief


def test_hard_constraints_are_not_folded_into_narrative_focus():
    brief = _brief()
    focus = _extract_narrative_focus(brief)

    assert "visa on arrival" not in focus.lower()
    assert "hidden gem" not in focus.lower()
    assert brief["must_include"] == ["Mention visa on arrival"]
    assert brief["negative_instructions"] == ["Never say hidden gem"]


def test_hard_constraint_block_states_requirements_explicitly():
    rendered = _format_hard_constraints(_brief())

    assert "MUST INCLUDE" in rendered
    assert "Mention visa on arrival" in rendered
    assert "MUST AVOID" in rendered
    assert "Never say hidden gem" in rendered


def test_hard_constraint_block_is_explicit_when_empty():
    brief = _brief(must_include=[], negative_instructions=[])

    assert _format_hard_constraints(brief) == "No hard constraints were supplied."


def test_must_include_coverage_is_measured_and_gates_repair():
    brief = _brief()
    covered = _build_constraint_checks(
        "Peru Entry Rules",
        "## Entry\n\nTravelers should mention visa on arrival paperwork at the desk.",
        brief,
    )
    missing = _build_constraint_checks(
        "Peru Entry Rules",
        "## Entry\n\nBring a passport valid for six months.",
        brief,
    )

    assert covered["must_include_covered"] is True
    assert missing["must_include_covered"] is False
    assert missing["must_include_coverage"] == 0.0
    assert _should_run_repair({"audit_complete": True, "overall_score": 9}, missing)


def test_creativity_level_reaches_the_brief_profile():
    brief = _brief()

    assert "Creativity level: high" in brief["editorial_instructions"]
    assert PROMPT2BLOG_CREATIVITY_TEMPERATURES["high"] > (
        PROMPT2BLOG_CREATIVITY_TEMPERATURES["low"]
    )


def test_style_profiles_are_not_folded_into_narrative_focus():
    # Tone, length, and brand voice used to ride inside editorial_instructions,
    # which every prompt renders under the header "NARRATIVE FOCUS (OPTIONAL)" --
    # so the entire tone guide reached the model labelled optional.
    focus = _extract_narrative_focus(_brief())

    assert "Be direct." not in focus
    assert "Balance depth." not in focus
    assert "Stay globally minded." not in focus
    # Genuine steering stays.
    assert "Creativity level: high" in focus


def test_style_directive_block_carries_every_resolved_profile():
    rendered = _format_style_directive(_option_context())

    assert "Tone profile (Practical):" in rendered
    assert "Be direct." in rendered
    assert "Length profile (Medium):" in rendered
    assert "Balance depth." in rendered
    assert "Brand voice profile (Questurian Default):" in rendered
    assert "Stay globally minded." in rendered


def test_style_directive_block_is_explicit_when_unresolved():
    assert _format_style_directive({}).startswith("No style profiles were resolved")


def test_every_generation_prompt_renders_the_style_directive():
    # A prompt that omits the placeholder silently drops tone from that stage.
    from app.features.prompt2blog.prompts import editorial, generation, quality

    rendering = [
        generation.P2B_COVERAGE_CHECK_PROMPT,
        generation.P2B_SUPPLEMENT_PROMPT,
        generation.P2B_OUTLINE_PROMPT,
        generation.P2B_COMPOSE_PROMPT,
        quality.P2B_QUALITY_AUDIT_PROMPT,
        quality.P2B_REPAIR_PROMPT,
        editorial.P2B_EDITORIAL_AUGMENTATION_PROMPT,
    ]
    for prompt in rendering:
        assert "STYLE DIRECTIVE (REQUIRED):" in prompt
        assert "{style_directive}" in prompt


def test_brief_keys_are_named_for_what_they_carry():
    brief = _brief()

    # `perspective` was fed destination_context. In a JSON brief "perspective"
    # reads as point of view, so the model was handed a city under a POV key.
    assert brief["destination_context"] == "Peru"
    assert "perspective" not in brief
    # `topic` duplicated `goal` verbatim, so one input filled two keys.
    assert "topic" not in brief
    assert brief["goal"] == "Explain Peru entry rules."


def test_narrative_focus_still_resolves_a_pre_rename_brief():
    # Callers can post a writing brief straight to the runtime endpoint.
    legacy = {"perspective": "Kyoto, Japan"}

    assert _extract_narrative_focus(legacy) == "Kyoto, Japan"


def test_editorial_angle_leads_the_narrative_focus_when_supplied():
    focus = _extract_narrative_focus(_brief(angle="Peru is the better first stop"))

    assert focus.startswith("Editorial angle")
    assert "Peru is the better first stop" in focus


def test_brief_omits_the_angle_line_when_none_is_supplied():
    assert "Editorial angle" not in _extract_narrative_focus(_brief())
    assert _brief()["angle"] == ""


def test_call_to_action_flows_into_the_brief():
    assert _brief(call_to_action="Compare transfer options")["call_to_action"] == (
        "Compare transfer options"
    )
