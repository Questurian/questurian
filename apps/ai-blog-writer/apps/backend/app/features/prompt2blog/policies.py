"""Pure gate decisions for the Prompt2Blog quality loop.

These functions decide whether a draft is good enough, whether another repair
attempt is worth spending, and whether a stage's output is an improvement on
what it replaced. They hold no I/O and no prompt construction.
"""

from __future__ import annotations

import re
from typing import Any

from .config import P2B_AUGMENTATION_MIN_RETENTION_RATIO, P2B_REPAIR_MAX_ATTEMPTS
from .quality import _should_run_repair
from .support import _safe_dict, _safe_int, _safe_str, _tokenize_words


def _quality_rank(quality: dict[str, Any]) -> tuple[int, int]:
    """Rank a draft for keep-best comparison. Overall score first, then
    guideline coverage as the tie-break."""
    quality = _safe_dict(quality)
    return (
        _safe_int(quality.get("overall_score"), default=0),
        _safe_int(quality.get("guideline_coverage_score"), default=0),
    )


def is_better_quality(
    candidate: dict[str, Any],
    incumbent: dict[str, Any] | None,
) -> bool:
    """True when ``candidate`` should replace ``incumbent`` as the best draft.

    Repair used to overwrite the draft unconditionally, so a repair pass that
    scored worse than the draft it replaced still shipped.
    """
    if not incumbent:
        return True
    return _quality_rank(candidate) > _quality_rank(incumbent)


def route_quality_gate(state: dict[str, Any]) -> str:
    """Decide whether to spend another repair attempt or settle on the best
    draft seen so far."""
    quality = _safe_dict(state.get("quality"))
    checks = _safe_dict(state.get("quality_checks"))
    attempts = _safe_int(state.get("repair_attempts"), default=0)

    if not _should_run_repair(quality, checks):
        return "settle"
    if attempts >= P2B_REPAIR_MAX_ATTEMPTS:
        return "settle"
    return "repair"


def _count_section_headings(content: str) -> int:
    return len(re.findall(r"(?m)^\s{0,3}#{2,6}\s+\S", _safe_str(content)))


def evaluate_augmentation(
    *,
    original_content: str,
    augmented_content: str,
) -> tuple[bool, dict[str, Any]]:
    """Decide whether augmented content may replace the draft it augmented.

    Editorial augmentation is additive by contract: it inserts callouts and
    boxes into an existing article. Content that comes back materially shorter,
    or that has lost the article's section structure, is a regression rather
    than an augmentation and is rolled back.
    """
    original_words = len(_tokenize_words(original_content))
    augmented_words = len(_tokenize_words(augmented_content))
    original_headings = _count_section_headings(original_content)
    augmented_headings = _count_section_headings(augmented_content)

    retention_ratio = 1.0
    if original_words:
        retention_ratio = augmented_words / original_words

    checks = {
        "content_present": bool(_safe_str(augmented_content)),
        "retained_length": retention_ratio >= P2B_AUGMENTATION_MIN_RETENTION_RATIO,
        "retained_headings": augmented_headings >= original_headings,
    }
    diagnostics = {
        **checks,
        "retention_ratio": round(retention_ratio, 3),
        "original_word_count": original_words,
        "augmented_word_count": augmented_words,
        "original_heading_count": original_headings,
        "augmented_heading_count": augmented_headings,
    }
    return all(checks.values()), diagnostics
