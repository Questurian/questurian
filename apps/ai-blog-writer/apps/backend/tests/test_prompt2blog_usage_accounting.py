"""What a run actually cost, and the four ways it used not to say so.

Measured on real runs before any of this was written:

- run `cac73671` recorded one call, 2,196 tokens, under stage `unattributed`,
  beside a `stage_v4_grill` row claiming it had spent nothing;
- run `b78a9fe8` finished with a ledger holding eight calls, every one of them
  a writing-graph stage. The grill, brief, work order and research structuring
  calls had all been written to that row earlier in the run and were gone;
- the same run's eight grounded searches cost 27,207 tokens (one of them
  reporting nothing at all), and the ledger counted none of them. Run
  `76b36468` was 31,992 over seven searches, likewise counted as zero.

The per-run ceiling reads that same total, so it was guarding a number missing
most of the run. These tests are what stop each of those coming back.
"""

from __future__ import annotations

import threading
import time
from typing import Any

from app.features.prompt2blog.api import intake as intake_api
from app.features.prompt2blog.pricing import (
    UNATTRIBUTED_STAGE,
    Prompt2BlogTokenUsageTracker,
)
from app.features.prompt2blog.run_recorder import RunRecorder


class _Result:
    """A grounded search response, as `invoke_google_grounded_text` returns it."""

    def __init__(
        self,
        *,
        input_tokens: int | None = 100,
        output_tokens: int | None = 50,
        total_tokens: int | None = 150,
        model_name: str = "gemini-3.7-flash",
    ) -> None:
        self.text = "What the search found."
        self.source_urls = ["https://example.pe/a"]
        self.model_name = model_name
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.total_tokens = total_tokens


def _grounded(monkeypatch, result: Any) -> Prompt2BlogTokenUsageTracker:
    """Run one grounded call against `result` and hand back the tracker."""
    import utils

    monkeypatch.setattr(
        utils, "invoke_google_grounded_text", lambda *_a, **_k: result
    )
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.begin_stage("stage_v4_research_notes")
    intake_api._grounded_call(
        "What do the stalls charge?",
        # The call names its job; the model is the gateway's answer. An
        # explicit model here would be an operator override, which this
        # search does not have.
        job_id="p2b.research_gather",
        max_tokens=4_000,
        usage_recorder=tracker.record,
    )
    return tracker


# --- the searches are counted ---------------------------------------------


def test_a_grounded_search_reaches_the_ledger(monkeypatch):
    """Grounded search is raw REST and never passed the adapters the ledger
    watches, so ten searches a run appeared on the receipt as nothing."""
    tracker = _grounded(monkeypatch, _Result())

    assert tracker.totals()["total_tokens"] == 150
    rows = {row["stage"]: row for row in tracker.ledger()["by_stage"]}
    assert rows["stage_v4_research_notes"]["calls"] == 1


def test_a_search_that_reported_nothing_is_unknown_rather_than_free(monkeypatch):
    """One search in each of the two real runs came back with no usage block.

    Recording it as zero would say the search was free. It was not; we were
    not told what it cost, and the ledger has to keep those apart.
    """
    tracker = _grounded(
        monkeypatch,
        _Result(input_tokens=None, output_tokens=None, total_tokens=None),
    )

    ledger = tracker.ledger()
    assert ledger["successful_calls"] == 1
    assert ledger["unmetered_calls"] == 1
    assert ledger["totals"]["total_tokens"] == 0


def test_a_failed_search_is_not_recorded_as_a_call(monkeypatch):
    """`None` means the call failed, not that it succeeded and cost nothing."""
    tracker = _grounded(monkeypatch, None)

    assert tracker.ledger()["successful_calls"] == 0


# --- the call is filed under the stage that paid for it --------------------


def test_a_call_made_before_its_stage_opens_is_unattributed():
    """The failure this exists to stop, stated as the behaviour it depends on."""
    tracker = Prompt2BlogTokenUsageTracker()

    tracker.record("gemini-3.1-pro-preview", {"input_tokens": 1_121, "output_tokens": 1_075})
    tracker.begin_stage("stage_v4_grill")

    rows = {row["stage"]: row for row in tracker.ledger()["by_stage"]}
    assert rows[UNATTRIBUTED_STAGE]["total_tokens"] == 2_196
    assert rows["stage_v4_grill"]["total_tokens"] == 0


