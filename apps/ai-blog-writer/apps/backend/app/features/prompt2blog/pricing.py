from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class VertexTokenRate:
    input_per_million: float
    output_per_million: float
    cached_input_per_million: float
    large_input_per_million: float | None = None
    large_output_per_million: float | None = None
    large_cached_input_per_million: float | None = None


# Standard global PayGo rates in USD, checked 2026-08-24. Gemini 3.7 Flash
# uses introductory pricing through 2026-12-31.
VERTEX_TOKEN_RATES = {
    "gemini-3.1-pro-preview": VertexTokenRate(2.0, 12.0, 0.2, 4.0, 18.0, 0.4),
    "gemini-3.7-flash": VertexTokenRate(0.75, 3.75, 0.075),
    "gemini-3.5-flash": VertexTokenRate(1.5, 9.0, 0.15),
    "gemini-3.5-flash-lite": VertexTokenRate(0.3, 2.5, 0.03),
    "gemini-3.1-flash-lite": VertexTokenRate(0.25, 1.5, 0.025),
}


def _token_count(value: Any) -> int:
    try:
        if isinstance(value, bool):
            return 0
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _usage_value(usage: dict[str, Any], *keys: str) -> int:
    for key in keys:
        if key in usage:
            return _token_count(usage[key])
    return 0


def normalize_token_usage(value: Any) -> dict[str, int] | None:
    if not isinstance(value, dict):
        return None
    input_tokens = _usage_value(
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
        reasoning_tokens = _usage_value(output_details, "reasoning", "reasoning_tokens")

    output_tokens = _usage_value(value, "output_tokens", "completion_tokens")
    if output_tokens:
        output_tokens += reasoning_tokens
    else:
        # Raw Vertex metadata rather than LangChain's: `candidates_token_count`
        # excludes thinking too, and `thoughts_token_count` carries it.
        reasoning_tokens = max(
            reasoning_tokens,
            _usage_value(value, "thoughts_token_count"),
        )
        output_tokens = (
            _usage_value(value, "candidates_token_count") + reasoning_tokens
        )
    total_tokens = _usage_value(value, "total_tokens", "total_token_count")
    input_details = value.get("input_token_details")
    cached_input_tokens = 0
    if isinstance(input_details, dict):
        cached_input_tokens = _usage_value(
            input_details,
            "cache_read",
            "cached_tokens",
        )
    cached_input_tokens = max(
        cached_input_tokens,
        _usage_value(value, "cached_input_tokens", "cached_content_token_count"),
    )
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


def _estimated_cost(
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


@dataclass
class Prompt2BlogTokenUsageTracker:
    successful_calls: int = 0
    measured_calls: int = 0
    by_model: dict[str, dict[str, Any]] = field(default_factory=dict)

    def record(self, model_name: str, raw_usage: Any) -> None:
        self.successful_calls += 1
        usage = normalize_token_usage(raw_usage)
        if usage is None:
            return
        self.measured_calls += 1
        totals = self.by_model.setdefault(
            model_name,
            {
                "input_tokens": 0,
                "output_tokens": 0,
                "reasoning_tokens": 0,
                "cached_input_tokens": 0,
                "total_tokens": 0,
                "calls": 0,
                "estimated_cost_usd": 0.0,
                "unpriced_calls": 0,
            },
        )
        totals["calls"] += 1
        for key in (
            "input_tokens",
            "output_tokens",
            "reasoning_tokens",
            "cached_input_tokens",
            "total_tokens",
        ):
            totals[key] += usage[key]
        call_cost = _estimated_cost(
            model_name=model_name,
            input_tokens=usage["input_tokens"],
            output_tokens=usage["output_tokens"],
            cached_input_tokens=usage["cached_input_tokens"],
        )
        if call_cost is None:
            totals["unpriced_calls"] += 1
        else:
            totals["estimated_cost_usd"] += call_cost

    def summary(
        self,
        *,
        stack_id: str | None,
        worker_model: str,
        writing_model: str,
        audit_model: str,
    ) -> dict[str, Any]:
        input_tokens = sum(item["input_tokens"] for item in self.by_model.values())
        output_tokens = sum(item["output_tokens"] for item in self.by_model.values())
        reasoning_tokens = sum(
            item["reasoning_tokens"] for item in self.by_model.values()
        )
        cached_input_tokens = sum(
            item["cached_input_tokens"] for item in self.by_model.values()
        )
        total_tokens = sum(item["total_tokens"] for item in self.by_model.values())
        model_rows: list[dict[str, Any]] = []
        estimated_cost_usd = 0.0
        fully_priced = True
        for model_name, usage in sorted(self.by_model.items()):
            model_cost = usage["estimated_cost_usd"]
            if usage["unpriced_calls"]:
                fully_priced = False
            else:
                estimated_cost_usd += model_cost
            model_rows.append(
                {
                    "model": model_name,
                    **{
                        key: usage[key]
                        for key in (
                            "input_tokens",
                            "output_tokens",
                            "reasoning_tokens",
                            "cached_input_tokens",
                            "total_tokens",
                            "calls",
                        )
                    },
                    "estimated_cost_usd": (
                        round(model_cost, 6) if not usage["unpriced_calls"] else None
                    ),
                }
            )
        if self.measured_calls == 0:
            measurement_status = "unavailable"
        elif self.measured_calls < self.successful_calls or not fully_priced:
            measurement_status = "partial"
        else:
            measurement_status = "complete"
        return {
            "stack_id": stack_id or "custom",
            "models": {
                "worker": worker_model,
                "writer": writing_model,
                "judge": audit_model,
            },
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "reasoning_tokens": reasoning_tokens,
            "cached_input_tokens": cached_input_tokens,
            "total_tokens": total_tokens,
            "successful_calls": self.successful_calls,
            "measured_calls": self.measured_calls,
            "measurement_status": measurement_status,
            "estimated_cost_usd": (
                round(estimated_cost_usd, 6)
                if self.measured_calls and fully_priced
                else None
            ),
            "currency": "USD",
            "by_model": model_rows,
            "pricing_note": (
                "Standard global Vertex rates checked 2026-08-24; Gemini 3.7 "
                "Flash introductory pricing ends 2026-12-31."
            ),
        }
