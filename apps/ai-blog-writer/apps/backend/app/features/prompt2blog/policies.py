"""Pure gate decisions for the Prompt2Blog quality loop.

These functions decide whether a draft is good enough, whether another repair
attempt is worth spending, and whether a stage's output is an improvement on
what it replaced. They hold no I/O and no prompt construction.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .config import P2B_AUGMENTATION_MIN_RETENTION_RATIO, P2B_REPAIR_MAX_ATTEMPTS
from .quality import (
    HARD_CONSTRAINT_CHECK_KEYS,
    REPAIR_SCORE_THRESHOLD,
    _should_run_repair,
)
from .support import _safe_bool, _safe_dict, _safe_int, _safe_str, _tokenize_words


@dataclass(frozen=True)
class ReadinessVerdict:
    """Whether a finished run may be handed to staging, and why not if not."""

    ready: bool
    blockers: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {"ready": self.ready, "blockers": list(self.blockers)}


def evaluate_readiness(
    *,
    quality: dict[str, Any],
    checks: dict[str, Any],
    groundedness: dict[str, Any],
) -> ReadinessVerdict:
    """Decide whether a settled run is ready for staging.

    Finalize used to ask three questions -- word count, primary keyword,
    `groundedness["grounded"]` -- and shipped anything that answered yes. A
    4/10 article whose repair attempts had all failed still came back
    `ready_for_staging`, and so did a run whose grounding check had crashed,
    because the unchecked result reports `grounded: True` so that a checker
    outage degrades the run instead of blocking it.

    The blocker set is deliberately the repair loop's own trigger conditions
    plus the two failures repair cannot clear (an audit that produced no score,
    and a grounding check that never ran). Blocking on anything repair does not
    try to fix would mark runs `needs_revision` that the pipeline had no way of
    rescuing.
    """
    quality = _safe_dict(quality)
    checks = _safe_dict(checks)
    groundedness = _safe_dict(groundedness)
    blockers: list[str] = []

    # Absent rather than present is the safe default here. `unchecked_groundedness`
    # sets `checked: False, grounded: True`; reading `grounded` alone treats a
    # crashed checker as a pass.
    if not _safe_bool(groundedness.get("checked"), default=False):
        blockers.append("groundedness_unchecked")
    elif not _safe_bool(groundedness.get("grounded"), default=False):
        blockers.append("claims_ungrounded")

    if not _safe_bool(quality.get("audit_complete"), default=False):
        blockers.append("audit_incomplete")
    elif (
        _safe_int(quality.get("overall_score"), default=0) < REPAIR_SCORE_THRESHOLD
    ):
        blockers.append("quality_score_below_threshold")

    if _safe_bool(quality.get("too_close_to_source"), default=False):
        blockers.append("too_close_to_source")

    for key in HARD_CONSTRAINT_CHECK_KEYS:
        if not _safe_bool(checks.get(key), default=True):
            blockers.append(key)

    return ReadinessVerdict(ready=not blockers, blockers=tuple(blockers))


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
