"""What a failed run leaves behind for the next person to read.

`error` is a sentence. Deciding what to show, or whether a run is worth
resuming, cannot depend on matching that sentence -- so the kind is stored
beside it, and the stage that actually stopped is stored durably rather than
only in a status row the next run overwrites.
"""

from __future__ import annotations

from uuid import uuid4

from app.core import read_stage_result, read_status
from app.features.prompt2blog.run_recorder import RunRecorder
from utils.claude_cli_llm import ClaudeCliUnavailable


def _run_id() -> str:
    return f"failure-kind-{uuid4().hex[:8]}"


def test_an_exhausted_account_is_stored_as_a_kind_not_only_as_prose():
    run_id = _run_id()
    recorder = RunRecorder()
    recorder.queue(run_id)
    recorder.start_stage(run_id, "stage_v3_groundedness")

    recorder.fail(
        run_id,
        "stage_v3_groundedness",
        ClaudeCliUnavailable("limit reached", kind="quota_exhausted"),
    )

    status = read_status(run_id)
    assert status["state"] == "failed"
    assert status["stage"] == "stage_v3_groundedness"
    assert status["failure_kind"] == "quota_exhausted"


def test_the_failed_stage_is_recorded_durably():
    """The status row is overwritten by whatever runs next; this row is not."""
    run_id = _run_id()
    recorder = RunRecorder()
    recorder.queue(run_id)

    recorder.fail(
        run_id,
        "stage_v3_groundedness",
        ClaudeCliUnavailable("limit reached", kind="quota_exhausted"),
    )

    recorded = read_stage_result(run_id, "pipeline_failure")
    assert recorded["data"]["failed_stage"] == "stage_v3_groundedness"
    assert recorded["data"]["failure_kind"] == "quota_exhausted"


def test_an_ordinary_failure_stores_no_kind():
    """None is the honest answer for a failure that is not a provider fault."""
    run_id = _run_id()
    recorder = RunRecorder()
    recorder.queue(run_id)

    recorder.fail(run_id, "stage_v3_compose", RuntimeError("a bug in the composer"))

    assert read_status(run_id)["failure_kind"] is None


def test_a_new_attempt_clears_a_kind_left_by_the_last_one():
    """A stale kind would be read as describing the run that is happening now."""
    run_id = _run_id()
    recorder = RunRecorder()
    recorder.queue(run_id)
    recorder.fail(
        run_id,
        "stage_v3_groundedness",
        ClaudeCliUnavailable("limit reached", kind="quota_exhausted"),
    )

    recorder.start_stage(run_id, "stage_v3_outline")

    status = read_status(run_id)
    assert status["state"] == "running"
    assert status["failure_kind"] is None


def test_a_completed_run_carries_no_kind():
    run_id = _run_id()
    recorder = RunRecorder()
    recorder.queue(run_id)
    recorder.complete(run_id)

    assert read_status(run_id)["failure_kind"] is None
