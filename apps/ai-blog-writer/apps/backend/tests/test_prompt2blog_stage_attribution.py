from __future__ import annotations

from typing import Any

from app.features.prompt2blog.dependencies import (
    DefaultPrompt2BlogLLM,
    PipelineDependencies,
)
from app.features.prompt2blog.pricing import Prompt2BlogTokenUsageTracker
from app.features.prompt2blog.run_recorder import RunRecorder

MODEL = "gemini-3.7-flash"


def _usage(input_tokens: int, output_tokens: int) -> dict[str, int]:
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
    }


def _wired_recorder():
    tracker = Prompt2BlogTokenUsageTracker()
    recorded: list[tuple[str, dict[str, Any]]] = []
    recorder = RunRecorder(
        status_writer=lambda *args, **kwargs: None,
        stage_writer=lambda run_id, stage, payload: recorded.append((stage, payload)),
        artifact_writer=lambda *args, **kwargs: None,
        clock=lambda: "2026-08-24T00:00:00+00:00",
        usage_reader=tracker.totals,
        usage_writer=tracker.record_stage_usage,
    )
    return tracker, recorder, recorded


def _by_stage(tracker: Prompt2BlogTokenUsageTracker) -> list[dict[str, Any]]:
    return tracker.summary(
        stack_id="balanced",
        worker_model=MODEL,
        writing_model=MODEL,
        audit_model=MODEL,
    )["by_stage"]


def test_a_stage_carries_the_tokens_spent_inside_it():
    tracker, recorder, recorded = _wired_recorder()

    recorder.start_stage("run-1", "stage_outline")
    tracker.record(MODEL, _usage(400, 100))
    recorder.record_stage("run-1", "stage_outline", {"outline": "ok"})

    stage, payload = recorded[0]
    assert stage == "stage_outline"
    assert payload["data"]["outline"] == "ok"
    assert payload["data"]["stage_usage"] == {
        "input_tokens": 400,
        "output_tokens": 100,
        "reasoning_tokens": 0,
        "cached_input_tokens": 0,
        "total_tokens": 500,
        "calls": 1,
    }


def test_a_stage_is_not_charged_for_what_earlier_stages_spent():
    tracker, recorder, recorded = _wired_recorder()

    recorder.start_stage("run-1", "stage_outline")
    tracker.record(MODEL, _usage(400, 100))
    recorder.record_stage("run-1", "stage_outline", {})
    recorder.start_stage("run-1", "stage_compose")
    tracker.record(MODEL, _usage(1_000, 2_000))
    recorder.record_stage("run-1", "stage_compose", {})

    assert recorded[1][1]["data"]["stage_usage"]["total_tokens"] == 3_000
    assert _by_stage(tracker) == [
        {
            "stage": "stage_compose",
            "input_tokens": 1_000,
            "output_tokens": 2_000,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
            "total_tokens": 3_000,
            "calls": 1,
        },
        {
            "stage": "stage_outline",
            "input_tokens": 400,
            "output_tokens": 100,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
            "total_tokens": 500,
            "calls": 1,
        },
    ]


def test_a_repeated_stage_accumulates_its_usage():
    """Groundedness and the quality audit run once per repair pass."""
    tracker, recorder, _ = _wired_recorder()

    for _pass in range(3):
        recorder.start_stage("run-1", "stage_groundedness")
        tracker.record(MODEL, _usage(200, 50))
        recorder.record_stage("run-1", "stage_groundedness", {})

    rows = _by_stage(tracker)
    assert len(rows) == 1
    assert rows[0]["total_tokens"] == 750
    assert rows[0]["calls"] == 3


def test_a_stage_that_records_twice_does_not_double_count():
    """`stage_final_verify` writes once for the re-grounding call and once for
    the verification summary."""
    tracker, recorder, recorded = _wired_recorder()

    recorder.start_stage("run-1", "stage_final_verify")
    tracker.record(MODEL, _usage(900, 100))
    recorder.record_stage("run-1", "stage_final_verify", {"groundedness": {}})
    recorder.record_stage("run-1", "stage_final_verify", {"regrounded": True})

    assert recorded[0][1]["data"]["stage_usage"]["total_tokens"] == 1_000
    assert recorded[1][1]["data"]["stage_usage"]["total_tokens"] == 0
    rows = _by_stage(tracker)
    assert len(rows) == 1
    assert rows[0]["total_tokens"] == 1_000
    assert rows[0]["calls"] == 1


