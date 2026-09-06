"""Prompt2Blog's model calls report themselves to the usage monitor.

The point of these tests is the seam, not the emitter: the run's token ledger
and the dashboard's monitor must both see every call, and neither may be able
to break the other or the call itself.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog import llm as p2b_llm
from app.shared import api_usage
from app.shared.api_usage import UsageEmitter, UsageMonitorConfig


class _Collector:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    def __call__(self, batch: list[dict[str, Any]]) -> None:
        self.events.extend(batch)


def _install_monitor(collector: _Collector) -> UsageEmitter:
    emitter = UsageEmitter(
        UsageMonitorConfig(
            url="http://collector.test/events",
            key=None,
            service="abw-backend",
            timeout_seconds=1.0,
        ),
        transport=collector,
        synchronous=True,
    )
    api_usage.set_emitter(emitter)
    return emitter


class ClaudeCliTextLLM:
    """Shaped like the real subscription-CLI LLM, including its cost report."""

    model_name = "claude-opus-5"
    last_usage_metadata = {"input_tokens": 900, "output_tokens": 120}
    last_cost_usd = 0.0512

    def invoke(self, prompt: str) -> str:
        return "an article"


class VertexAI:
    model_name = "gemini-3.1-pro-preview"
    last_usage_metadata = {"prompt_token_count": 400, "candidates_token_count": 80}
    last_cost_usd = None

    def invoke(self, prompt: str) -> str:
        return "some prose"


class _ExplodingVertexAI(VertexAI):
    def invoke(self, prompt: str) -> str:
        raise RuntimeError("429 quota exceeded for this project")


@pytest.fixture(autouse=True)
def _reset_monitor():
    api_usage.set_emitter(None)
    yield
    api_usage.set_emitter(None)


def test_a_text_call_is_reported_and_still_reaches_the_run_ledger(monkeypatch):
    collector = _Collector()
    _install_monitor(collector)
    monkeypatch.setattr(p2b_llm, "get_vertex_llm", lambda **_: ClaudeCliTextLLM())

    recorded: list[tuple[str, Any]] = []
    result = p2b_llm._invoke_text_llm(
        prompt="write",
        max_tokens=100,
        temperature=0.2,
        model_name="claude-opus-5",
        usage_recorder=lambda model, usage, **_: recorded.append((model, usage)),
    )

    assert result == "an article"
    # The run ledger still gets exactly what it got before this existed --
    # including the CLI's own cost figure, which the ledger does use.
    assert recorded[0][0] == "claude-opus-5"
    assert recorded[0][1]["input_tokens"] == 900
    assert recorded[0][1]["measured_cost_usd"] == pytest.approx(0.0512)

    event = collector.events[0]
    assert event["provider"] == "claude-cli"
    assert event["model"] == "claude-opus-5"
    assert event["feature"] == "prompt2blog"
    assert event["endpoint"] == "invoke_text"
    assert event["status"] == "ok"
    assert event["tokens"] == {"input": 900, "output": 120, "total": 1020}
    # The dashboard deliberately does not: a subscription call's per-call
    # price is not money owed, so the tokens are reported and the money is
    # not. This is where the ledger and the monitor part company on purpose.
    assert "costUsd" not in event
    assert event["metadata"]["unpricedReason"] == "subscription-flat-rate"


def test_a_vertex_call_is_priced_from_the_rate_table(monkeypatch):
    """Vertex is the real bill, so this is the number that has to be right."""
    collector = _Collector()
    _install_monitor(collector)
    monkeypatch.setattr(p2b_llm, "get_vertex_llm", lambda **_: VertexAI())

    p2b_llm._invoke_text_llm(
        prompt="write", max_tokens=100, temperature=0.2, model_name=None,
            job_id="p2b.compose"
    )

    event = collector.events[0]
    assert event["provider"] == "google-vertex"
    assert event["model"] == "gemini-3.1-pro-preview"
    assert event["tokens"] == {"input": 400, "output": 80, "total": 480}
    assert event["costUsd"] == pytest.approx(0.00176)
    assert event["costBasis"] == "rate-table"


def test_a_failed_call_is_reported_as_an_error_and_still_raises(monkeypatch):
    collector = _Collector()
    _install_monitor(collector)
    monkeypatch.setattr(p2b_llm, "get_vertex_llm", lambda **_: _ExplodingVertexAI())

    with pytest.raises(RuntimeError):
        p2b_llm._invoke_text_llm(
            prompt="write", max_tokens=100, temperature=0.2, model_name=None,
            job_id="p2b.compose"
        )

    event = collector.events[0]
    assert event["status"] == "error"
    assert event["errorKind"] == "quota_exhausted"
    assert event["durationMs"] >= 0


def test_an_unreachable_collector_does_not_change_the_call(monkeypatch):
    def refuse(batch: list[dict[str, Any]]) -> None:
        raise OSError("connection refused")

    emitter = _install_monitor(_Collector())
    api_usage.set_emitter(
        UsageEmitter(emitter.config, transport=refuse, synchronous=True)
    )
    monkeypatch.setattr(p2b_llm, "get_vertex_llm", lambda **_: VertexAI())

    assert (
        p2b_llm._invoke_text_llm(
            prompt="write", max_tokens=100, temperature=0.2, model_name=None,
            job_id="p2b.compose"
        )
        == "some prose"
    )


def test_with_no_monitor_configured_nothing_is_reported(monkeypatch):
    monkeypatch.delenv("USAGE_MONITOR_URL", raising=False)
    api_usage.set_emitter(None)
    monkeypatch.setattr(p2b_llm, "get_vertex_llm", lambda **_: VertexAI())

    recorded: list[tuple[str, Any]] = []
    result = p2b_llm._invoke_text_llm(
        prompt="write",
        max_tokens=100,
        temperature=0.2,
        model_name=None,
        job_id="p2b.compose",
        usage_recorder=lambda model, usage, **_: recorded.append((model, usage)),
    )

    assert result == "some prose"
    assert recorded  # the run ledger is unaffected by the monitor being off
    assert api_usage.get_emitter().enabled is False


class _SchemaVertexAI(VertexAI):
    # Same signature the real adapters carry. A double that accepts less than
    # the real thing hides a caller passing more -- which is how a dropped
    # output ceiling truncated structuring for a day.
    def invoke_json(
        self,
        prompt: str,
        *,
        input_schema: dict[str, Any],
        max_tokens: int | None = None,
        thinking_budget: int | None = None,
    ) -> dict[str, Any]:
        return {"title": "ok"}


def test_a_schema_validated_call_is_reported_too(monkeypatch):
    collector = _Collector()
    _install_monitor(collector)
    monkeypatch.setattr(p2b_llm, "get_vertex_llm", lambda **_: _SchemaVertexAI())

    parsed, raw = p2b_llm._invoke_json_llm(
        prompt="write",
        max_tokens=100,
        temperature=0.2,
        model_name=None,
        job_id="p2b.compose",
        schema={"type": "object"},
    )

    assert parsed == {"title": "ok"}
    assert raw
    assert collector.events[0]["endpoint"] == "invoke_json"


def test_each_json_retry_is_reported_as_its_own_call(monkeypatch):
    """Three parse failures are three paid calls, and the monitor shows three.

    The run ledger already counts them; the dashboard has to agree, or a run
    that burned three writer calls looks like one slow one.
    """
    collector = _Collector()
    _install_monitor(collector)

    class _UnparseableVertexAI(VertexAI):
        def invoke(self, prompt: str) -> str:
            return "not json at all"

    monkeypatch.setattr(p2b_llm, "get_vertex_llm", lambda **_: _UnparseableVertexAI())

    with pytest.raises(RuntimeError):
        p2b_llm._invoke_json_llm(
            prompt="write", max_tokens=100, temperature=0.2, model_name=None,
            job_id="p2b.compose"
        )

    assert len(collector.events) == 3
    assert {event["status"] for event in collector.events} == {"ok"}
