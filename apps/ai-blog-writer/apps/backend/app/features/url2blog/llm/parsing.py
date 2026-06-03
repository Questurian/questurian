"""JSON parsing/recovery for LLM responses + parse-failure tracking.

Extracted verbatim from url2blog/routes.py.
"""

import contextvars
import json
import re
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
    """Parse JSON from LLM response, handling markdown code blocks."""
    if not raw_text:
        return None, "Empty response"

    cleaned_text = raw_text.strip().lstrip("\ufeff")
    if not cleaned_text:
        return None, "Empty response"

    # Handle fenced JSON even when the closing fence is missing.
    if cleaned_text.startswith("```"):
        cleaned_text = re.sub(
            r"^```(?:json)?\s*",
            "",
            cleaned_text,
            flags=re.IGNORECASE,
        ).strip()
        cleaned_text = re.sub(r"\s*```$", "", cleaned_text).strip()

    # Try to extract from markdown code block first.
    match = re.search(
        r"```(?:json)?\s*(.*?)(?:\s*```|\s*$)",
        cleaned_text,
        re.DOTALL | re.IGNORECASE,
    )
    cleaned = match.group(1).strip() if match else cleaned_text

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed, None
        return None, "Expected a JSON object"
    except json.JSONDecodeError as exc:
        # Try to find JSON object by first/last brace.
        obj_start = cleaned.find("{")
        obj_end = cleaned.rfind("}")
        if obj_start != -1 and obj_end > obj_start:
            try:
                parsed = json.loads(cleaned[obj_start:obj_end + 1])
                if isinstance(parsed, dict):
                    return parsed, None
            except json.JSONDecodeError:
                pass

        # Try to extract first balanced JSON object.
        candidate = _extract_first_json_object(cleaned)
        if candidate:
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed, None
            except json.JSONDecodeError:
                pass

        if allow_truncated_repair:
            repaired = _try_fix_truncated_json_object(cleaned)
            if repaired:
                return repaired, None

        return None, str(exc)


def _extract_first_json_object(text: str) -> str | None:
    """Extract the first balanced JSON object substring from text."""
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for idx in range(start, len(text)):
        char = text[idx]

        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue

        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start:idx + 1]

    return None


def _try_fix_truncated_json_object(text: str) -> dict[str, Any] | None:
    """Attempt to recover malformed/truncated JSON by repairing common breakage."""
    candidate = text.strip()
    if not candidate:
        return None

    first_brace = candidate.find("{")
    if first_brace == -1:
        return None
    candidate = candidate[first_brace:]

    repaired_chars: list[str] = []
    in_string = False
    escape = False
    curly_depth = 0
    square_depth = 0

    for idx, char in enumerate(candidate):
        if in_string:
            if escape:
                repaired_chars.append(char)
                escape = False
                continue

            if char == "\\":
                repaired_chars.append(char)
                escape = True
                continue

            # Raw control characters inside a JSON string are invalid.
            if char == "\n":
                repaired_chars.append("\\n")
                continue
            if char == "\r":
                repaired_chars.append("\\r")
                continue
            if char == "\t":
                repaired_chars.append("\\t")
                continue

            if char == '"':
                lookahead = idx + 1
                while lookahead < len(candidate) and candidate[lookahead].isspace():
                    lookahead += 1
                if lookahead < len(candidate) and candidate[lookahead] not in {
                    ",",
                    "}",
                    "]",
                    ":",
                }:
                    # Likely an unescaped quote inside a string value.
                    repaired_chars.append('\\"')
                    continue
                in_string = False
                repaired_chars.append(char)
                continue

            repaired_chars.append(char)
            continue

        if char == '"':
            in_string = True
            repaired_chars.append(char)
            continue

        if char == "{":
            curly_depth += 1
            repaired_chars.append(char)
            continue

        if char == "}":
            if curly_depth == 0:
                continue
            curly_depth -= 1
            repaired_chars.append(char)
            if curly_depth == 0 and square_depth == 0:
                break
            continue

        if char == "[":
            square_depth += 1
            repaired_chars.append(char)
            continue

        if char == "]":
            if square_depth == 0:
                continue
            square_depth -= 1
            repaired_chars.append(char)
            continue

        repaired_chars.append(char)

    candidate = "".join(repaired_chars)

    if in_string:
        candidate = f'{candidate}"'

    if square_depth > 0:
        candidate = f"{candidate}{']' * square_depth}"

    if curly_depth > 0:
        candidate = f"{candidate}{'}' * curly_depth}"

    # Drop trailing commas before object/array closure.
    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)

    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        fallback = _extract_first_json_object(candidate)
        if fallback:
            try:
                parsed = json.loads(fallback)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                return None

    return None


@contextmanager
def _json_parse_tracking_scope(
    parse_metrics: dict[str, Any] | None, stage_name: str
):
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
    "_extract_first_json_object",
    "_try_fix_truncated_json_object",
    "_json_parse_tracking_scope",
    "_record_json_parse_failure",
    "_record_json_parse_recovery",
]
