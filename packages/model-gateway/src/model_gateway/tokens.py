"""What a provider says it used, read the same way every time.

Every provider reports its token counts in a slightly different shape, and two
of those differences cost money when read naively:

* LangChain sets ``output_tokens`` to ``candidates_token_count`` and files the
  thinking tokens separately under ``output_token_details["reasoning"]``.
  Google bills reasoning at the output rate, so reading ``output_tokens``
  alone charges for the visible answer and nothing for the reasoning that
  produced it.
* Anthropic reports its two cache figures flat and alongside, and its
  ``input_tokens`` counts only the uncached remainder. Google reports
  ``input_tokens`` gross with the cached share nested. Reading only the nested
  shape leaves every Claude call looking as though it cached nothing.

Both mistakes undercount, silently, in the direction of "cheaper than it was".
That is exactly the kind of error nobody notices, which is why there is one
implementation of this and not one per call site: a second copy was written
once and made both mistakes.
"""

from __future__ import annotations

from typing import Any


def token_count(value: Any) -> int:
    """A non-negative integer count, whatever the provider actually sent."""
    try:
        if isinstance(value, bool):
            return 0
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def usage_value(usage: dict[str, Any], *keys: str) -> int:
    """The first key a provider actually used, from a list of its spellings."""
    for key in keys:
        if key in usage:
            return token_count(usage[key])
    return 0


def normalize_token_usage(value: Any) -> dict[str, int] | None:
    """One shape for token counts, or None when there is nothing to count.

    None rather than a dict of zeros: "the provider reported no usage" and
    "the provider reported zero usage" are different facts, and only the first
    is a reason to go looking for a bug.
    """
    if not isinstance(value, dict):
        return None

    input_tokens = usage_value(
        value,
        "input_tokens",
        "prompt_token_count",
        "prompt_tokens",
    )

    reasoning_tokens = 0
    output_details = value.get("output_token_details")
    if isinstance(output_details, dict):
        reasoning_tokens = usage_value(output_details, "reasoning", "reasoning_tokens")

    output_tokens = usage_value(value, "output_tokens", "completion_tokens")
    if output_tokens:
        output_tokens += reasoning_tokens
    else:
        # Raw Vertex metadata rather than LangChain's: `candidates_token_count`
        # excludes thinking too, and `thoughts_token_count` carries it.
        reasoning_tokens = max(
            reasoning_tokens,
            usage_value(value, "thoughts_token_count"),
        )
        output_tokens = usage_value(value, "candidates_token_count") + reasoning_tokens

    total_tokens = usage_value(value, "total_tokens", "total_token_count")

    input_details = value.get("input_token_details")
    cached_input_tokens = 0
    if isinstance(input_details, dict):
        cached_input_tokens = usage_value(input_details, "cache_read", "cached_tokens")
    cached_input_tokens = max(
        cached_input_tokens,
        usage_value(value, "cached_input_tokens", "cached_content_token_count"),
    )

    # Anthropic's flat cache figures. Folding them into the input count first
    # matters: the clamp at the end of this function would otherwise discard
    # the cache read, because a net input count is smaller than the cache read
    # it excludes.
    cache_read = usage_value(value, "cache_read_input_tokens")
    cache_creation = usage_value(value, "cache_creation_input_tokens")
    if cache_read or cache_creation:
        input_tokens += cache_read + cache_creation
        cached_input_tokens = max(cached_input_tokens, cache_read)

    if not total_tokens:
        total_tokens = input_tokens + output_tokens
    if not input_tokens and not output_tokens and not total_tokens:
        return None

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        # Reported separately as well as folded into output_tokens: a receipt
        # showing a title call spending thousands of tokens is the signal that
        # stage-level thinking control is worth having.
        "reasoning_tokens": reasoning_tokens,
        "cached_input_tokens": min(cached_input_tokens, input_tokens),
        "total_tokens": total_tokens,
    }
