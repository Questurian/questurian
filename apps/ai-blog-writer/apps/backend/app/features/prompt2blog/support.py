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


def _clean_string_list(items: list[str]) -> list[str]:
    cleaned: list[str] = []
    for item in items:
        text = _safe_str(item)
        if text:
            cleaned.append(text)
    return cleaned
