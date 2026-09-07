"""What the post-writing editor cost, and why it has its own record.

`propose_edit` called the model and never persisted the resulting usage. Five
proposals an editor read and threw away cost real money and left nothing on
the article's receipt.
"""

from __future__ import annotations

import threading

from app.features.prompt2blog.editor_spend import (
    MEASURED,
    UNKNOWN,
    EditorAttempt,
    attempt_from_tracker,
    read_editor_spend,
    record_editor_attempt,
)
from app.features.prompt2blog.pricing import Prompt2BlogTokenUsageTracker


def _tracker_with_a_call(stage: str = "p2b.section_edit"):
    tracker = Prompt2BlogTokenUsageTracker(run_id="run-1")
    tracker.begin_stage(stage)
    tracker.record(
        "gemini-2.5-flash",
        {"input_tokens": 1200, "output_tokens": 400, "total_tokens": 1600},
    )
    return tracker


def test_a_discarded_proposal_still_costs_what_it_cost(isolated_db):
    """Discarded is not free, and a receipt that only counts kept proposals
    gets cheaper the more carefully somebody edits."""
    attempt = attempt_from_tracker(
        _tracker_with_a_call(),
        attempt_id="a1",
        kind="propose",
        section_id="s1",
        action_id="shorten",
        outcome="proposed",
    )
    record_editor_attempt("run-1", attempt)

    spend = read_editor_spend("run-1")
    assert len(spend.attempts) == 1
    assert spend.attempts[0].measurement == MEASURED
    totals = spend.totals()
    assert totals["input_tokens"] == 1200
    assert totals["output_tokens"] == 400
    assert totals["attempts"] == 1
    assert totals["unmeasured_attempts"] == 0


def test_a_refused_proposal_is_accounted_for_too(isolated_db):
    """The call happened. What came back does not change that."""
    record_editor_attempt(
        "run-1",
        attempt_from_tracker(
            _tracker_with_a_call(),
            attempt_id="a1",
            kind="propose",
            section_id="s1",
            action_id="clarify_recommendation",
            outcome="refused",
        ),
    )

    spend = read_editor_spend("run-1")
    assert spend.attempts[0].outcome == "refused"
    assert spend.totals()["input_tokens"] == 1200


def test_a_failure_with_no_usage_is_unmeasured_not_zero(isolated_db):
    """Recording an unknown as zero is inventing a cost.

    Zero is the direction that makes a receipt wrong quietly: it adds a call
    to the count and nothing to the total, so a run that spent money on a
    failed call looks like a run that spent none.
    """
    record_editor_attempt(
        "run-1",
        attempt_from_tracker(
            Prompt2BlogTokenUsageTracker(run_id="run-1"),
            attempt_id="a1",
            kind="propose",
            section_id="s1",
            action_id="shorten",
            outcome="failed",
            error="provider timed out",
        ),
    )

    spend = read_editor_spend("run-1")
    attempt = spend.attempts[0]
    assert attempt.measurement == UNKNOWN
    assert attempt.cost_usd is None
    assert attempt.error == "provider timed out"
    assert spend.totals()["unmeasured_attempts"] == 1


def test_a_failure_that_did_report_usage_keeps_it(isolated_db):
    """A call that failed after the provider charged for it is still spending."""
    record_editor_attempt(
        "run-1",
        attempt_from_tracker(
            _tracker_with_a_call(),
            attempt_id="a1",
            kind="propose",
            section_id="s1",
            action_id="shorten",
            outcome="failed",
            error="the response could not be parsed",
        ),
    )

    spend = read_editor_spend("run-1")
    assert spend.attempts[0].outcome == "failed"
    assert spend.totals()["input_tokens"] == 1200


def test_recording_the_same_attempt_twice_charges_once(isolated_db):
    attempt = attempt_from_tracker(
        _tracker_with_a_call(),
        attempt_id="a1",
        kind="propose",
        section_id="s1",
        action_id="shorten",
        outcome="proposed",
    )
    record_editor_attempt("run-1", attempt)
    record_editor_attempt("run-1", attempt)

    assert read_editor_spend("run-1").totals()["attempts"] == 1


def test_two_concurrent_attempts_are_both_kept_exactly_once(isolated_db):
    """The bug the run's own ledger has, avoided rather than inherited.

    The usage ledger is written whole: two callers restore a tracker from the
    same stored row, both append their call, both write, and one of the two
    calls is gone. These merge inside the transaction that read them.
    """
    started = threading.Barrier(4)

    def write(attempt_id: str) -> None:
        started.wait(timeout=5)
        record_editor_attempt(
            "run-1",
            attempt_from_tracker(
                _tracker_with_a_call(),
                attempt_id=attempt_id,
                kind="propose",
                section_id="s1",
                action_id="shorten",
                outcome="proposed",
            ),
        )

    threads = [
        threading.Thread(target=write, args=(f"a{index}",)) for index in range(4)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)

    spend = read_editor_spend("run-1")
    assert sorted(item.attempt_id for item in spend.attempts) == [
        "a0",
        "a1",
        "a2",
        "a3",
    ]
    assert spend.totals()["input_tokens"] == 4800


def test_editor_spend_is_kept_apart_from_the_pipeline_ledger(isolated_db):
    """Two questions, two records.

    "What did the article cost to make" and "what has been spent on it since"
    are different, and a single total that cannot say which is which is a
    number nobody can act on.
    """
    from app.core import read_stage_result
    from app.features.prompt2blog.editor_spend import EDITOR_SPEND_STAGE
    from app.features.prompt2blog.run_recorder import USAGE_LEDGER_STAGE

    record_editor_attempt(
        "run-1",
        EditorAttempt(attempt_id="a1", usage={"input_tokens": 5}, cost_usd=0.01),
    )

    assert read_stage_result("run-1", USAGE_LEDGER_STAGE) is None
    assert read_stage_result("run-1", EDITOR_SPEND_STAGE) is not None
