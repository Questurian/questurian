"""The API-usage emitter: what it reports, and what it refuses to do.

The emitter's whole promise is that it cannot hurt a pipeline. Most of these
tests are therefore about the failure paths -- a missing collector, a full
queue, a transport that raises -- rather than about the happy one.

Every test uses a synchronous emitter with a fake transport, so nothing here
opens a socket or starts a thread.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.shared import api_usage
from app.shared.token_usage import normalize_token_usage
from app.shared.api_usage import (
    CallObservation,
    UsageEmitter,
    UsageMonitorConfig,
    normalize_tokens,
    observe_external_call,
    provider_for_llm,
)


class _Collector:
    """Stands in for the dashboard. Records batches, optionally by failing."""

    def __init__(self, fail: bool = False) -> None:
        self.batches: list[list[dict[str, Any]]] = []
        self.fail = fail

    def __call__(self, events: list[dict[str, Any]]) -> None:
        if self.fail:
            raise OSError("collector refused the connection")
        self.batches.append(events)

    @property
    def events(self) -> list[dict[str, Any]]:
        return [event for batch in self.batches for event in batch]


def _emitter(collector: _Collector, service: str = "abw-backend") -> UsageEmitter:
    config = UsageMonitorConfig(
        url="http://collector.test/events",
        key=None,
        service=service,
        timeout_seconds=1.0,
    )
    return UsageEmitter(config, transport=collector, synchronous=True)


@pytest.fixture(autouse=True)
def _isolate_process_emitter():
    """No test may leave the process-wide emitter configured."""
    api_usage.set_emitter(None)
    yield
    api_usage.set_emitter(None)


def test_reports_a_successful_call_with_duration_and_model():
    collector = _Collector()
    with observe_external_call(
        provider="google-vertex",
        feature="prompt2blog",
        model="gemini-3.1-pro-preview",
        emitter=_emitter(collector),
    ) as observed:
        observed.record_usage({"input_tokens": 120, "output_tokens": 30})

    event = collector.events[0]
    assert event["service"] == "abw-backend"
    assert event["provider"] == "google-vertex"
    assert event["feature"] == "prompt2blog"
    assert event["model"] == "gemini-3.1-pro-preview"
    assert event["status"] == "ok"
    # `total` is derived when the provider omits it, so one column answers
    # "how many tokens" without the UI adding anything up.
    assert event["tokens"] == {"input": 120, "output": 30, "total": 150}
    assert event["durationMs"] >= 0


def test_a_raised_exception_is_reported_and_still_raised():
    collector = _Collector()

    class Boom(RuntimeError):
        pass

    with pytest.raises(Boom):
        with observe_external_call(provider="anthropic", emitter=_emitter(collector)):
            raise Boom("model exploded")

    event = collector.events[0]
    assert event["status"] == "error"
    assert event["errorKind"] == "Boom"
    assert event["errorMessage"] == "model exploded"


def test_a_provider_fault_is_reported_under_its_classified_kind():
    collector = _Collector()

    class ResourceExhausted(Exception):
        pass

    with pytest.raises(ResourceExhausted):
        with observe_external_call(provider="google-vertex", emitter=_emitter(collector)):
            raise ResourceExhausted("429 quota exceeded")

    # Not the class name: the shared classifier's vocabulary, so the dashboard
    # groups exhaustion the same way the pipeline's own gates do.
    assert collector.events[0]["errorKind"] == "quota_exhausted"


def test_a_vertex_call_is_priced_from_the_rate_table():
    collector = _Collector()
    with observe_external_call(
        provider="google-vertex",
        model="gemini-3.1-pro-preview",
        emitter=_emitter(collector),
    ) as observed:
        observed.record_usage({"prompt_token_count": 400, "candidates_token_count": 80})

    event = collector.events[0]
    # 400 input at $2/M plus 80 output at $12/M. Rates verified against
    # Google's published pricing on 2026-09-04.
    assert event["costUsd"] == pytest.approx(0.00176)
    assert event["costBasis"] == "rate-table"


def test_the_subscription_cli_reports_tokens_but_never_a_price():
    """The CLI's own cost figure is ignored on purpose.

    It is what these tokens would have cost on the Anthropic API, not money
    owed -- the real spend is a flat subscription. Reporting it would put a
    confident wrong number in the same total as real Vertex spend.
    """
    collector = _Collector()
    with observe_external_call(
        provider="claude-cli", model="claude-opus-5", emitter=_emitter(collector)
    ) as observed:
        observed.record_usage(
            {"input_tokens": 10, "output_tokens": 2, "measured_cost_usd": 0.0431}
        )

    event = collector.events[0]
    assert "costUsd" not in event
    assert "costBasis" not in event
    assert event["tokens"] == {"input": 10, "output": 2, "total": 12}
    assert event["metadata"]["unpricedReason"] == "subscription-flat-rate"


def test_a_model_with_no_rate_is_unpriced_and_says_why():
    collector = _Collector()
    with observe_external_call(
        provider="google-vertex",
        model="gemini-9.9-imaginary",
        emitter=_emitter(collector),
    ) as observed:
        observed.record_usage({"prompt_token_count": 900, "candidates_token_count": 100})

    event = collector.events[0]
    # An obvious hole beats a plausible zero: a missing rate must never read
    # as a free call.
    assert "costUsd" not in event
    assert event["metadata"]["unpricedReason"] == "no-rate-for-model"
    assert event["tokens"]["total"] == 1000


def test_metadata_and_correlation_ride_along():
    collector = _Collector()
    with observe_external_call(
        provider="google-vertex",
        correlation_id="run-849ae5aa",
        emitter=_emitter(collector),
        stage="compose",
    ) as observed:
        observed.add_metadata(attempt=2, ignored=None)

    event = collector.events[0]
    assert event["correlationId"] == "run-849ae5aa"
    assert event["metadata"] == {"stage": "compose", "attempt": 2}


def test_does_nothing_at_all_without_a_configured_url(monkeypatch):
    monkeypatch.delenv("USAGE_MONITOR_URL", raising=False)
    collector = _Collector()
    disabled = UsageEmitter(
        UsageMonitorConfig(url=None, key=None, service="abw-backend", timeout_seconds=1.0),
        transport=collector,
    )

    with observe_external_call(provider="google-vertex", emitter=disabled):
        pass

    assert disabled.enabled is False
    assert collector.events == []


def test_a_transport_that_raises_does_not_reach_the_caller():
    collector = _Collector(fail=True)
    emitter = _emitter(collector)

    with observe_external_call(provider="google-vertex", emitter=emitter):
        pass

    assert emitter.failed_batches == 1


class _NoWorkerEmitter(UsageEmitter):
    """Never starts the sender, so a full queue can be observed as full."""

    def _ensure_worker(self) -> None:
        return


def test_a_full_queue_drops_events_instead_of_blocking():
    collector = _Collector()
    config = UsageMonitorConfig(
        url="http://collector.test/events", key=None, service="abw", timeout_seconds=1.0
    )
    emitter = _NoWorkerEmitter(config, transport=collector, queue_capacity=1)

    emitter.emit({"ts": 1})
    emitter.emit({"ts": 2})
    emitter.emit({"ts": 3})

    # The first event is queued; the rest have nowhere to go and are counted
    # rather than waited on. A blocking put here would stall a model call.
    assert emitter.dropped == 2
    assert collector.events == []


def test_the_emitter_is_read_from_the_environment_once(monkeypatch):
    monkeypatch.setenv("USAGE_MONITOR_URL", "http://collector.test/events")
    monkeypatch.setenv("USAGE_MONITOR_SERVICE", "abw-test")
    api_usage.set_emitter(None)

    first = api_usage.get_emitter()
    monkeypatch.setenv("USAGE_MONITOR_SERVICE", "changed-after-boot")

    assert api_usage.get_emitter() is first
    assert first.config.service == "abw-test"


# Named exactly as the classes `get_vertex_llm` returns, because the lookup is
# by class name: a double called `_FakeVertex` would silently exercise the
# fallback instead of the mapping this test is about.
class VertexAI:
    model_name = "gemini-3.1-pro-preview"


class Gemini3ChatTextLLM:
    model_name = "gemini-3.1-pro-preview"


class ClaudeCliTextLLM:
    model_name = "claude-opus-5"


class ClaudeTextLLM:
    model_name = "claude-sonnet-5"


class _Unknown:
    model_name = "mystery-1"


@pytest.mark.parametrize(
    ("llm", "expected"),
    [
        (VertexAI(), "google-vertex"),
        (Gemini3ChatTextLLM(), "google-vertex"),
        (ClaudeCliTextLLM(), "claude-cli"),
        (ClaudeTextLLM(), "anthropic"),
    ],
)
def test_provider_is_read_from_the_llm_object(llm, expected):
    assert provider_for_llm(llm) == expected


def test_the_two_claude_paths_are_told_apart():
    """The subscription CLI and the API are one model name and two providers.

    Only the object knows which one ran, which is why the class is asked before
    the model name is.
    """
    assert provider_for_llm(ClaudeCliTextLLM()) == "claude-cli"
    assert provider_for_llm(ClaudeTextLLM()) == "anthropic"


def test_provider_falls_back_to_the_model_name():
    assert provider_for_llm(_Unknown(), "gemini-3.7-flash") == "google-vertex"
    assert provider_for_llm(_Unknown(), "claude-opus-5") == "anthropic"
    assert provider_for_llm(_Unknown()) == "unknown"


def test_token_normalisation_covers_every_provider_spelling():
    assert normalize_tokens(
        {
            "prompt_token_count": 10,
            "candidates_token_count": 4,
            "thoughts_token_count": 2,
            "cached_content_token_count": 6,
            "total_token_count": 22,
        }
    ) == {"input": 10, "output": 6, "reasoning": 2, "cachedInput": 6, "total": 22}


def test_thinking_tokens_are_counted_as_output():
    """Google bills reasoning at the output rate, and LangChain files it apart.

    Reading `output_tokens` alone -- which an earlier version of this module
    did -- charged the run for the visible answer and nothing for the thinking
    that produced it.
    """
    tokens = normalize_tokens(
        {"input_tokens": 100, "output_tokens": 20, "output_token_details": {"reasoning": 5}}
    )
    assert tokens["output"] == 25
    assert tokens["reasoning"] == 5


def test_anthropic_cache_reads_are_added_to_input():
    """Anthropic's `input_tokens` is only the uncached remainder.

    The cache figures sit beside it, so taking `input_tokens` at face value --
    which an earlier version of this module did -- undercounted every cached
    call.
    """
    tokens = normalize_tokens(
        {"input_tokens": 1, "output_tokens": 2, "cache_read_input_tokens": 3}
    )
    assert tokens == {"input": 4, "output": 2, "cachedInput": 3, "total": 6}


def test_token_normalisation_ignores_junk():
    assert normalize_tokens(None) == {}
    assert normalize_tokens("nope") == {}
    assert normalize_tokens({"input_tokens": "many", "output_tokens": -5}) == {}


def test_the_monitor_and_the_run_ledger_count_identically():
    """One normaliser, so the receipt and the dashboard cannot disagree.

    They were two implementations for a while, and the second one was wrong.
    """
    raw = {
        "input_tokens": 5,
        "output_tokens": 7,
        "output_token_details": {"reasoning": 3},
        "cache_read_input_tokens": 11,
    }
    ledger = normalize_token_usage(raw)
    monitor = normalize_tokens(raw)
    assert monitor["input"] == ledger["input_tokens"]
    assert monitor["output"] == ledger["output_tokens"]
    assert monitor["reasoning"] == ledger["reasoning_tokens"]
    assert monitor["cachedInput"] == ledger["cached_input_tokens"]
    assert monitor["total"] == ledger["total_tokens"]


def test_an_observation_without_tokens_reports_no_token_field():
    collector = _Collector()
    with observe_external_call(
        provider="serpapi", endpoint="/search", emitter=_emitter(collector)
    ):
        pass

    event = collector.events[0]
    assert "tokens" not in event
    assert event["endpoint"] == "/search"


def test_event_ids_are_unique_so_a_retry_is_not_a_duplicate():
    collector = _Collector()
    emitter = _emitter(collector)
    for _ in range(3):
        with observe_external_call(provider="google-vertex", emitter=emitter):
            pass

    ids = {event["eventId"] for event in collector.events}
    assert len(ids) == 3


def test_observation_defaults_are_not_shared_between_calls():
    first = CallObservation(provider="a")
    first.add_metadata(stage="one")
    second = CallObservation(provider="b")
    assert second.metadata == {}
