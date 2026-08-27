from __future__ import annotations

from typing import Any

from app.features.prompt2blog.quality import (
    CONSTRAINT_MEASUREMENT_KEYS,
    NEUTRAL_QUALITY_SCORE,
    _build_constraint_checks,
    _contains_phrase,
    _sanitize_quality,
    _should_run_repair,
    word_count_revision_instruction,
)


def _brief(**overrides: Any) -> dict[str, Any]:
    brief: dict[str, Any] = {
        "audience": "First-time solo travelers",
        "voice": {"tone": "Practical"},
        "formatting": {"paragraph_length": "", "target_word_count": 0},
        "seo": {"primary_keyword": "", "secondary_keywords": []},
        "call_to_action": "",
    }
    brief.update(overrides)
    return brief


CONTENT = (
    "## Getting Around\n\n"
    "Book flights to Lima early. Buses run to the coast every morning.\n\n"
    "## Where to Stay\n\n"
    "Miraflores suits first-time visitors who want walkable streets.\n"
)


def test_keyword_match_tolerates_plural_inflection():
    assert _contains_phrase("Book flights to Lima early.", "flight to Lima")
    assert _contains_phrase("Take the bus to Cusco.", "buses to Cusco")
    assert not _contains_phrase("Book flights to Quito early.", "flight to Lima")


def test_primary_keyword_check_uses_inflection_tolerant_match():
    checks = _build_constraint_checks(
        "Peru Guide",
        CONTENT,
        _brief(seo={"primary_keyword": "flight to Lima", "secondary_keywords": []}),
    )
    assert checks["primary_keyword_present"] is True


def test_secondary_keywords_pass_on_partial_coverage():
    brief = _brief(
        seo={
            "primary_keyword": "",
            "secondary_keywords": ["buses", "Miraflores", "Machu Picchu"],
        }
    )
    checks = _build_constraint_checks("Peru Guide", CONTENT, brief)

    # Two of three appear. Requiring all three used to fail this and hand repair
    # an instruction to work the missing keyword in "naturally".
    assert checks["secondary_keyword_coverage"] == round(2 / 3, 3)
    assert checks["secondary_keywords_present"] is True


def test_secondary_keywords_fail_when_coverage_is_genuinely_low():
    brief = _brief(
        seo={
            "primary_keyword": "",
            "secondary_keywords": ["Machu Picchu", "Sacred Valley", "Titicaca"],
        }
    )
    checks = _build_constraint_checks("Peru Guide", CONTENT, brief)

    assert checks["secondary_keyword_coverage"] == 0.0
    assert checks["secondary_keywords_present"] is False


def test_semantic_checks_are_not_computed_deterministically():
    checks = _build_constraint_checks("Peru Guide", CONTENT, _brief())

    # Tone and audience fit belong to the auditor, not to token overlap.
    assert "audience_match" not in checks
    assert "tone_match" not in checks


def test_audit_keeps_only_semantic_constraint_checks():
    quality = _sanitize_quality(
        {
            "overall_score": 8,
            "constraint_checks": {
                "audience_match": False,
                "tone_match": True,
                "primary_keyword_present": True,
            },
        }
    )

    assert quality["constraint_checks"] == {
        "audience_match": False,
        "tone_match": True,
    }


def test_repair_fires_below_seven_not_at_seven():
    passing_checks = {
        "target_word_count_met": True,
        "cta_present": True,
        "primary_keyword_present": True,
        "secondary_keywords_present": True,
    }

    # The rubric calls 7 "acceptable with edits", so 7 must not buy a rewrite.
    assert not _should_run_repair(
        {"audit_complete": True, "overall_score": 7}, passing_checks
    )
    assert _should_run_repair(
        {"audit_complete": True, "overall_score": 6}, passing_checks
    )


def test_unparseable_audit_does_not_trigger_repair_on_its_own():
    quality = _sanitize_quality({"quality_summary": "no scores returned"})
    passing_checks = {
        "target_word_count_met": True,
        "cta_present": True,
        "primary_keyword_present": True,
        "secondary_keywords_present": True,
    }

    assert quality["audit_complete"] is False
    assert quality["overall_score"] == NEUTRAL_QUALITY_SCORE
    assert not _should_run_repair(quality, passing_checks)


def test_failed_deterministic_check_still_triggers_repair_when_audit_is_broken():
    quality = _sanitize_quality({})

    assert _should_run_repair(quality, {"primary_keyword_present": False})


def test_cta_check_reads_a_configured_call_to_action():
    brief = _brief(call_to_action="Compare Lima airport transfer options before you fly")

    assert _build_constraint_checks("Peru Guide", CONTENT, brief)["cta_present"] is False
    assert (
        _build_constraint_checks(
            "Peru Guide",
            CONTENT + "\nCompare Lima airport transfer options before you fly.",
            brief,
        )["cta_present"]
        is True
    )


def _long_draft(word_count: int) -> str:
    """A draft of exactly ``word_count`` countable words."""
    return "## Section\n\n" + " ".join(["word"] * (word_count - 1))


def test_word_count_check_reports_which_side_of_the_band_it_missed():
    brief = _brief(formatting={"paragraph_length": "", "target_word_count": 1400})

    # Band is 1260-1540: target 1400 with a max(100, 10%) = 140 tolerance.
    over = _build_constraint_checks("T", _long_draft(1903), brief)
    assert over["target_word_count_met"] is False
    assert over["word_count_direction"] == "over"
    assert over["word_count_delta"] == 363
    assert (over["word_count_target_min"], over["word_count_target_max"]) == (1260, 1540)

    under = _build_constraint_checks("T", _long_draft(388), brief)
    assert under["word_count_direction"] == "under"
    assert under["word_count_delta"] == -872

    inside = _build_constraint_checks("T", _long_draft(1400), brief)
    assert inside["target_word_count_met"] is True
    assert inside["word_count_direction"] == "within"
    assert inside["word_count_delta"] == 0


def test_no_target_word_count_reports_no_direction():
    checks = _build_constraint_checks("T", _long_draft(400), _brief())

    assert checks["target_word_count_met"] is True
    assert checks["word_count_direction"] == "within"
    assert checks["word_count_target_max"] == 0


def test_length_revision_states_the_direction_rather_than_leaving_it_to_a_model():
    brief = _brief(formatting={"paragraph_length": "", "target_word_count": 1400})

    over = word_count_revision_instruction(
        _build_constraint_checks("T", _long_draft(1903), brief)
    )
    assert over is not None
    assert "Cut about 360 words" in over
    assert "1260-1540 words" in over
    assert "Add about" not in over

    under = word_count_revision_instruction(
        _build_constraint_checks("T", _long_draft(388), brief)
    )
    assert under is not None
    assert "Add about 870 words" in under
    assert "Cut about" not in under

    assert (
        word_count_revision_instruction(
            _build_constraint_checks("T", _long_draft(1400), brief)
        )
        is None
    )


def test_length_measurements_never_land_among_the_pass_fail_verdicts():
    checks = _build_constraint_checks(
        "T",
        _long_draft(1903),
        _brief(formatting={"paragraph_length": "", "target_word_count": 1400}),
    )
    verdicts = {
        key: value
        for key, value in checks.items()
        if key not in CONSTRAINT_MEASUREMENT_KEYS
    }

    # A count sitting in a dict of booleans reads as a check that failed.
    assert all(isinstance(value, bool) for value in verdicts.values())
