from __future__ import annotations

import json
import re
import unicodedata
from typing import Any


def _safe_str(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def _safe_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _safe_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if isinstance(value, bool):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if isinstance(value, bool):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, indent=2)
    except Exception:
        return "{}"


def _tokenize_words(value: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", value.lower())


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def _normalize_article_type_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    normalized = (
        normalized.replace("’", "'")
        .replace("‘", "'")
        .replace("‑", "-")
        .replace("–", "-")
        .replace("—", "-")
        .replace("\xa0", " ")
    )
    return re.sub(r"[^a-z0-9]+", "", normalized.lower())


def _format_raw_sources(raw_sources: list[str]) -> str:
    cleaned = []
    for index, source in enumerate(raw_sources, start=1):
        text = _safe_str(source)
        if not text:
            continue
        cleaned.append(f"Source {index}:\n{text}")

    if not cleaned:
        return "No raw sources provided."
    return "\n\n---\n\n".join(cleaned)


def _format_hard_constraints(writing_brief: dict[str, Any]) -> str:
    """Render must-include and must-avoid items as an explicit requirement
    block. These are hard constraints and must never be presented to a model
    as optional narrative colour."""
    must_include = _clean_string_list(_safe_dict(writing_brief).get("must_include") or [])
    negative = _clean_string_list(
        _safe_dict(writing_brief).get("negative_instructions") or []
    )

    sections: list[str] = []
    if must_include:
        sections.append(
            "MUST INCLUDE - every item below has to appear in the article:\n"
            + "\n".join(f"- {item}" for item in must_include)
        )
    if negative:
        sections.append(
            "MUST AVOID - none of the following may appear:\n"
            + "\n".join(f"- {item}" for item in negative)
        )

    if not sections:
        return "No hard constraints were supplied."
    return "\n\n".join(sections)


def _format_style_directive(option_context: dict[str, Any]) -> str:
    """Render the resolved tone, length, and brand voice guides as a required
    style block. These used to travel inside ``editorial_instructions``, which
    every prompt renders under the header "NARRATIVE FOCUS (OPTIONAL)" -- so the
    whole tone guide reached the model labelled optional. Built from
    ``option_context`` rather than the writing brief so the runtime-run path
    gets the same directive as a full run."""
    context = _safe_dict(option_context)

    sections: list[str] = []
    for key, heading in (
        ("tone", "Tone"),
        ("length", "Length"),
        ("brand_voice", "Brand voice"),
    ):
        option = _safe_dict(context.get(key))
        instructions = _safe_str(option.get("instructions"))
        if not instructions:
            continue
        label = _safe_str(option.get("label")) or _safe_str(option.get("id"))
        sections.append(f"{heading} profile ({label}):\n{instructions}")

    if not sections:
        return "No style profiles were resolved. Use clear, neutral editorial prose."
    return "\n\n".join(sections)


def _clean_string_list(items: list[str]) -> list[str]:
    cleaned: list[str] = []
    for item in items:
        text = _safe_str(item)
        if text:
            cleaned.append(text)
    return cleaned
