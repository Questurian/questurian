from __future__ import annotations

import pytest

from app.features.prompt2blog.quality import (
    GroundednessMalformed,
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


def _verdict(**overrides):
    payload = {
        "grounded": True,
        "assessment": "Nothing unsupported.",
        "unsupported_claims": [],
    }
    payload.update(overrides)
    return payload


def test_high_severity_claim_marks_the_draft_ungrounded():
    result = _sanitize_groundedness(
        _verdict(
            grounded=True,
            assessment="One invented fee.",
            unsupported_claims=[
                {
                    "claim": "The reciprocity fee is $160.",
                    "reason": "No source states a fee.",
                    "severity": "high",
                }
            ],
        )
    )

    # The model claiming grounded=true does not override a high-severity find.
    # Normalising in this direction cannot manufacture a pass, and it keeps the
    # finding on the record for repair.
    assert result["grounded"] is False
    assert result["status"] == "unsupported"
    assert result["high_severity_count"] == 1


def test_low_severity_claims_do_not_block_the_draft():
    result = _sanitize_groundedness(
        _verdict(
            assessment="One soft generalisation.",
            unsupported_claims=[
                {
                    "claim": "Mornings are quieter.",
                    "reason": "General background.",
                    "severity": "low",
                }
            ],
        )
    )

    assert result["grounded"] is True
    assert result["status"] == "supported"
    assert result["high_severity_count"] == 0
    assert len(result["unsupported_claims"]) == 1


def test_empty_response_cannot_become_a_pass():
    # Finding 02, in one line: `{}` used to arrive downstream as
    # checked=true, grounded=true.
    with pytest.raises(GroundednessMalformed):
        _sanitize_groundedness({})


@pytest.mark.parametrize(
    "payload",
    [
        {"assessment": "Fine.", "unsupported_claims": []},
        {"grounded": "yes", "assessment": "Fine.", "unsupported_claims": []},
        {"grounded": True, "unsupported_claims": []},
        {"grounded": True, "assessment": "", "unsupported_claims": []},
        {"grounded": True, "assessment": "Fine."},
        {"grounded": True, "assessment": "Fine.", "unsupported_claims": {}},
    ],
)
def test_missing_or_mistyped_fields_are_refused(payload):
    with pytest.raises(GroundednessMalformed):
        _sanitize_groundedness(payload)


def test_unknown_severity_is_refused_rather_than_downgraded():
    # It used to become "low", which is a high-severity finding silently
    # turned into one that does not block the draft.
    with pytest.raises(GroundednessMalformed):
        _sanitize_groundedness(
            _verdict(
                grounded=False,
                unsupported_claims=[
                    {"claim": "Something", "reason": "x", "severity": "critical"}
                ],
            )
        )


def test_claims_without_text_refuse_the_whole_response():
    with pytest.raises(GroundednessMalformed):
        _sanitize_groundedness(
            _verdict(
                unsupported_claims=[
                    {"reason": "orphan", "severity": "low"},
                    {"claim": "Real claim", "reason": "x", "severity": "low"},
                ]
            )
        )


def test_false_verdict_with_no_explanation_is_refused():
    with pytest.raises(GroundednessMalformed):
        _sanitize_groundedness(
            _verdict(grounded=False, assessment="Not grounded.", unsupported_claims=[])
        )


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
    assert result["status"] == "unchecked"
    assert not _should_run_repair(
        {"audit_complete": True, "overall_score": 9},
        {**PASSING_CHECKS, "claims_grounded": result["grounded"]},
    )


def test_unchecked_result_records_why_it_could_not_run():
    result = unchecked_groundedness("checker returned an unreadable verdict")

    assert result["unchecked_reason"] == "checker returned an unreadable verdict"
    assert "unreadable verdict" in result["assessment"]
