from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.core import read_stage_result


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _read_langgraph_trace(run_id: str) -> dict[str, str]:
    stage_payload = read_stage_result(run_id, "langgraph_trace")
    if not isinstance(stage_payload, dict):
        return {}
    data = stage_payload.get("data")
    if not isinstance(data, dict):
        return {}

    trace_payload: dict[str, str] = {}
    trace_url = data.get("langsmith_trace_url")
    if isinstance(trace_url, str) and trace_url.strip():
        trace_payload["langsmith_trace_url"] = trace_url.strip()
    trace_run_id = data.get("langsmith_trace_run_id")
    if isinstance(trace_run_id, str) and trace_run_id.strip():
        trace_payload["langsmith_trace_run_id"] = trace_run_id.strip()
    return trace_payload


def _append_stage_trace(
    trace: list[dict[str, Any]],
    include_debug: bool,
    *,
    stage: str,
    model_name: str | None = None,
    input_payload: Any | None = None,
    prompt: str | None = None,
    raw_response: str | None = None,
    parsed: Any | None = None,
    output: Any | None = None,
    skipped: bool | None = None,
    error: str | None = None,
) -> None:
    if not include_debug:
        return

    entry: dict[str, Any] = {"stage": stage}
    if model_name:
        entry["model_name"] = model_name
    if input_payload is not None:
        entry["input"] = input_payload
    if prompt is not None:
        entry["prompt"] = prompt
    if raw_response is not None:
        entry["raw_response"] = raw_response
    if parsed is not None:
        entry["parsed"] = parsed
    if output is not None:
        entry["output"] = output
    if skipped is not None:
        entry["skipped"] = skipped
    if error:
        entry["error"] = error

    trace.append(entry)
