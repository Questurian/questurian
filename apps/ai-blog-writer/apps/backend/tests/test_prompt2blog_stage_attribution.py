from __future__ import annotations

from typing import Any

from app.features.prompt2blog.dependencies import (
    DefaultPrompt2BlogLLM,
    PipelineDependencies,
)
from app.features.prompt2blog.pricing import Prompt2BlogTokenUsageTracker
from app.features.prompt2blog.run_recorder import USAGE_LEDGER_STAGE, RunRecorder

MODEL = "gemini-2.5-flash"


def _usage(input_tokens: int, output_tokens: int) -> dict[str, int]:
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
    }


def _wired_recorder():
    tracker = Prompt2BlogTokenUsageTracker()
    written: list[tuple[str, dict[str, Any]]] = []
    recorder = RunRecorder(
        status_writer=lambda *args, **kwargs: None,
        stage_writer=lambda run_id, stage, payload: written.append((stage, payload)),
        artifact_writer=lambda *args, **kwargs: None,
        clock=lambda: "2026-08-24T00:00:00+00:00",
        usage_tracker=tracker,
    )
    # The ledger row is written after every stage row. Tests that count stage
    # rows want the pipeline's own writes, so it is filtered out here and
    # asserted on directly in the ledger tests below.
    recorded = _StageRows(written)
    return tracker, recorder, recorded


class _StageRows:
    def __init__(self, written: list[tuple[str, dict[str, Any]]]) -> None:
        self._written = written

    def _rows(self) -> list[tuple[str, dict[str, Any]]]:
        return [row for row in self._written if row[0] != USAGE_LEDGER_STAGE]

    def __getitem__(self, index: int) -> tuple[str, dict[str, Any]]:
        return self._rows()[index]

    def __len__(self) -> int:
        return len(self._rows())

    def ledgers(self) -> list[dict[str, Any]]:
        return [
            payload["data"]
            for stage, payload in self._written
            if stage == USAGE_LEDGER_STAGE
        ]


def _summary(tracker: Prompt2BlogTokenUsageTracker) -> dict[str, Any]:
    return tracker.summary(
        stack_id="balanced",
        worker_model=MODEL,
        writing_model=MODEL,
        audit_model=MODEL,
    )


def _by_stage(tracker: Prompt2BlogTokenUsageTracker) -> list[dict[str, Any]]:
    return _summary(tracker)["by_stage"]


def test_a_stage_carries_the_tokens_spent_inside_it():
    tracker, recorder, recorded = _wired_recorder()

    recorder.start_stage("run-1", "stage_outline")
    tracker.record(MODEL, _usage(400, 100))
    recorder.record_stage("run-1", "stage_outline", {"outline": "ok"})

    stage, payload = recorded[0]
    assert stage == "stage_outline"
    assert payload["data"]["outline"] == "ok"
    assert payload["data"]["stage_attempt"] == 1
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
            "attempts": 1,
            "cost_usd": 0.0053,
        },
        {
            "stage": "stage_outline",
            "input_tokens": 400,
            "output_tokens": 100,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
            "total_tokens": 500,
            "calls": 1,
            "attempts": 1,
            "cost_usd": 0.00037,
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
    assert rows[0]["attempts"] == 3


def test_each_attempt_of_a_stage_keeps_its_own_row():
    """The bug this exists for: the stage row is keyed `(run_id, stage)`, so a
    second fact-check overwrote the first one's receipt and ~30,000 tokens
    vanished from the displayed accounting."""
    tracker, recorder, recorded = _wired_recorder()

    for tokens in (10_000, 20_000, 30_000):
        recorder.start_stage("run-1", "stage_v3_quality_audit")
        tracker.record(MODEL, _usage(tokens, 0))
        recorder.record_stage("run-1", "stage_v3_quality_audit", {})

    # Storage keeps only the last of the three stage rows...
    assert recorded[2][1]["data"]["stage_attempt"] == 3
    assert recorded[2][1]["data"]["stage_usage"]["total_tokens"] == 30_000
    # ...and the ledger keeps all three.
    attempts = _summary(tracker)["by_attempt"]
    assert [(row["attempt"], row["total_tokens"]) for row in attempts] == [
        (1, 10_000),
        (2, 20_000),
        (3, 30_000),
    ]
    assert _summary(tracker)["total_tokens"] == 60_000


def test_the_ledger_records_every_call_in_order():
    tracker, recorder, recorded = _wired_recorder()

    recorder.start_stage("run-1", "stage_compose")
    tracker.record(MODEL, _usage(1_000, 500))
    tracker.record(MODEL, _usage(200, 100))
    recorder.record_stage("run-1", "stage_compose", {})

    ledger = recorded.ledgers()[-1]
    assert [entry["seq"] for entry in ledger["calls"]] == [1, 2]
    assert [entry["stage"] for entry in ledger["calls"]] == [
        "stage_compose",
        "stage_compose",
    ]
    assert [entry["attempt"] for entry in ledger["calls"]] == [1, 1]
    assert ledger["totals"]["total_tokens"] == 1_800
    assert ledger["unmetered_calls"] == 0


def test_a_failed_run_still_writes_its_ledger():
    """A crash spent real tokens; it must not be free in the accounting."""
    tracker, recorder, recorded = _wired_recorder()

    recorder.start_stage("run-1", "stage_compose")
    tracker.record(MODEL, _usage(4_000, 1_000))
    recorder.fail("run-1", "stage_compose", RuntimeError("boom"))

    ledger = recorded.ledgers()[-1]
    assert ledger["totals"]["total_tokens"] == 5_000


def test_a_stage_that_records_twice_reports_the_attempt_not_a_delta():
    """`stage_final_verify` writes once for the re-grounding call and once for
    the verification summary. The second write replaces the first in storage,
    so it has to carry the attempt's whole spend rather than a zero delta."""
    tracker, recorder, recorded = _wired_recorder()

    recorder.start_stage("run-1", "stage_final_verify")
    tracker.record(MODEL, _usage(900, 100))
    recorder.record_stage("run-1", "stage_final_verify", {"groundedness": {}})
    recorder.record_stage("run-1", "stage_final_verify", {"regrounded": True})

    assert recorded[0][1]["data"]["stage_usage"]["total_tokens"] == 1_000
    assert recorded[1][1]["data"]["stage_usage"]["total_tokens"] == 1_000
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
            "attempts": 1,
            # A stage that made no call spent nothing, which is a price and
            # not an absence of one.
            "cost_usd": 0.0,
        }
    ]


