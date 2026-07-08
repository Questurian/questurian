"""JSON parse-failure tracking plus canonical utils parser wrapper."""

import contextvars
from contextlib import contextmanager
from typing import Any

from .coerce import _safe_int, _safe_str


_json_parse_tracking_ctx: contextvars.ContextVar[dict[str, Any] | None] = (
    contextvars.ContextVar("url2blog_json_parse_tracking", default=None)
)


def _extract_json_from_response(
    raw_text: str,
    *,
    allow_truncated_repair: bool = True,
) -> tuple[dict[str, Any] | None, str | None]:
    """Parse JSON from LLM response through the canonical utils parser."""
    if not raw_text or not raw_text.strip():
        return None, "Empty response"

    from utils import parse_json_response

    try:
        parsed = parse_json_response(
            raw_text,
            allow_repair=allow_truncated_repair,
        )
    except RuntimeError as exc:
        return None, str(exc)
    if isinstance(parsed, dict):
        return parsed, None
    return None, "Expected a JSON object"


@contextmanager
def _json_parse_tracking_scope(parse_metrics: dict[str, Any] | None, stage_name: str):
    """Track JSON parse retries for a logical stage."""
    if parse_metrics is None:
        yield
        return

    token = _json_parse_tracking_ctx.set(
        {"metrics": parse_metrics, "stage": stage_name}
    )
    try:
        yield
    finally:
        _json_parse_tracking_ctx.reset(token)


def _record_json_parse_failure() -> None:
    """Increment parse-failure counters in active tracking scope."""
    tracking = _json_parse_tracking_ctx.get()
    if not tracking:
        return
    metrics = tracking.get("metrics")
    stage_name = _safe_str(tracking.get("stage")) or "unknown"
    if not isinstance(metrics, dict):
        return

    metrics["total_parse_failures"] = (
        _safe_int(
            metrics.get("total_parse_failures"),
            default=0,
            min_value=0,
            max_value=9999,
        )
        + 1
    )
    failures_by_stage = metrics.get("failures_by_stage")
    if not isinstance(failures_by_stage, dict):
        failures_by_stage = {}
        metrics["failures_by_stage"] = failures_by_stage
    failures_by_stage[stage_name] = (
        _safe_int(
            failures_by_stage.get(stage_name),
            default=0,
            min_value=0,
            max_value=9999,
        )
        + 1
    )


def _record_json_parse_recovery(failures_recovered: int) -> None:
    """Increment recovery counters when retries eventually succeed."""
    if failures_recovered <= 0:
        return
    tracking = _json_parse_tracking_ctx.get()
    if not tracking:
        return
    metrics = tracking.get("metrics")
    if not isinstance(metrics, dict):
        return

    metrics["recovered_calls"] = (
        _safe_int(
            metrics.get("recovered_calls"),
            default=0,
            min_value=0,
            max_value=9999,
        )
        + 1
    )
    metrics["recovered_parse_failures"] = (
        _safe_int(
            metrics.get("recovered_parse_failures"),
            default=0,
            min_value=0,
            max_value=9999,
        )
        + failures_recovered
    )


__all__ = [
    "_json_parse_tracking_ctx",
    "_extract_json_from_response",
    "_json_parse_tracking_scope",
    "_record_json_parse_failure",
    "_record_json_parse_recovery",
]
