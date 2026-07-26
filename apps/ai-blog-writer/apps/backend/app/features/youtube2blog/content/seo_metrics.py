"""Pure text measurements shared by YouTube2Blog SEO phases."""

from __future__ import annotations

import re
from typing import Any


def safe_text(value: Any) -> str:
    """Normalize optional or untrusted values for prompt and metric use."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def tokenize_terms(value: str) -> list[str]:
    """Return normalized terms suitable for heuristic keyword selection."""
    return re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,}", value.lower())


def extract_headings(content: str) -> list[str]:
    """Extract non-empty Markdown heading text."""
    headings: list[str] = []
    for line in content.splitlines():
        if re.match(r"^\s{0,3}#{1,6}\s+\S", line):
            cleaned = re.sub(r"^\s{0,3}#{1,6}\s+", "", line).strip()
            if cleaned:
                headings.append(cleaned)
    return headings


def split_paragraphs(content: str) -> list[str]:
    """Split Markdown into non-empty paragraph-like blocks."""
    return [part.strip() for part in re.split(r"\n\s*\n", content) if part.strip()]


def keyword_occurrence_count(content: str, keyword: str) -> int:
    """Count case-insensitive, whole-phrase keyword occurrences."""
    clean_keyword = keyword.strip()
    if not clean_keyword:
        return 0
    escaped = re.escape(clean_keyword.lower())
    return len(re.findall(rf"\b{escaped}\b", content.lower()))
