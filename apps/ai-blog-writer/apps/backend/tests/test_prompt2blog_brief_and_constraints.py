from __future__ import annotations

from typing import Any

from app.features.prompt2blog.config import PROMPT2BLOG_CREATIVITY_TEMPERATURES
from app.features.prompt2blog.quality_v3 import v3_constraint_brief
from app.features.prompt2blog.quality import (
    _build_constraint_checks,
    _should_run_repair,
)
from app.features.prompt2blog.support import (
    _format_hard_constraints,
    _format_style_directive,
)


def _option_context() -> dict[str, Any]:
    return {
        "tone": {
            "id": "questurian-voice",
            "label": "Questurian Voice",
            "instructions": "Be direct.",
        },
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




def _brief(**overrides: Any) -> dict[str, Any]:
    """What `v3_constraint_brief` hands the audit, with the fields under test.

    must_include is the Article Brief's must_name -- the things a person said
    the piece has to mention -- which is the only must-include v4 has.
    """
    brief = v3_constraint_brief(
        {
            "outcome": "Get through Peruvian immigration without a surprise.",
            "must_name": ["Mention visa on arrival"],
        },
        _option_context(),
    )
    brief["negative_instructions"] = ["Never say hidden gem"]
    brief.update(overrides)
    return brief


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


def test_style_directive_block_carries_every_resolved_profile():
    rendered = _format_style_directive(_option_context())

    assert "Tone profile (Questurian Voice):" in rendered
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

