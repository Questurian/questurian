"""One reader for "why did this model call fail", across providers.

A pipeline stage catches a bare ``Exception`` because any of a dozen things can
go wrong inside one model call. That is the right shape -- until two of those
things need opposite handling. An unusable answer is worth degrading past; an
exhausted account is not, because every later call in the run will fail the
same way and the degraded result is a lie about what happened.

Telling them apart needs one place that knows what each provider's exhaustion
looks like, because the pipeline calls three:

* the Claude Code CLI, which now labels its own failures (``ClaudeCliWriterError``
  and ``ClaudeCliUnavailable`` both carry ``.kind``);
* Vertex / Gemini, which raises ``ResourceExhausted`` or a 429;
* the Anthropic API, which raises a rate-limit error.

Only the first is labelled at the source. The other two are recognised here by
shape rather than by importing their exception classes: importing
``google.api_core`` here would add a provider SDK dependency to a module every
pipeline imports, and the class name plus the status code are stable enough to
match on.

Why ``app.shared`` and not ``packages/utils``
---------------------------------------------
Every consumer -- prompt2blog, url2blog, youtube2blog -- is a feature of this
same backend app, so nothing is gained by pushing this down a layer. There is
also a concrete hazard down there: several tests replace ``utils`` in
``sys.modules`` with a stub to keep route imports light, and that stub is
process-global. A name added to ``utils`` and imported at module scope by a
pipeline stage breaks every test that happens to import after one of those
stubs is installed.
"""

from __future__ import annotations

from typing import Any, Optional

FAULT_QUOTA_EXHAUSTED = "quota_exhausted"
FAULT_NOT_CONNECTED = "not_connected"
FAULT_PROVIDER_UNAVAILABLE = "provider_unavailable"
FAULT_INVALID_RESPONSE = "invalid_response"

# Kinds that mean "no later call in this run can succeed". A caller that sees
# one of these must stop rather than degrade.
FATAL_FAULT_KINDS = frozenset({FAULT_QUOTA_EXHAUSTED, FAULT_NOT_CONNECTED})

KNOWN_FAULT_KINDS = FATAL_FAULT_KINDS | {
    FAULT_PROVIDER_UNAVAILABLE,
    FAULT_INVALID_RESPONSE,
}

# Exception class names that mean exhaustion on a provider that does not label
# its errors. Matched by name so no provider SDK has to be importable here.
_QUOTA_EXCEPTION_NAMES = frozenset(
    {
        "ResourceExhausted",
        "RateLimitError",
        "TooManyRequests",
    }
)

# Substrings in an unlabelled provider error that mean exhaustion. Deliberately
# narrower than the CLI transport's marker list: this text is a whole exception
# message rather than a refusal the transport already decided was a failure, so
# a loose marker here would misread an ordinary error.
_QUOTA_MESSAGE_MARKERS = (
    "resource_exhausted",
    "resource exhausted",
    "quota exceeded",
    "exceeded your current quota",
    "rate limit exceeded",
    "insufficient_quota",
    "credit balance is too low",
)

# How far up the ``__cause__`` chain to look. A stage wraps a provider error in
# its own RuntimeError often enough that only reading the outermost exception
# would miss the label; unbounded walking risks a cycle.
_CAUSE_DEPTH = 5


def _labelled_kind(error: BaseException) -> Optional[str]:
    kind = getattr(error, "kind", None)
    if isinstance(kind, str) and kind in KNOWN_FAULT_KINDS:
        return kind
    return None


def _unlabelled_quota(error: BaseException) -> bool:
    if type(error).__name__ in _QUOTA_EXCEPTION_NAMES:
        return True
    if getattr(error, "status_code", None) == 429 or getattr(error, "code", None) == 429:
        return True
    message = str(error).lower()
    return any(marker in message for marker in _QUOTA_MESSAGE_MARKERS)


def provider_fault_kind(error: Any) -> Optional[str]:
    """The fault kind an exception represents, or None if it is not one.

    None means "this is not a provider fault" -- a parse failure, a bug, an
    assertion. Callers treat that as the ordinary failure it always was.
    """
    if not isinstance(error, BaseException):
        return None

    current: Optional[BaseException] = error
    seen: set[int] = set()
    for _ in range(_CAUSE_DEPTH):
        if current is None or id(current) in seen:
            break
        seen.add(id(current))

        labelled = _labelled_kind(current)
        if labelled is not None:
            return labelled
        if _unlabelled_quota(current):
            return FAULT_QUOTA_EXHAUSTED

        current = current.__cause__ or current.__context__
    return None


def is_fatal_provider_fault(error: Any) -> bool:
    """Whether a caught exception means the run must stop rather than degrade."""
    return provider_fault_kind(error) in FATAL_FAULT_KINDS
