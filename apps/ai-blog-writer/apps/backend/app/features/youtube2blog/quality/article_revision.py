"""Pure Stage 3 article rewrite policy."""

from __future__ import annotations

import re
from typing import Any

_DIMENSION_HINTS = {
    "clarity": "Shorten dense sentences and resolve ambiguous phrasing.",
    "structure_coherence": (
        "Reorder sections for clearer progression and add stronger transitions."
    ),
    "specificity": (
        "Replace generic wording with concrete examples/details already present "
        "in source."
    ),
    "usefulness_actionability": (
        "Make guidance more actionable with explicit reader takeaways."
    ),
    "repetition_control": "Remove repetitive statements and redundant filler phrases.",
    "audience_fit": (
        "Align framing and depth with the intended reader and article type."
    ),
}


def articles_are_equivalent(left: str, right: str) -> bool:
    """Compare article text while ignoring case and whitespace differences."""

    def normalize(value: str) -> str:
        return re.sub(r"\s+", " ", value).strip().lower()

    return normalize(left) == normalize(right)


def pick_improvement_mode(
    *,
    overall_quality_score: float,
    retry_count: int,
) -> str:
    """Select rewrite intensity based on score and retry count."""
    if retry_count >= 2:
        return "strong"
    if overall_quality_score >= 7.3:
        return "light"
    if overall_quality_score >= 6.2:
        return "medium"
    return "strong"


def build_targeted_feedback(
    *,
    dimension_scores: dict[str, float],
    top_issues: list[str],
    rewrite_brief: list[str],
) -> dict[str, Any]:
    """Derive focused rewrite instructions from weak quality dimensions."""
    ranked = sorted(dimension_scores.items(), key=lambda item: item[1])
    focus_dimensions = [name for name, _ in ranked[:3]]

    enhanced_brief = list(rewrite_brief)
    for key in focus_dimensions:
        hint = _DIMENSION_HINTS.get(key)
        if hint and hint not in enhanced_brief:
            enhanced_brief.append(hint)

    enhanced_issues = list(top_issues)
    for key in focus_dimensions:
        issue = f"Raise {key.replace('_', ' ')} with targeted rewrite."
        if issue not in enhanced_issues:
            enhanced_issues.append(issue)

    return {
        "focus_dimensions": focus_dimensions,
        "top_issues": enhanced_issues[:5],
        "rewrite_brief": enhanced_brief[:7],
    }