def test_a_call_made_outside_any_stage_is_shown_as_unattributed():
    """Not dropped, and not silently added to a neighbouring stage: a run whose
    stage rows do not add up should say so on the receipt."""
    tracker, recorder, recorded = _wired_recorder()

    tracker.record(MODEL, _usage(400, 100))
    recorder.record_stage("run-1", "langgraph_trace", {"nodes": []})

    assert "stage_usage" not in recorded[0][1]["data"]
    rows = _by_stage(tracker)
    assert [row["stage"] for row in rows] == ["unattributed"]
    assert rows[0]["total_tokens"] == 500


def test_a_call_the_provider_reported_nothing_about_is_still_a_call():
    tracker, recorder, recorded = _wired_recorder()

    recorder.start_stage("run-1", "stage_title")
    tracker.record(MODEL, None)
    recorder.record_stage("run-1", "stage_title", {})

    summary = _summary(tracker)
    assert summary["successful_calls"] == 1
    assert summary["measured_calls"] == 0
    assert summary["unmetered_calls"] == 1
    assert summary["measurement_status"] == "unavailable"
    assert recorded.ledgers()[-1]["calls"][0]["metered"] is False


def test_a_recorder_without_a_tracker_writes_no_stage_usage():
    recorded: list[tuple[str, dict[str, Any]]] = []
    recorder = RunRecorder(
        status_writer=lambda *args, **kwargs: None,
        stage_writer=lambda run_id, stage, payload: recorded.append((stage, payload)),
        artifact_writer=lambda *args, **kwargs: None,
        clock=lambda: "2026-08-24T00:00:00+00:00",
    )

    recorder.start_stage("run-1", "stage_outline")
    recorder.record_stage("run-1", "stage_outline", {"outline": "ok"})

    assert [stage for stage, _ in recorded] == ["stage_outline"]
    assert recorded[0][1]["data"] == {"outline": "ok"}


def test_a_broken_tracker_never_breaks_the_stage_record():
    recorded: list[tuple[str, dict[str, Any]]] = []

    class ExplodingTracker:
        def begin_stage(self, stage: str) -> int:
            raise RuntimeError("tracker gone")

        def attempt_usage(self, stage: str, attempt: int) -> dict[str, int]:
            raise RuntimeError("tracker gone")

        def ledger(self) -> dict[str, Any]:
            raise RuntimeError("tracker gone")

    recorder = RunRecorder(
        status_writer=lambda *args, **kwargs: None,
        stage_writer=lambda run_id, stage, payload: recorded.append((stage, payload)),
        artifact_writer=lambda *args, **kwargs: None,
        clock=lambda: "2026-08-24T00:00:00+00:00",
        usage_tracker=ExplodingTracker(),
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
            "attempts": 1,
            "cost_usd": 6.8e-05,
        }
    ]


def test_an_llm_double_without_a_tracker_leaves_the_recorder_alone():
    class FakeLLM:
        def invoke_text(self, **kwargs: Any) -> str:
            return ""

    dependencies = PipelineDependencies(llm=FakeLLM())

    assert dependencies.recorder.usage_tracker is None


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

    summary = _summary(tracker)
    rows = summary["by_stage"]

    assert sum(row["total_tokens"] for row in rows) == summary["total_tokens"]
    assert sum(row["input_tokens"] for row in rows) == summary["input_tokens"]
    assert sum(row["output_tokens"] for row in rows) == summary["output_tokens"]
    assert sum(row["calls"] for row in rows) == summary["measured_calls"]
    assert summary["attributed_total_tokens"] == summary["total_tokens"]
    # Sorted by spend, so the stage worth capping first is the first row.
    assert rows[0]["stage"] == "stage_compose"


def test_a_repair_loop_totals_every_pass():
    """The whole point of the ledger: the second fact-check adds to the run,
    it does not replace the first."""
    tracker, recorder, _ = _wired_recorder()

    passes = [
        ("stage_v3_groundedness", 30_065),
        ("stage_v3_quality_audit", 60_000),
        ("stage_v3_repair", 89_480),
        ("stage_v3_groundedness", 30_065),
        ("stage_v3_quality_audit", 30_000),
    ]
    for stage, tokens in passes:
        recorder.start_stage("run-1", stage)
        tracker.record(MODEL, _usage(tokens, 0))
        recorder.record_stage("run-1", stage, {})

    summary = _summary(tracker)
    assert summary["total_tokens"] == 239_610
    assert summary["attributed_total_tokens"] == 239_610
    assert len(summary["by_attempt"]) == 5
