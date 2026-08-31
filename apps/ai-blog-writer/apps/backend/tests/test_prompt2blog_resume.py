"""Picking a failed v3 run back up instead of paying for it twice.

A v3 run can spend most of its tokens before the last stage, so a failure near
the end used to throw away an outline, a draft, a grounding verdict and an
audit that were all still correct. These tests hold the line that matters: a
resumed run continues from stored work rather than regenerating it, and it
refuses rather than guessing whenever the stored work cannot be trusted.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks, HTTPException

import app.features.prompt2blog.api.runs as runs_api
import app.features.prompt2blog.routes as prompt2blog_routes

from app.core import read_stage_result, read_status, write_stage_result
from app.features.prompt2blog.config import P2B_RESUME_MAX_ATTEMPTS
from app.features.prompt2blog.dependencies import PipelineDependencies
from app.features.prompt2blog.intake_v3 import prepare_v3_runtime_request
from app.features.prompt2blog.orchestrator_v3 import (
    Prompt2BlogResumeRefused,
    resume_pipeline_v3,
    run_pipeline_v3,
)
from app.features.prompt2blog.pricing import Prompt2BlogTokenUsageTracker
from app.features.prompt2blog.resume_v3 import (
    RESUME_SNAPSHOT_STAGE,
    plan_resume,
)
from app.features.prompt2blog.run_recorder import RunRecorder
from tests.prompt2blog_test_support import response_payload
from tests.test_prompt2blog_v3_pipeline import DRAFT, ScriptedLLM, _request
from utils.claude_cli_llm import ClaudeCliUnavailable


def _run_id() -> str:
    return f"resume-{uuid4().hex[:8]}"


def _quota_fault() -> ClaudeCliUnavailable:
    return ClaudeCliUnavailable("limit reached", kind="quota_exhausted")


class TitleFailsLLM(ScriptedLLM):
    """Everything works up to the headline, which is where the account dies."""

    def invoke_text(self, **_kwargs: Any) -> str:
        raise _quota_fault()


class RepairFailsLLM(ScriptedLLM):
    """The audit asks for a repair and the repair call never lands."""

    def invoke_json(self, *, prompt: str, **kwargs: Any):
        if "repair pass" in prompt:
            raise _quota_fault()
        return super().invoke_json(prompt=prompt, **kwargs)


def _start(run_id: str, llm: ScriptedLLM) -> None:
    """Start a real run against the test database and let it fail."""
    recorder = RunRecorder()
    recorder.queue(run_id)
    runtime = prepare_v3_runtime_request(_request())
    with pytest.raises(ClaudeCliUnavailable):
        run_pipeline_v3(
            run_id,
            runtime,
            PipelineDependencies(llm=llm, recorder=recorder),
        )


def _stage_data(run_id: str, stage: str) -> dict[str, Any]:
    row = read_stage_result(run_id, stage)
    return (row or {}).get("data") or {}


def _stages_called(llm: ScriptedLLM) -> list[str]:
    return [stage for stage, _prompt in llm.prompts]


def test_a_run_that_dies_at_the_title_resumes_at_the_title():
    run_id = _run_id()
    _start(run_id, TitleFailsLLM(quality_scores=[9]))

    assert read_status(run_id)["state"] == "failed"
    plan = plan_resume(run_id)
    assert plan.resumable is True
    assert plan.resume_from_stage == "stage_v3_title"
    assert plan.failed_stage == "stage_v3_title"
    assert plan.failure_kind == "quota_exhausted"

    second_leg = ScriptedLLM(quality_scores=[9])
    state = resume_pipeline_v3(
        run_id,
        PipelineDependencies(llm=second_leg, recorder=RunRecorder()),
    )

    # The whole point: the second leg buys the headline and nothing else.
    assert _stages_called(second_leg) == ["title"]
    assert state["completed"] is True
    assert read_status(run_id)["state"] == "completed"

    payload = _stage_data(run_id, "pipeline_v3")
    assert payload["pipeline_status"] == "ready_for_staging"
    assert payload["resume_count"] == 1
    # The article the first leg wrote is the article that shipped.
    assert payload["improved_article"]["content"] == DRAFT["improved_content"]


def test_the_resumed_run_re_decides_the_quality_gate_it_died_on():
    """A failure inside the repair loop comes back into the repair loop.

    The gate after the audit is a decision, not an edge, so the resume has to
    make the same decision the graph would have. A draft the auditor failed
    must not come back settled just because the run stopped there.
    """
    run_id = _run_id()
    _start(run_id, RepairFailsLLM(quality_scores=[6]))

    plan = plan_resume(run_id)
    assert plan.resume_from_stage == "stage_v3_repair"

    second_leg = ScriptedLLM(quality_scores=[9])
    state = resume_pipeline_v3(
        run_id,
        PipelineDependencies(llm=second_leg, recorder=RunRecorder()),
    )

    assert _stages_called(second_leg) == [
        "repair",
        "groundedness",
        "audit",
        "title",
    ]
    assert state["completed"] is True
    # The failed repair call cost the run nothing it cannot try again: the
    # attempt is only counted once a repair actually returns a draft.
    assert state["repair_attempts"] == 1


def test_a_finished_run_keeps_no_resumable_state():
    run_id = _run_id()
    recorder = RunRecorder()
    recorder.queue(run_id)
    run_pipeline_v3(
        run_id,
        prepare_v3_runtime_request(_request()),
        PipelineDependencies(llm=ScriptedLLM(quality_scores=[9]), recorder=recorder),
    )

    assert read_stage_result(run_id, RESUME_SNAPSHOT_STAGE) is None
    assert plan_resume(run_id).reason == "run_not_failed"


def test_the_resume_history_names_every_attempt():
    run_id = _run_id()
    _start(run_id, TitleFailsLLM(quality_scores=[9]))
    _start_again = TitleFailsLLM(quality_scores=[9])
    with pytest.raises(ClaudeCliUnavailable):
        resume_pipeline_v3(
            run_id,
            PipelineDependencies(llm=_start_again, recorder=RunRecorder()),
        )

    attempts = _stage_data(run_id, "pipeline_resume_v3")["attempts"]
    assert [attempt["resume_count"] for attempt in attempts] == [1]
    assert attempts[0]["resumed_from_stage"] == "stage_v3_title"
    assert attempts[0]["failure_kind"] == "quota_exhausted"

    # A failed resume is itself resumable, and its snapshot has moved on by
    # exactly nothing -- the title still has not been written.
    assert plan_resume(run_id).resume_from_stage == "stage_v3_title"


def test_resuming_is_refused_once_the_attempt_allowance_is_gone():
    run_id = _run_id()
    _start(run_id, TitleFailsLLM(quality_scores=[9]))
    for _ in range(P2B_RESUME_MAX_ATTEMPTS):
        with pytest.raises(ClaudeCliUnavailable):
            resume_pipeline_v3(
                run_id,
                PipelineDependencies(
                    llm=TitleFailsLLM(quality_scores=[9]), recorder=RunRecorder()
                ),
            )

    plan = plan_resume(run_id)
    assert plan.resumable is False
    assert plan.reason == "resume_limit_reached"
    with pytest.raises(Prompt2BlogResumeRefused):
        resume_pipeline_v3(run_id)


def test_a_snapshot_for_another_brief_is_refused_rather_than_run():
    """The refusal that protects the article rather than the token budget.

    Restoring a state that belongs to a different brief would publish
    prose, scores and evidence that do not describe each other. The run input
    row is the independent witness, and it wins.
    """
    run_id = _run_id()
    _start(run_id, TitleFailsLLM(quality_scores=[9]))

    snapshot = read_stage_result(run_id, RESUME_SNAPSHOT_STAGE)
    snapshot["data"]["brief_fingerprint"] = "not-this-brief"
    write_stage_result(run_id, RESUME_SNAPSHOT_STAGE, snapshot)

    plan = plan_resume(run_id)
    assert plan.resumable is False
    assert plan.reason == "brief_mismatch"


def test_a_snapshot_from_older_code_is_refused_rather_than_reinterpreted():
    run_id = _run_id()
    _start(run_id, TitleFailsLLM(quality_scores=[9]))

    snapshot = read_stage_result(run_id, RESUME_SNAPSHOT_STAGE)
    snapshot["data"]["snapshot_version"] = 2
    write_stage_result(run_id, RESUME_SNAPSHOT_STAGE, snapshot)

    assert plan_resume(run_id).reason == "snapshot_version_unsupported"


def test_an_unknown_run_and_a_running_run_are_both_refused():
    assert plan_resume("no-such-run").reason == "run_not_found"

    run_id = _run_id()
    RunRecorder().queue(run_id)
    assert plan_resume(run_id).reason == "run_not_failed"


def test_a_run_that_failed_before_any_stage_finished_has_nothing_to_resume():
    run_id = _run_id()
    recorder = RunRecorder()
    recorder.queue(run_id)
    recorder.start_stage(run_id, "stage_v3_outline")
    recorder.fail(run_id, "stage_v3_outline", _quota_fault())

    plan = plan_resume(run_id)
    assert plan.resumable is False
    assert plan.reason == "no_snapshot"


def test_the_ledger_carries_forward_so_the_second_leg_is_not_free():
    """Spend is per article, not per attempt.

    A resumed leg counting from zero would report the cheap tail as the cost
    of the article, and would hand the repair gate a budget the run had
    already spent.
    """
    first_leg = Prompt2BlogTokenUsageTracker()
    first_leg.begin_stage("stage_v3_compose")
    first_leg.record(
        "gemini-2.5-flash",
        {"input_tokens": 1000, "output_tokens": 500, "total_tokens": 1500},
    )
    first_leg.begin_stage("stage_v3_quality_audit")
    first_leg.record(
        "gemini-2.5-flash",
        {"input_tokens": 200, "output_tokens": 100, "total_tokens": 300},
    )

    second_leg = Prompt2BlogTokenUsageTracker.from_ledger(first_leg.ledger())

    assert second_leg.totals()["total_tokens"] == 1800
    assert second_leg.successful_calls == 2
    # The next audit is attempt 2, so the first audit's row is not overwritten.
    assert second_leg.begin_stage("stage_v3_quality_audit") == 2
    assert second_leg.attempt_usage("stage_v3_compose", 1)["total_tokens"] == 1500


def test_a_missing_ledger_restores_an_empty_tracker_rather_than_failing():
    tracker = Prompt2BlogTokenUsageTracker.from_ledger(None)
    assert tracker.totals()["total_tokens"] == 0
    assert tracker.successful_calls == 0


def _preview(run_id: str) -> dict[str, Any]:
    return response_payload(prompt2blog_routes.preview_resume(run_id))


def test_the_preview_route_reports_what_a_resume_would_skip():
    """Free to ask, so the operator decides with the numbers in front of them."""
    run_id = _run_id()
    _start(run_id, TitleFailsLLM(quality_scores=[9]))

    payload = _preview(run_id)
    assert payload["resumable"] is True
    assert payload["resume_from_stage"] == "stage_v3_title"
    assert payload["failure_kind"] == "quota_exhausted"
    assert "stage_v3_compose" in payload["completed_stages"]
    assert payload["resume_count"] == 0


def test_the_preview_route_is_a_404_for_a_run_that_does_not_exist():
    with pytest.raises(HTTPException) as raised:
        prompt2blog_routes.preview_resume("no-such-run")
    assert raised.value.status_code == 404


def test_the_resume_route_queues_the_run_it_was_given(monkeypatch):
    run_id = _run_id()
    _start(run_id, TitleFailsLLM(quality_scores=[9]))
    monkeypatch.setattr(runs_api, "_prompt2blog_credential_for_run", lambda: None)
    background = BackgroundTasks()

    payload = response_payload(
        prompt2blog_routes.resume_run(run_id, background, None)
    )

    assert payload["status"] == "queued"
    # Same run, not a new one: the article, the ledger and the operator's link
    # all stay pointed at one place.
    assert payload["run_id"] == run_id
    assert payload["resume_from_stage"] == "stage_v3_title"
    assert len(background.tasks) == 1


def test_the_resume_route_refuses_a_run_that_did_not_fail(monkeypatch):
    run_id = _run_id()
    RunRecorder().queue(run_id)
    monkeypatch.setattr(runs_api, "_prompt2blog_credential_for_run", lambda: None)

    with pytest.raises(HTTPException) as raised:
        prompt2blog_routes.resume_run(run_id, BackgroundTasks(), None)

    assert raised.value.status_code == 409
    assert "not failed" in raised.value.detail
    # Nothing was queued, so nothing was spent.
    assert _preview(run_id)["resumable"] is False
