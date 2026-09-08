"""The refusal the marker list did not recognise.

Observed live on 2026-09-07. The account answered

    {"api_error_status": 429,
     "result": "You've hit your session limit · resets 9:50pm (America/New_York)"}

and every quota marker missed it: the list carried "usage limit" and "resets
at", the refusal said "session limit" and "resets 9:50pm". The attempt that had
already spent three minutes researching therefore fell past the cost-based
fallback too, was classified transient, and told the operator it was "usually
worth retrying". The retry failed in one second against the same limit.

So these pin the structural signal rather than the wording: a 429 is a 429
however the sentence under it is phrased.
"""

from __future__ import annotations

import pytest

from app.features.claude_connection.cli_writer import (
    FAULT_PROVIDER_UNAVAILABLE,
    FAULT_QUOTA_EXHAUSTED,
    ClaudeCliWriterError,
    _failure_kind,
    _raise_classified,
    _resets_at,
)

SESSION_LIMIT = "You've hit your session limit · resets 9:50pm (America/New_York)"


def _payload(**overrides):
    """The shape the CLI really returned, including the spend that fooled it."""
    payload = {
        "is_error": True,
        "subtype": "success",
        "terminal_reason": "api_error",
        "api_error_status": 429,
        "result": SESSION_LIMIT,
        "total_cost_usd": 1.42,
        "usage": {"output_tokens": 3100},
    }
    payload.update(overrides)
    return payload


def test_a_429_is_exhaustion_even_when_the_call_already_spent():
    """The exact misclassification, and the reason the retry advice was wrong.

    Three minutes of research had been paid for, so the "spent nothing"
    fallback could not save it, and `api_error` alone reads as transient.
    """
    assert _failure_kind(_payload()) == FAULT_QUOTA_EXHAUSTED


def test_a_429_is_exhaustion_whatever_the_sentence_says():
    """The point of reading the status rather than the prose.

    The marker list is Anthropic's wording to change, and it changed once
    already. The status code is not.
    """
    payload = _payload(result="Some wording nobody has written yet.")

    assert _failure_kind(payload) == FAULT_QUOTA_EXHAUSTED


def test_the_wording_alone_is_now_recognised_too():
    """Belt as well as braces: an account that reports no status still lands."""
    payload = _payload()
    payload.pop("api_error_status")
    assert _failure_kind(payload) == FAULT_QUOTA_EXHAUSTED


def test_a_genuine_transient_error_is_still_transient():
    """The fix must not turn every failed call into a stopped account.

    A run stopped for nothing costs the operator the whole article.
    """
    payload = _payload(api_error_status=503, result="Upstream connect error.")
    assert _failure_kind(payload) == FAULT_PROVIDER_UNAVAILABLE


def test_the_reset_time_travels_with_the_refusal():
    """Because "trying again now will fail" raises the question it dodges."""
    with pytest.raises(ClaudeCliWriterError) as caught:
        _raise_classified(_payload(), "Claude reported an error.")

    assert caught.value.kind == FAULT_QUOTA_EXHAUSTED
    assert caught.value.resets_at == "9:50pm (America/New_York)"


@pytest.mark.parametrize(
    "text, expected",
    [
        (SESSION_LIMIT, "9:50pm (America/New_York)"),
        ("Your limit resets at 3pm.", "3pm"),
        ("resets 11:05", "11:05"),
        ("You have hit your usage limit.", ""),
        ("", ""),
    ],
)
def test_only_a_clock_time_is_lifted_out_of_the_refusal(text, expected):
    """The rest of the refusal never leaves the transport: it reaches an API."""
    assert _resets_at({"result": text}) == expected


def test_a_refusal_with_no_reset_time_carries_none():
    with pytest.raises(ClaudeCliWriterError) as caught:
        _raise_classified(
            _payload(result="You have hit your usage limit."), "Claude errored."
        )

    assert caught.value.resets_at == ""
