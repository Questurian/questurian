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


# --- the line that defines failure ----------------------------------------
#
# `fails_if` is the operator's own definition of failure, written in their
# words. Run 849ae5aa named "describes the projects in the present tense when
# nobody has confirmed they are still running", opened with "Hundreds of fog
# nets built in Lima are standing and functioning in 2026", and the audit
# passed it: the line was in the brief the auditor was shown, and nothing had
# ever asked it to read it.


def test_the_auditor_answers_with_a_sentence_not_a_checkbox():
    """A boolean can be answered without reading. On b29d66b4 it was: the
    audit reported the failure avoided in the same response where it called
    the section an inventory and told repair to rewrite it."""
    from app.features.prompt2blog.quality import evaluate_fails_if

    content = (
        "## Where to eat\n\nNorma Cevicheria receives the most acclaim and "
        "serves a fish ceviche with fried pork rinds.\n\n## The cost\n\n"
        "Punto Azul charges 51 soles for a classic fish ceviche."
    )
    quality = _sanitize_quality(
        {
            "overall_score": 8,
            "fails_if_quote": (
                "Norma Cevicheria receives the most acclaim and serves a fish "
                "ceviche with fried pork rinds."
            ),
            "fails_if_why": "It lists a stall without saying to go there.",
        }
    )

    result = evaluate_fails_if(quality, content)

    assert result["verdict"] == "walks_into_it"
    assert "Norma Cevicheria" in result["matched"]


def test_a_quote_that_is_not_in_the_draft_is_recorded_as_unjudged():
    """An invented quote must not become a failure -- that is the same sin in
    the other direction -- but it must not be banked as a pass either."""
    from app.features.prompt2blog.quality import evaluate_fails_if

    quality = _sanitize_quality(
        {
            "overall_score": 8,
            "fails_if_quote": "The tram runs every eleven minutes from the plaza.",
            "fails_if_why": "Present tense about a service nobody confirmed.",
        }
    )

    result = evaluate_fails_if(quality, "## Cost\n\nA plate runs 25 soles.")

    assert result["verdict"] == "unjudged"
    assert result["matched"] == ""


def test_a_quote_that_lost_its_punctuation_still_counts():
    """A model that repairs a dash has still located the sentence. Losing a
    true finding to punctuation would be the worst way to fail."""
    from app.features.prompt2blog.quality import evaluate_fails_if

    content = (
        "## Stalls\n\nDon Danilo operates from stall 486, and you will sit "
        "on plastic stools if you eat at El Rey Luhcin."
    )
    quality = _sanitize_quality(
        {
            "overall_score": 8,
            "fails_if_quote": (
                "Don Danilo operates from stall 486 and you will sit on plastic "
                "stools if you eat at El Rey Luhcin"
            ),
        }
    )

    assert evaluate_fails_if(quality, content)["verdict"] == "walks_into_it"


def test_a_quote_spanning_two_sentences_still_matches():
    """An auditor quoting the problem often quotes two sentences of it.
    Scored against single sentences, such a quote can never match anything and
    a true finding is thrown away for spanning a full stop."""
    from app.features.prompt2blog.quality import evaluate_fails_if

    content = (
        "## Stalls\n\nYou will sit on plastic stools if you eat at El Rey "
        "Luhcin. Don Danilo operates from stall 486. Al Toke Pez sits nearby."
    )
    quality = _sanitize_quality(
        {
            "overall_score": 8,
            "fails_if_quote": (
                "You will sit on plastic stools if you eat at El Rey Luhcin. "
                "Don Danilo operates from stall 486."
            ),
        }
    )

    assert evaluate_fails_if(quality, content)["verdict"] == "walks_into_it"


def test_an_auditor_that_answers_with_no_quote_does_not_manufacture_a_failure():
    from app.features.prompt2blog.quality import evaluate_fails_if

    quality = _sanitize_quality({"overall_score": 8})

    assert evaluate_fails_if(quality, "## Cost\n\nA plate runs 25 soles.") == {
        "quote": "",
        "why": "",
        "verdict": "avoided",
        "matched": "",
        "match_score": 0.0,
    }


def test_walking_into_the_failure_does_not_block_the_run():
    """Freehand text must never gain the power to block. It weighs through
    the scores the auditor sets beside it, per ADR 0030."""
    from app.features.prompt2blog.policies import evaluate_readiness

    verdict = evaluate_readiness(
        quality={"audit_complete": True, "overall_score": 8},
        checks={"fails_if_avoided": False},
        groundedness={"checked": True, "grounded": True},
    )

    assert verdict.ready
    assert "fails_if_avoided" not in verdict.blockers


def test_walking_into_the_failure_does_not_by_itself_buy_a_repair():
    assert (
        _should_run_repair(
            {"audit_complete": True, "overall_score": 8},
            {"fails_if_avoided": False},
        )
        is False
    )
