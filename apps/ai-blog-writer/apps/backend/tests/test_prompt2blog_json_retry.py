from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog import llm as prompt2blog_llm
from utils.claude_cli_llm import ClaudeCliUnavailable

TASK_MARKER = "Rewrite the Kyoto transport section using only the sources below."


def _capture_invocations(monkeypatch, responses: list[str]) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    pending = list(responses)

    def _fake_invoke_text_llm(**kwargs: Any) -> str:
        calls.append(kwargs)
        return pending.pop(0)

    monkeypatch.setattr(prompt2blog_llm, "_invoke_text_llm", _fake_invoke_text_llm)
    return calls


def test_a_json_retry_keeps_the_original_task(monkeypatch):
    """The retry used to send only the truncated bad output, discarding the
    task, the sources and the schema -- so a compose retry was asked to
    re-emit an article it could no longer see."""
    calls = _capture_invocations(
        monkeypatch,
        ["```json\nnot actually json", '{"improved_title": "Kyoto"}'],
    )

    parsed, _raw = prompt2blog_llm._invoke_json_llm(
        prompt=TASK_MARKER,
        max_tokens=4096,
        temperature=0.2,
        model_name="test-model",
    )

    assert parsed == {"improved_title": "Kyoto"}
    assert len(calls) == 2
    retry_prompt = calls[1]["prompt"]
    assert TASK_MARKER in retry_prompt
    assert "Return ONLY one valid JSON object." in retry_prompt
    assert "RETRY NOTICE" in retry_prompt


def test_a_json_retry_reports_the_parse_error_and_bounds_the_excerpt(monkeypatch):
    junk = "x" * 10_000
    calls = _capture_invocations(monkeypatch, [junk, '{"ok": true}'])

    prompt2blog_llm._invoke_json_llm(
        prompt=TASK_MARKER,
        max_tokens=4096,
        temperature=0.2,
        model_name="test-model",
    )

    retry_prompt = calls[1]["prompt"]
    assert "could not be parsed" in retry_prompt
    excerpt = retry_prompt.split(
        "Start of the unparseable response, for reference only:\n"
    )[1]
    assert len(excerpt) == prompt2blog_llm.JSON_RETRY_EXCERPT_CHARS


def test_a_retry_drops_the_temperature(monkeypatch):
    calls = _capture_invocations(monkeypatch, ["nope", '{"ok": true}'])

    prompt2blog_llm._invoke_json_llm(
        prompt=TASK_MARKER,
        max_tokens=4096,
        temperature=0.7,
        model_name="test-model",
    )

    assert calls[0]["temperature"] == 0.7
    assert calls[1]["temperature"] == 0.0


def test_exhausted_retries_still_raise(monkeypatch):
    calls = _capture_invocations(monkeypatch, ["nope", "still nope", "nope again"])

    with pytest.raises(RuntimeError, match="Failed to parse JSON LLM response"):
        prompt2blog_llm._invoke_json_llm(
            prompt=TASK_MARKER,
            max_tokens=4096,
            temperature=0.2,
            model_name="test-model",
        )

    assert len(calls) == 3


def test_an_exhausted_account_is_not_retried(monkeypatch):
    """The retry loop is for output that could not be parsed, and nothing else.

    Three attempts against a dead account is three refusals and, on a compose
    or repair prompt, three full article rewrites' worth of prompt. The loop's
    shape already prevents it -- the invoke raises outside the inner `try` --
    and this is the test that keeps a later widening of that `except` from
    quietly re-introducing the wasted calls.
    """
    calls: list[dict[str, Any]] = []

    def _fake_invoke_text_llm(**kwargs: Any) -> str:
        calls.append(kwargs)
        raise ClaudeCliUnavailable("limit reached", kind="quota_exhausted")

    monkeypatch.setattr(prompt2blog_llm, "_invoke_text_llm", _fake_invoke_text_llm)

    with pytest.raises(ClaudeCliUnavailable):
        prompt2blog_llm._invoke_json_llm(
            prompt=TASK_MARKER,
            max_tokens=4096,
            temperature=0.2,
            model_name="test-model",
        )

    assert len(calls) == 1
