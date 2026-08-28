"""Reading "why did this call fail" off an exception, whoever raised it.

Only the Claude CLI transport labels its own failures. Vertex and the Anthropic
API do not, so exhaustion on those providers is recognised by shape -- and the
shape matching has to stay narrow, because everything it matches stops a run.
"""

from __future__ import annotations

import pytest

from app.shared.provider_faults import (
    FAULT_QUOTA_EXHAUSTED,
    is_fatal_provider_fault,
    provider_fault_kind,
)
from utils.claude_cli_llm import ClaudeCliUnavailable


class ResourceExhausted(RuntimeError):
    """Stands in for google.api_core's, matched by name rather than import."""


class RateLimitError(RuntimeError):
    """Stands in for the Anthropic SDK's."""


def test_a_labelled_fault_is_read_from_its_label():
    error = ClaudeCliUnavailable("limit reached", kind="quota_exhausted")
    assert provider_fault_kind(error) == FAULT_QUOTA_EXHAUSTED
    assert is_fatal_provider_fault(error) is True


def test_a_transient_label_is_not_fatal():
    error = ClaudeCliUnavailable("upstream reset", kind="provider_unavailable")
    assert provider_fault_kind(error) == "provider_unavailable"
    assert is_fatal_provider_fault(error) is False


def test_an_unusable_answer_is_not_fatal():
    error = ClaudeCliUnavailable("could not read the reply", kind="invalid_response")
    assert is_fatal_provider_fault(error) is False


@pytest.mark.parametrize(
    "error",
    [
        ResourceExhausted("429 Quota exceeded for generate_content"),
        RateLimitError("rate limit exceeded, retry later"),
        RuntimeError("Your credit balance is too low to access the API"),
    ],
    ids=["vertex", "anthropic", "credit-balance"],
)
def test_unlabelled_provider_exhaustion_is_recognised_by_shape(error):
    assert provider_fault_kind(error) == FAULT_QUOTA_EXHAUSTED


def test_a_wrapped_fault_is_still_found():
    """Stages wrap provider errors in their own, so only reading the top misses."""
    inner = ClaudeCliUnavailable("limit reached", kind="quota_exhausted")
    try:
        raise inner
    except ClaudeCliUnavailable as caught:
        outer = RuntimeError("groundedness stage failed")
        outer.__cause__ = caught

    assert provider_fault_kind(outer) == FAULT_QUOTA_EXHAUSTED


@pytest.mark.parametrize(
    "error",
    [
        RuntimeError("Failed to parse JSON LLM response"),
        ValueError("Structured writer call returned no schema payload"),
        KeyError("improved_content"),
        RuntimeError("the quota system is the subject of this article"),
    ],
    ids=["parse", "schema", "bug", "prose-about-quota"],
)
def test_an_ordinary_failure_is_not_a_provider_fault(error):
    """None means "not a provider fault", and the caller degrades as before.

    The last case is the one worth keeping honest: the word "quota" on its own
    is not evidence. Matching it would stop runs over an article's subject
    matter.
    """
    assert provider_fault_kind(error) is None
    assert is_fatal_provider_fault(error) is False


def test_a_non_exception_is_not_a_fault():
    assert provider_fault_kind("quota_exhausted") is None
    assert provider_fault_kind(None) is None