def test_opening_the_stage_first_puts_the_spend_on_its_row():
    tracker = Prompt2BlogTokenUsageTracker()

    tracker.begin_stage("stage_v4_grill")
    tracker.record("gemini-3.1-pro-preview", {"input_tokens": 1_121, "output_tokens": 1_075})

    rows = {row["stage"]: row for row in tracker.ledger()["by_stage"]}
    assert rows["stage_v4_grill"]["total_tokens"] == 2_196
    assert UNATTRIBUTED_STAGE not in rows


def test_recording_does_not_open_a_second_attempt_over_the_call():
    """`_record` runs after the stage is already open.

    Opening again would number a fresh attempt, and the stage row would then
    report that attempt -- which the call was not filed under -- as zero.
    """
    written: list[tuple[str, dict[str, Any]]] = []
    tracker = Prompt2BlogTokenUsageTracker()
    recorder = RunRecorder(
        status_writer=lambda *_a, **_k: None,
        stage_writer=lambda _run, stage, payload: written.append((stage, payload)),
        artifact_writer=lambda *_a, **_k: None,
        clock=lambda: "2026-09-01T00:00:00Z",
        usage_tracker=tracker,
    )

    recorder.start_stage("run-1", "stage_v4_grill")
    tracker.record("gemini-3.1-pro-preview", {"input_tokens": 1_121, "output_tokens": 1_075})
    recorder.start_stage_once("run-1", "stage_v4_grill")
    recorder.record_stage("run-1", "stage_v4_grill", {"status": "ok"})

    row = next(payload for stage, payload in written if stage == "stage_v4_grill")
    assert row["data"]["stage_usage"]["total_tokens"] == 2_196
    assert row["data"]["stage_attempt"] == 1


def test_start_stage_still_opens_a_fresh_attempt_when_a_stage_repeats():
    """The writing graph depends on this; `_once` must not have changed it."""
    tracker = Prompt2BlogTokenUsageTracker()
    recorder = RunRecorder(
        status_writer=lambda *_a, **_k: None,
        stage_writer=lambda *_a, **_k: None,
        artifact_writer=lambda *_a, **_k: None,
        clock=lambda: "2026-09-01T00:00:00Z",
        usage_tracker=tracker,
    )

    recorder.start_stage("run-1", "stage_v3_quality_audit")
    recorder.start_stage("run-1", "stage_v3_quality_audit")

    assert recorder.active_attempts["run-1"] == 2


# --- the ledger continues instead of being replaced ------------------------


def test_a_new_leg_continues_the_stored_ledger(monkeypatch):
    """Every leg wrote its own tracker's ledger under one stage name.

    So each leg replaced the run's accounting rather than extending it, and a
    finished run reported only whatever the last leg spent.
    """
    from app.features.prompt2blog import dependencies as deps_module

    first = Prompt2BlogTokenUsageTracker()
    first.begin_stage("stage_v4_grill")
    first.record("gemini-3.1-pro-preview", {"input_tokens": 1_121, "output_tokens": 1_075})
    stored = {"data": first.ledger()}

    monkeypatch.setattr(deps_module, "read_stage_result", lambda *_a, **_k: stored)

    pipeline = deps_module.dependencies_for_run("run-1")
    tracker = pipeline.llm.usage_tracker
    tracker.begin_stage("stage_v3_outline")
    tracker.record("claude-sonnet-5", {"input_tokens": 20_000, "output_tokens": 3_000})

    rows = {row["stage"]: row for row in tracker.ledger()["by_stage"]}
    assert rows["stage_v4_grill"]["total_tokens"] == 2_196
    assert rows["stage_v3_outline"]["total_tokens"] == 23_000
    assert tracker.totals()["total_tokens"] == 25_196


def test_a_run_with_no_stored_ledger_starts_empty(monkeypatch):
    """A first leg has nothing to continue, and must not invent anything."""
    from app.features.prompt2blog import dependencies as deps_module

    monkeypatch.setattr(deps_module, "read_stage_result", lambda *_a, **_k: None)

    tracker = deps_module.dependencies_for_run("run-1").llm.usage_tracker

    assert tracker.ledger()["successful_calls"] == 0


# --- concurrent searches do not lose calls ---------------------------------