def test_a_stage_with_no_llm_call_gets_a_zero_row():
    tracker, recorder, recorded = _wired_recorder()

    recorder.start_stage("run-1", "stage_input_validate")
    recorder.record_stage("run-1", "stage_input_validate", {})

    assert recorded[0][1]["data"]["stage_usage"]["total_tokens"] == 0
    assert _by_stage(tracker) == [
        {
            "stage": "stage_input_validate",
            "input_tokens": 0,
            "output_tokens": 0,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
            "total_tokens": 0,
            "calls": 0,
        }
    ]


def test_debug_dumps_written_outside_any_open_stage_are_not_attributed():
    tracker, recorder, recorded = _wired_recorder()

    tracker.record(MODEL, _usage(400, 100))
    recorder.record_stage("run-1", "langgraph_trace", {"nodes": []})

    assert "stage_usage" not in recorded[0][1]["data"]
    assert _by_stage(tracker) == []


def test_a_recorder_without_a_usage_reader_writes_no_stage_usage():
    recorded: list[tuple[str, dict[str, Any]]] = []
    recorder = RunRecorder(
        status_writer=lambda *args, **kwargs: None,
        stage_writer=lambda run_id, stage, payload: recorded.append((stage, payload)),
        artifact_writer=lambda *args, **kwargs: None,
        clock=lambda: "2026-08-24T00:00:00+00:00",
    )

    recorder.start_stage("run-1", "stage_outline")
    recorder.record_stage("run-1", "stage_outline", {"outline": "ok"})

    assert recorded[0][1]["data"] == {"outline": "ok"}


def test_a_broken_usage_reader_never_breaks_the_stage_record():
    recorded: list[tuple[str, dict[str, Any]]] = []

    def exploding_reader() -> dict[str, int]:
        raise RuntimeError("tracker gone")

    recorder = RunRecorder(
        status_writer=lambda *args, **kwargs: None,
        stage_writer=lambda run_id, stage, payload: recorded.append((stage, payload)),
        artifact_writer=lambda *args, **kwargs: None,
        clock=lambda: "2026-08-24T00:00:00+00:00",
        usage_reader=exploding_reader,
    )

    recorder.start_stage("run-1", "stage_outline")
    recorder.record_stage("run-1", "stage_outline", {"outline": "ok"})

    assert recorded[0][1]["data"] == {"outline": "ok"}


def test_pipeline_dependencies_wires_the_recorder_to_the_usage_tracker():
    dependencies = PipelineDependencies(llm=DefaultPrompt2BlogLLM())
    tracker = dependencies.llm.usage_tracker

    dependencies.recorder.start_stage("run-1", "stage_title")
    tracker.record(MODEL, _usage(60, 20))
    dependencies.recorder.record_stage("run-1", "stage_title", {})

    assert _by_stage(tracker) == [
        {
            "stage": "stage_title",
            "input_tokens": 60,
            "output_tokens": 20,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
            "total_tokens": 80,
            "calls": 1,
        }
    ]


def test_an_llm_double_without_a_tracker_leaves_the_recorder_alone():
    class FakeLLM:
        def invoke_text(self, **kwargs: Any) -> str:
            return ""

    dependencies = PipelineDependencies(llm=FakeLLM())

    assert dependencies.recorder.usage_reader is None
    assert dependencies.recorder.usage_writer is None


def test_stage_attribution_sums_to_the_run_total():
    """Per-stage rows are only worth acting on if they account for the whole
    run. A stage boundary that leaked would quietly hide spend."""
    tracker, recorder, _ = _wired_recorder()

    spends = [
        ("stage_input_cleanup", 5_000, 3_000),
        ("stage_outline", 8_000, 900),
        ("stage_compose", 20_000, 4_000),
        ("stage_quality_audit", 22_000, 600),
        ("stage_title", 9_000, 40),
    ]
    for stage, input_tokens, output_tokens in spends:
        recorder.start_stage("run-1", stage)
        tracker.record(MODEL, _usage(input_tokens, output_tokens))
        recorder.record_stage("run-1", stage, {})

    summary = tracker.summary(
        stack_id="balanced",
        worker_model=MODEL,
        writing_model=MODEL,
        audit_model=MODEL,
    )
    rows = summary["by_stage"]

    assert sum(row["total_tokens"] for row in rows) == summary["total_tokens"]
    assert sum(row["input_tokens"] for row in rows) == summary["input_tokens"]
    assert sum(row["output_tokens"] for row in rows) == summary["output_tokens"]
    assert sum(row["calls"] for row in rows) == summary["measured_calls"]
    # Sorted by spend, so the stage worth capping first is the first row.
    assert rows[0]["stage"] == "stage_compose"
