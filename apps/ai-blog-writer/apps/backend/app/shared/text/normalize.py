"""Shared text normalizers for AI-generated output.

Currently exposes dash normalization: replaces em dashes, double hyphens, and
non-numeric en dashes with ", " so that prose output reads without the em-dash
cadence that flags AI generation. Numeric en-dash ranges (e.g. "5–10") are
preserved.
"""

from __future__ import annotations

import re

_DASH_SUB_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\s*(?:—|--)\s*"), ", "),
    (re.compile(r"(?<!\d)\s*–\s*(?!\d)"), ", "),
)

_DOUBLE_COMMA = re.compile(r",\s*,")
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([.,;:!?])")


def normalize_dashes(text: str) -> str:
    for pattern, replacement in _DASH_SUB_PATTERNS:
        text = pattern.sub(replacement, text)
    text = _DOUBLE_COMMA.sub(",", text)
    text = _SPACE_BEFORE_PUNCT.sub(r"\1", text)
    return text