def test_recording_is_mutually_exclusive():
    """Research runs its searches concurrently, so this is written in parallel.

    Every mutation in `record` is a read-modify-write, including the `seq`
    taken from the length of `calls`. Two interleaving calls would drop one or
    give two of them the same sequence number.

    This asserts the lock's actual guarantee rather than trying to observe the
    race, because on a GIL build the race almost never shows: an unlocked
    version of this passed 400 concurrent records with every sequence number
    intact. What can be proven is that two threads are never inside the
    critical section at once, and that fails immediately without the lock.
    """
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.begin_stage("stage_v4_research_notes")

    inside = 0
    peak = 0
    seen = threading.Lock()
    real = tracker._record_call

    def _watched(model_name, raw_usage, requested_model=None):
        nonlocal inside, peak
        with seen:
            inside += 1
            peak = max(peak, inside)
        # Wide enough that an unserialised caller is certain to overlap.
        time.sleep(0.001)
        real(model_name, raw_usage, requested_model)
        with seen:
            inside -= 1

    tracker._record_call = _watched
    start = threading.Barrier(8)

    def _record() -> None:
        start.wait()
        for _ in range(10):
            tracker.record("gemini-3.7-flash", {"input_tokens": 10, "output_tokens": 5})

    threads = [threading.Thread(target=_record) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert peak == 1

    ledger = tracker.ledger()
    assert ledger["successful_calls"] == 80
    assert len({call["seq"] for call in ledger["calls"]}) == 80
    assert ledger["totals"]["total_tokens"] == 80 * 15


def test_grounded_thinking_is_billed_at_output_rate(monkeypatch):
    result = _Result(input_tokens=100, output_tokens=50, total_tokens=350)
    result.reasoning_tokens = 200
    result.cached_input_tokens = 20
    tracker = _grounded(monkeypatch, result)
    totals = tracker.totals()
    assert totals["output_tokens"] == 250
    assert totals["reasoning_tokens"] == 200
    assert totals["cached_input_tokens"] == 20
    assert totals["total_tokens"] == 350


class _Usage:
    """The token counts a provider hands back, in the shape `normalize_token_usage` reads."""

    def __init__(self, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


def test_a_substituted_call_says_what_it_asked_for() -> None:
    """The chifa run recorded 39 Gemini calls and no sign three asked for Claude.

    Every Claude name is rewritten to a Gemini one when neither Claude path is
    switched on, and the ledger only ever kept the model that answered. So a
    run whose outline, groundedness and research structuring were configured
    for Claude read back as an ordinary all-Gemini run, and nothing in the
    receipt disagreed with that reading.
    """
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.begin_stage("stage_v3_outline")
    tracker.record(
        "gemini-2.5-flash",
        _Usage(10, 20),
        requested_model="claude-sonnet-5-medium",
    )

    (call,) = tracker.ledger()["calls"]
    assert call["model"] == "gemini-2.5-flash"
    assert call["asked_for"] == "claude-sonnet-5-medium"


def test_an_honest_call_carries_no_substitution_field() -> None:
    """Absence is the signal, so an ordinary call must not carry the field."""
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.begin_stage("stage_v3_compose")
    tracker.record(
        "gemini-2.5-flash",
        _Usage(10, 20),
        requested_model="gemini-2.5-flash",
    )
    tracker.record("gemini-2.5-flash", _Usage(10, 20))

    for call in tracker.ledger()["calls"]:
        assert "asked_for" not in call


def test_the_receipt_names_the_models_a_v4_run_actually_used() -> None:
    """A v4 run requests no routing, so the three role names were all null.

    `writing_request` builds the run's request and never sets `model_routing`,
    which left the receipt reporting `{"worker": null, "writer": null, "judge":
    null}` on every finished v4 article. The models were in the ledger the
    whole time.
    """
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.begin_stage("stage_v4_research")
    tracker.record("gemini-2.5-flash", _Usage(10, 20))
    tracker.record("gemini-2.5-flash", _Usage(10, 20))
    tracker.begin_stage("stage_v3_compose")
    tracker.record("claude-opus-5-high", _Usage(10, 20))
    tracker.begin_stage("stage_v3_quality_audit")
    tracker.record("gemini-2.5-flash", _Usage(10, 20))

    models = tracker.summary(
        stack_id=None, worker_model=None, writing_model=None, audit_model=None
    )["models"]
    assert models["writer"] == "claude-opus-5-high"
    assert models["judge"] == "gemini-2.5-flash"
    assert models["worker"] == "gemini-2.5-flash"


def test_a_run_that_named_its_routing_keeps_what_it_named() -> None:
    """The ledger is the fallback, not an override of an explicit choice."""
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.begin_stage("stage_v3_compose")
    tracker.record("gemini-2.5-flash", _Usage(10, 20))

    models = tracker.summary(
        stack_id="opus-led-high",
        worker_model="gemini-2.5-flash-lite",
        writing_model="claude-opus-5-high",
        audit_model="gemini-2.5-flash",
    )["models"]
    assert models["writer"] == "claude-opus-5-high"
