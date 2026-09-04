"""What each provider says it used, and what Google charges for it.

These are **provider facts**, not Prompt2Blog policy, which is why they live
here rather than in `features/prompt2blog/pricing.py` where they started. Two
readers now need them and they must not disagree:

* the per-run usage ledger, which turns them into a run's receipt;
* the API-usage monitor (`app/shared/api_usage.py`), which reports every call
  to the dashboard.

A second copy of `normalize_token_usage` was written for the monitor and got
two things wrong that this one gets right -- it read `output_tokens` without
folding in the thinking tokens LangChain files separately, and it read
Anthropic's `input_tokens` without adding the cache figures that sit beside
it. Both errors undercount, silently, in the direction of "cheaper than it
was". One implementation is the fix.

Rate-table figures verified against Google's published Gemini API pricing on
2026-09-04 for the models Prompt2Blog actually runs (3.7 Flash, 3.1 Pro
Preview, 2.5 Flash, 2.5 Pro). Two caveats worth keeping in view:

* Gemini 2.5 Flash is on introductory pricing **through 2026-12-31**, after
  which input and output both double. This table will silently understate
  every Flash call from 2027-01-01 until someone edits it.
* These are Gemini API list rates. Calls here go through Vertex AI, which
  bills under its own SKUs; the two have matched for these models but are not
  guaranteed to.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class VertexTokenRate:
    input_per_million: float
    output_per_million: float
    cached_input_per_million: float
    large_input_per_million: float | None = None
    large_output_per_million: float | None = None
    large_cached_input_per_million: float | None = None


# Standard global PayGo rates in USD, checked 2026-08-24. Gemini 2.5 Flash
# uses introductory pricing through 2026-12-31.
VERTEX_TOKEN_RATES = {
    "gemini-3.1-pro-preview": VertexTokenRate(2.0, 12.0, 0.2, 4.0, 18.0, 0.4),
    "gemini-3.7-flash": VertexTokenRate(0.75, 3.75, 0.075),
    "gemini-3.5-flash": VertexTokenRate(1.5, 9.0, 0.15),
    "gemini-3.5-flash-lite": VertexTokenRate(0.3, 2.5, 0.03),
    "gemini-3.1-flash-lite": VertexTokenRate(0.25, 1.5, 0.025),
    # The model the Search-grounding REST path actually runs on. Without a rate
    # here every grounded call prices as unknown, and v4 puts two of them on
    # every run -- the grill's pre-research and the gather pass.
    "gemini-2.5-flash": VertexTokenRate(0.3, 2.5, 0.03),
    # The substitute `resolve_effective_model` picks for `claude-sonnet-5`
    # while both Claude paths are off, so it can serve a real call today and
    # was pricing as unknown until this line existed.
    "gemini-2.5-pro": VertexTokenRate(1.25, 10.0, 0.125, 2.5, 15.0, 0.25),
    # Priced because it is now a real default rather than an occasional
    # fallback: `llm_model_policy.DEFAULT_MODEL` and the normaliser both run on
    # it, and every one of those calls was reaching the dashboard unpriced.
    "gemini-2.5-flash-lite": VertexTokenRate(0.1, 0.4, 0.01),
}


def token_count(value: Any) -> int:
    try:
        if isinstance(value, bool):
            return 0
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def usage_value(usage: dict[str, Any], *keys: str) -> int:
    for key in keys:
        if key in usage:
            return token_count(usage[key])
    return 0


def normalize_token_usage(value: Any) -> dict[str, int] | None:
    if not isinstance(value, dict):
        return None
    input_tokens = usage_value(
        value,
        "input_tokens",
        "prompt_token_count",
        "prompt_tokens",
    )
    # Google bills reasoning tokens at the output rate, but LangChain does not
    # put them in `output_tokens`. `_get_usage_metadata_gemini` sets
    # `output_tokens = candidates_token_count` and files the thinking tokens
    # under `output_token_details["reasoning"]`, so reading `output_tokens`
    # alone charged the run for the visible answer and nothing for the
    # reasoning that produced it.
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
        cached_input_tokens = usage_value(
            input_details,
            "cache_read",
            "cached_tokens",
        )
    cached_input_tokens = max(
        cached_input_tokens,
        usage_value(value, "cached_input_tokens", "cached_content_token_count"),
    )
    # Anthropic reports the two cache figures flat and alongside, and its
    # `input_tokens` counts only the uncached remainder. Google reports
    # `input_tokens` gross with the cached share nested under
    # `input_token_details`. Reading only the nested shape left every Claude
    # call looking as though it had cached nothing -- the totals were right, the
    # savings were invisible -- and the clamp at the end of this function then
    # discarded the figure anyway, because a net input count is smaller than
    # the cache read it excludes.
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
        # that shows a title call spending thousands of tokens is the signal
        # that stage-level thinking control is worth having.
        "reasoning_tokens": reasoning_tokens,
        "cached_input_tokens": min(cached_input_tokens, input_tokens),
        "total_tokens": total_tokens,
    }



def estimated_vertex_cost(
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int,
) -> float | None:
    rate = VERTEX_TOKEN_RATES.get(model_name)
    if rate is None:
        return None
    use_large_context_rate = input_tokens > 200_000
    input_rate = (
        rate.large_input_per_million
        if use_large_context_rate and rate.large_input_per_million is not None
        else rate.input_per_million
    )
    output_rate = (
        rate.large_output_per_million
        if use_large_context_rate and rate.large_output_per_million is not None
        else rate.output_per_million
    )
    cached_input_rate = (
        rate.large_cached_input_per_million
        if use_large_context_rate and rate.large_cached_input_per_million is not None
        else rate.cached_input_per_million
    )
    uncached_input_tokens = max(0, input_tokens - cached_input_tokens)
    return (
        uncached_input_tokens * input_rate
        + cached_input_tokens * cached_input_rate
        + output_tokens * output_rate
    ) / 1_000_000
