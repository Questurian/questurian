from __future__ import annotations

from app.features.prompt2blog.policies import evaluate_readiness
from app.features.prompt2blog.quality import (
    HARD_CONSTRAINT_CHECK_KEYS,
    _should_run_repair,
    unchecked_groundedness,
)

PASSING_CHECKS = {key: True for key in HARD_CONSTRAINT_CHECK_KEYS}
GOOD_QUALITY = {
    "audit_complete": True,
    "overall_score": 9,
    "too_close_to_source": False,
}
CHECKED_GROUNDED = {"checked": True, "grounded": True}


def test_a_clean_run_is_ready():
    verdict = evaluate_readiness(
        quality=GOOD_QUALITY,
        checks=PASSING_CHECKS,
        groundedness=CHECKED_GROUNDED,
    )

    assert verdict.ready is True
    assert verdict.blockers == ()


def test_a_low_scoring_article_is_not_ready():
    # The reported reproduction: 4/10 with the repair budget spent still came
    # back ready_for_staging because finalize never looked at the score.
    verdict = evaluate_readiness(
        quality={**GOOD_QUALITY, "overall_score": 4},
        checks=PASSING_CHECKS,
        groundedness=CHECKED_GROUNDED,
    )

    assert verdict.ready is False
    assert "quality_score_below_threshold" in verdict.blockers


def test_an_unchecked_grounding_result_is_not_ready():
    # unchecked_groundedness reports grounded=True on purpose so a checker
    # outage degrades rather than blocks the run. Reading `grounded` alone
    # turned that into a pass.
    result = unchecked_groundedness()
    assert result["grounded"] is True

    verdict = evaluate_readiness(
        quality=GOOD_QUALITY,
        checks=PASSING_CHECKS,
        groundedness=result,
    )

    assert verdict.ready is False
    assert verdict.blockers == ("groundedness_unchecked",)


def test_an_ungrounded_article_is_not_ready():
    verdict = evaluate_readiness(
        quality=GOOD_QUALITY,
        checks={**PASSING_CHECKS, "claims_grounded": False},
        groundedness={"checked": True, "grounded": False},
    )

    assert verdict.ready is False
    assert "claims_ungrounded" in verdict.blockers


def test_an_incomplete_audit_is_not_ready():
    verdict = evaluate_readiness(
        quality={"audit_complete": False, "overall_score": 7},
        checks=PASSING_CHECKS,
        groundedness=CHECKED_GROUNDED,
    )

    assert verdict.ready is False
    assert "audit_incomplete" in verdict.blockers
    # A missing score is not also reported as a low score.
    assert "quality_score_below_threshold" not in verdict.blockers


def test_every_hard_constraint_blocks_on_its_own():
    for key in HARD_CONSTRAINT_CHECK_KEYS:
        verdict = evaluate_readiness(
            quality=GOOD_QUALITY,
            checks={**PASSING_CHECKS, key: False},
            groundedness=CHECKED_GROUNDED,
        )

        assert verdict.ready is False, key
        assert key in verdict.blockers


def test_a_soft_check_does_not_block():
    # paragraph_length_met never triggers repair, so blocking on it would mark
    # runs needs_revision that the pipeline has no way to rescue.
    verdict = evaluate_readiness(
        quality=GOOD_QUALITY,
        checks={**PASSING_CHECKS, "paragraph_length_met": False},
        groundedness=CHECKED_GROUNDED,
    )

    assert verdict.ready is True


def test_readiness_blockers_stay_within_what_repair_tries_to_fix():
    """Readiness must not be stricter than the repair trigger on anything
    repair could act on, or a run is failed without ever being retried."""
    for key in HARD_CONSTRAINT_CHECK_KEYS:
        checks = {**PASSING_CHECKS, key: False}
        assert _should_run_repair(GOOD_QUALITY, checks) is True, key

    assert _should_run_repair({**GOOD_QUALITY, "overall_score": 4}, PASSING_CHECKS)
    assert _should_run_repair(
        {**GOOD_QUALITY, "too_close_to_source": True}, PASSING_CHECKS
    )
