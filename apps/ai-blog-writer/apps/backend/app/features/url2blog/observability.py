"""URL2Blog trace collection and response projection."""

from __future__ import annotations

from typing import Any

from app.core import read_stage_result


def append_stage_trace(
    *,
    stage_trace: list[dict[str, Any]],
    include_debug: bool,
    stage: str,
    model_name: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    input_payload: Any | None = None,
    prompt: str | None = None,
    raw_response: str | None = None,
    parsed: Any | None = None,
    output: Any | None = None,
    grounded_urls: list[str] | None = None,
    error: str | None = None,
) -> list[dict[str, Any]]:
    if not include_debug:
        return stage_trace

    entry: dict[str, Any] = {"stage": stage}
    optional_values = {
        "model_name": model_name,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "input": input_payload,
        "prompt": prompt,
        "raw_response": raw_response,
        "parsed": parsed,
        "output": output,
        "grounded_urls": grounded_urls,
    }
    entry.update(
        {key: value for key, value in optional_values.items() if value is not None}
    )
    if error:
        entry["error"] = error
    stage_trace.append(entry)
    return stage_trace


def read_langgraph_trace(run_id: str) -> dict[str, str]:
    stage_payload = read_stage_result(run_id, "langgraph_trace")
    data = stage_payload.get("data") if isinstance(stage_payload, dict) else None
    if not isinstance(data, dict):
        return {}

    trace_payload: dict[str, str] = {}
    for key in ("langsmith_trace_url", "langsmith_trace_run_id"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            trace_payload[key] = value.strip()
    return trace_payload
