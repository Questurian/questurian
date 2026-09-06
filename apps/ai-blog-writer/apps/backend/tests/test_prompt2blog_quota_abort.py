"""Stopping the run when the account is exhausted, and only then.

The v3 graph's grounding stage catches every exception and degrades, which is
right for the failure it was built for -- a checker that returned nonsense --
and wrong for an exhausted account. Degrading there recorded "grounding check
did not run", let the graph continue, and spent the audit stage's call on the
same dead credential.

So the two halves are tested together. A fatal fault stops the run before the
next stage; anything else degrades exactly as it always did.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest

from app.features.prompt2blog.dependencies import PipelineDependencies
from tests.prompt2blog_packet_support import runtime_for
from app.features.prompt2blog.orchestrator_v3 import run_pipeline_v3
from app.shared.provider_faults import provider_fault_kind
from tests.test_prompt2blog_v3_pipeline import ScriptedLLM, _request
from utils.claude_cli_llm import ClaudeCliUnavailable


@dataclass
class FailureRecordingRecorder:
    """A recorder that keeps the failure instead of asserting it away."""

    stages: dict[str, Any] = field(default_factory=dict)
    order: list[str] = field(default_factory=list)
    artifacts: list[dict[str, Any]] = field(default_factory=list)
    completed: list[str] = field(default_factory=list)
    failures: list[tuple[str, Exception]] = field(default_factory=list)
    active: str = ""

    def start_stage(self, _run_id: str, stage: str) -> None:
        self.order.append(stage)
        self.active = stage

    def record_stage(self, _run_id: str, stage: str, payload: dict[str, Any]) -> None:
        self.stages[stage] = payload

    def record_artifact(self, _run_id: str, artifact: dict[str, Any]) -> None:
        self.artifacts.append(artifact)

    def complete(self, run_id: str) -> None:
        self.completed.append(run_id)

    def fail(self, _run_id: str, stage: str, error: Exception, **_kwargs) -> None:
        self.failures.append((stage, error))

    def active_stage(self, _run_id: str, fallback: str = "graph_execution") -> str:
        return self.active or fallback


class FaultingLLM(ScriptedLLM):
    """The scripted pipeline LLM, with one stage rigged to fail.

    ``fault`` is raised the first time the named stage's prompt arrives. Every
    other stage answers normally, so a stage that runs after the fault shows up
    as a recorded prompt -- which is exactly what must not happen.
    """

    def __init__(self, *, stage_marker: str, fault: Exception, **kwargs) -> None:
        super().__init__(**kwargs)
        self._stage_marker = stage_marker
        self._fault = fault
        self.fault_raised = 0

    def invoke_json(self, *, prompt: str, **kwargs) -> tuple[dict[str, Any], str]:
        if self._stage_marker in prompt:
            self.fault_raised += 1
            raise self._fault
        return super().invoke_json(prompt=prompt, **kwargs)


def _run_with(fault: Exception, *, stage_marker: str = "fact-grounding checker"):
    llm = FaultingLLM(
        stage_marker=stage_marker,
        fault=fault,
        quality_scores=[9],
    )
    recorder = FailureRecordingRecorder()
    runtime = runtime_for(_request())
    return llm, recorder, runtime


def _stages_called(llm: ScriptedLLM) -> list[str]:
    return [stage for stage, _prompt in llm.prompts]


def test_an_exhausted_account_at_fact_check_stops_before_the_audit():
    """The regression, stated as the thing that cost the money.

    The audit is the next stage after grounding and it is a full model call.
    It must not happen.
    """
    fault = ClaudeCliUnavailable(
        "Claude's account has hit its usage or spending limit, "
        "so the call was not completed.",
        kind="quota_exhausted",
    )
    llm, recorder, runtime = _run_with(fault)

    with pytest.raises(ClaudeCliUnavailable):
        run_pipeline_v3(
            "quota-abort-run",
            runtime,
            PipelineDependencies(llm=llm, recorder=recorder),
        )

    assert llm.fault_raised == 1
    assert "audit" not in _stages_called(llm), (
        "the audit stage must not be called after the account is exhausted"
    )
    assert "repair" not in _stages_called(llm)
    assert "title" not in _stages_called(llm)
    assert "stage_v3_quality_audit" not in recorder.order


def test_the_failure_is_recorded_against_the_stage_that_actually_failed():
    """Not the stage that failed second because the first one shrugged."""
    fault = ClaudeCliUnavailable("limit reached", kind="quota_exhausted")
    llm, recorder, runtime = _run_with(fault)

    with pytest.raises(ClaudeCliUnavailable):
        run_pipeline_v3(
            "quota-stage-run",
            runtime,
            PipelineDependencies(llm=llm, recorder=recorder),
        )

    assert len(recorder.failures) == 1
    failed_stage, error = recorder.failures[0]
    assert failed_stage == "stage_v3_groundedness"
    assert provider_fault_kind(error) == "quota_exhausted"


def test_a_disconnected_claude_also_stops_the_run():
    fault = ClaudeCliUnavailable(
        "Claude is not connected on this machine, so nothing was sent.",
        kind="not_connected",
    )
    llm, recorder, runtime = _run_with(fault)

    with pytest.raises(ClaudeCliUnavailable):
        run_pipeline_v3(
            "not-connected-run",
            runtime,
            PipelineDependencies(llm=llm, recorder=recorder),
        )

    assert "audit" not in _stages_called(llm)


@pytest.mark.parametrize(
    "fault",
    [
        ClaudeCliUnavailable("upstream reset", kind="provider_unavailable"),
        ClaudeCliUnavailable("unparseable answer", kind="invalid_response"),
        RuntimeError("Failed to parse JSON LLM response"),
    ],
    ids=["transient", "unusable-answer", "parse-failure"],
)
def test_an_ordinary_checker_failure_still_degrades_and_finishes(fault):
    """The behaviour that was correct before and stays correct.

    These are the failures degrading was built for. The run completes, the
    grounding verdict is recorded as unchecked, and the audit still happens.
    """
    llm, recorder, runtime = _run_with(fault)

    state = run_pipeline_v3(
        "degrade-run",
        runtime,
        PipelineDependencies(llm=llm, recorder=recorder),
    )

    assert state["completed"] is True
    assert recorder.failures == []
    assert "audit" in _stages_called(llm)
    assert state["groundedness"]["checked"] is False
    assert state["groundedness"]["grounded"] is True


def test_a_quota_fault_in_the_outline_stage_stops_before_composing():
    """The other stage that degrades, and the more expensive one to get wrong.

    Composing after a fatal fault would be a full article write on the writer
    model against a dead account.
    """
    fault = ClaudeCliUnavailable("limit reached", kind="quota_exhausted")
    llm, recorder, runtime = _run_with(
        fault,
        stage_marker="planning an article before it is written",
    )

    with pytest.raises(ClaudeCliUnavailable):
        run_pipeline_v3(
            "outline-quota-run",
            runtime,
            PipelineDependencies(llm=llm, recorder=recorder),
        )

    assert "compose" not in _stages_called(llm)
    assert recorder.failures[0][0] == "stage_v3_outline"
