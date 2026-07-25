"""Pure value-coercion and normalization helpers (no I/O, no LLM).

Extracted verbatim from url2blog/routes.py.
"""

import re
from typing import Any


def _normalize_article_type_name(name: str) -> str:
    """Normalize article type names for robust matching."""
    return re.sub(r"\s+", " ", name.strip()).lower()


def _enforce_editorial_reasoning(reasoning: str, classification: str) -> str:
    """Force classification reasoning to reference editorial intent."""
    cleaned = reasoning.strip()
    if not cleaned:
        cleaned = (
            f"Editorial intent: {classification} best matches the desired reader outcome "
            "and publishing objective."
        )
    if "editorial intent" not in cleaned.lower():
        cleaned = (
            f"{cleaned} Editorial intent: this format best aligns with the intended "
            "reader outcome and content objective."
        )
    return cleaned


def _safe_str(value: Any) -> str:
    """Return a trimmed string value."""
    return value.strip() if isinstance(value, str) else ""


def _safe_string_list(value: Any) -> list[str]:
    """Normalize a value to a list of strings."""
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _safe_dict(value: Any) -> dict[str, Any]:
    """Normalize a value to a dictionary."""
    return value if isinstance(value, dict) else {}


def _safe_bool(value: Any, default: bool = False) -> bool:
    """Normalize loose boolean values."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y"}:
            return True
        if normalized in {"false", "0", "no", "n"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return default


def _safe_int(value: Any, default: int, *, min_value: int, max_value: int) -> int:
    """Normalize an integer and clamp to bounds."""
    candidate: int
    if isinstance(value, int):
        candidate = value
    elif isinstance(value, float):
        candidate = int(round(value))
    elif isinstance(value, str):
        try:
            candidate = int(float(value.strip()))
        except (TypeError, ValueError):
            candidate = default
    else:
        candidate = default

    return max(min_value, min(max_value, candidate))


def _normalize_language_name(language: str) -> str:
    """Normalize language labels into canonical names."""
    lowered = language.strip().lower()
    if not lowered:
        return "English"
    language_map = {
        "english": "English",
        "en": "English",
        "spanish": "Spanish",
        "es": "Spanish",
        "espanol": "Spanish",
        "portuguese": "Portuguese",
        "pt": "Portuguese",
        "french": "French",
        "fr": "French",
        "italian": "Italian",
        "it": "Italian",
        "german": "German",
        "de": "German",
        "japanese": "Japanese",
        "ja": "Japanese",
        "korean": "Korean",
        "ko": "Korean",
        "chinese": "Chinese",
        "zh": "Chinese",
    }
    return language_map.get(lowered, language.strip().title() or "English")


def _tokenize_similarity_words(text: str) -> list[str]:
    """Tokenize text for rough similarity heuristics."""
    return re.findall(r"[a-z0-9']+", text.lower())


def _ngram_overlap_ratio(
    source_words: list[str],
    rewritten_words: list[str],
    *,
    n: int = 10,
) -> float:
    """Return n-gram overlap ratio from rewritten text against source text."""
    if len(source_words) < n or len(rewritten_words) < n:
        return 0.0

    source_ngrams = {
        " ".join(source_words[idx:idx + n])
        for idx in range(len(source_words) - n + 1)
    }
    rewritten_total = len(rewritten_words) - n + 1
    if rewritten_total <= 0:
        return 0.0

    overlap_hits = 0
    for idx in range(rewritten_total):
        chunk = " ".join(rewritten_words[idx:idx + n])
        if chunk in source_ngrams:
            overlap_hits += 1

    return overlap_hits / rewritten_total


__all__ = [
    "_normalize_article_type_name",
    "_enforce_editorial_reasoning",
    "_safe_str",
    "_safe_string_list",
    "_safe_dict",
    "_safe_bool",
    "_safe_int",
    "_normalize_language_name",
    "_tokenize_similarity_words",
    "_ngram_overlap_ratio",
]
