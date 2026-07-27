from __future__ import annotations

from app.features.prompt2blog.quality import (
    _sanitize_groundedness,
    _should_run_repair,
    unchecked_groundedness,
)

PASSING_CHECKS = {
    "target_word_count_met": True,
    "cta_present": True,
    "primary_keyword_present": True,
    "secondary_keywords_present": True,
    "must_include_covered": True,
    "claims_grounded": True,
}


def test_high_severity_claim_marks_the_draft_ungrounded():
    result = _sanitize_groundedness(
        {
            "grounded": True,
            "assessment": "One invented fee.",
            "unsupported_claims": [
                {
                    "claim": "The reciprocity fee is $160.",
                    "reason": "No source states a fee.",
                    "severity": "high",
                }
            ],
        }
    )

    # The model claiming grounded=true does not override a high-severity find.
    assert result["grounded"] is False
    assert result["high_severity_count"] == 1


def test_low_severity_claims_do_not_block_the_draft():
    result = _sanitize_groundedness(
        {
            "unsupported_claims": [
                {
                    "claim": "Mornings are quieter.",
                    "reason": "General background.",
                    "severity": "low",
                }
            ],
        }
    )

    assert result["grounded"] is True
    assert result["high_severity_count"] == 0
    assert len(result["unsupported_claims"]) == 1


def test_unknown_severity_is_treated_as_low():
    result = _sanitize_groundedness(
        {"unsupported_claims": [{"claim": "Something", "severity": "critical"}]}
    )

    assert result["unsupported_claims"][0]["severity"] == "low"


def test_claims_without_text_are_dropped():
    result = _sanitize_groundedness(
        {"unsupported_claims": [{"reason": "orphan"}, None, {"claim": "Real claim"}]}
    )

    assert [claim["claim"] for claim in result["unsupported_claims"]] == ["Real claim"]


def test_ungrounded_draft_triggers_repair():
    assert _should_run_repair(
        {"audit_complete": True, "overall_score": 9},
        {**PASSING_CHECKS, "claims_grounded": False},
    )


def test_grounded_draft_with_good_scores_does_not_trigger_repair():
    assert not _should_run_repair(
        {"audit_complete": True, "overall_score": 9},
        PASSING_CHECKS,
    )


def test_failed_check_degrades_to_grounded_but_is_recorded_as_unchecked():
    result = unchecked_groundedness()

    # A checker outage must not block a run, but must be visible.
    assert result["grounded"] is True
    assert result["checked"] is False
    assert not _should_run_repair(
        {"audit_complete": True, "overall_score": 9},
        {**PASSING_CHECKS, "claims_grounded": result["grounded"]},
    )
