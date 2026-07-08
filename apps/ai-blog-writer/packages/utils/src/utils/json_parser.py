"""
Robust JSON parsing utilities for LLM responses.

LLMs often return JSON wrapped in markdown, with prose around it, or with
minor truncation defects. This module is the canonical parser for those cases.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def parse_json_response(
    response: str,
    raise_on_error: bool = True,
    default: Optional[Dict[str, Any]] = None,
    *,
    allow_repair: bool = True,
) -> Dict[str, Any]:
    """
    Parse JSON from an LLM response with multiple fallback strategies.

    Handles complete/truncated markdown fences, prose preambles, first balanced
    JSON objects, and common malformed output such as raw newlines in strings,
    unescaped quotes, dangling commas, and missing closing brackets.
    """
    if not response or not response.strip():
        if raise_on_error:
            raise RuntimeError("Cannot parse JSON from empty response")
        return default or {}

    original_text = response.strip()
    candidates = _json_candidates(original_text)

    first_error: json.JSONDecodeError | None = None
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            first_error = first_error or exc

    if allow_repair:
        for candidate in candidates:
            fixed_result = try_repair_json_object(candidate)
            if fixed_result is not None:
                return fixed_result

    if first_error is None:
        error_msg = f"No JSON found in LLM response: {original_text[:300]}..."
    else:
        error_msg = (
            f"JSON parse failed: {first_error}. " f"Response: {original_text[:300]}..."
        )

    if raise_on_error:
        raise RuntimeError(error_msg) from first_error
    logger.warning(error_msg)
    return default or {}


def _json_candidates(text: str) -> list[str]:
    cleaned_text = text.strip().lstrip("\ufeff")
    if not cleaned_text:
        return []

    candidates: list[str] = []

    # Fenced JSON can be complete or missing a closing fence.
    if cleaned_text.startswith("```"):
        unfenced = re.sub(
            r"^```(?:json)?\s*",
            "",
            cleaned_text,
            flags=re.IGNORECASE,
        ).strip()
        unfenced = re.sub(r"\s*```$", "", unfenced).strip()
        if unfenced:
            candidates.append(unfenced)

    fence_match = re.search(
        r"```(?:json)?\s*(.*?)(?:\s*```|\s*$)",
        cleaned_text,
        re.DOTALL | re.IGNORECASE,
    )
    if fence_match:
        fenced = fence_match.group(1).strip()
        if fenced:
            candidates.append(fenced)

    candidates.append(cleaned_text)

    first_last = _first_to_last_brace(cleaned_text)
    if first_last:
        candidates.append(first_last)

    first_balanced = extract_first_json_object(cleaned_text)
    if first_balanced:
        candidates.append(first_balanced)

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate and candidate not in seen:
            deduped.append(candidate)
            seen.add(candidate)
    return deduped


def _first_to_last_brace(text: str) -> str | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return text[start : end + 1].strip()


def extract_first_json_object(text: str) -> str | None:
    """Extract the first balanced JSON object substring from text."""
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escaped = False

    for idx in range(start, len(text)):
        char = text[idx]

        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : idx + 1]

    return None


def try_repair_json_object(text: str) -> Dict[str, Any] | None:
    """
    Repair JSON that LLMs commonly emit malformed.

    Handles trailing commas, raw control characters inside strings, a response
    truncated mid-string/container, and likely unescaped quote characters inside
    string values.
    """
    candidate = text.strip()
    if not candidate:
        return None

    first_brace = candidate.find("{")
    if first_brace == -1:
        return None
    candidate = candidate[first_brace:]

    repaired_chars: list[str] = []
    in_string = False
    escaped = False
    curly_depth = 0
    square_depth = 0

    for idx, char in enumerate(candidate):
        if in_string:
            if escaped:
                repaired_chars.append(char)
                escaped = False
                continue

            if char == "\\":
                repaired_chars.append(char)
                escaped = True
                continue

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
        candidate += '"'
    if square_depth > 0:
        candidate += "]" * square_depth
    if curly_depth > 0:
        candidate += "}" * curly_depth

    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)

    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        fallback = extract_first_json_object(candidate)
        if fallback:
            try:
                parsed = json.loads(fallback)
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None
    return None


def extract_json_field(
    response: str,
    field: str,
    default: Any = None,
) -> Any:
    """
    Extract a specific field from a JSON response.

    Convenience function that combines parsing with field extraction.
    """
    try:
        parsed = parse_json_response(response, raise_on_error=False, default={})
        return parsed.get(field, default)
    except Exception:
        return default


def validate_json_structure(
    data: Dict[str, Any],
    required_fields: list[str],
) -> tuple[bool, list[str]]:
    """Validate that a parsed JSON dict contains required fields."""
    missing = [field for field in required_fields if field not in data]
    return len(missing) == 0, missing
