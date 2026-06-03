"""Quality/fact gating decisions and rewrite-retry feedback assembly.

Extracted verbatim from url2blog/routes.py.
"""

import re
from typing import Any

from ..llm.coerce import *  # noqa: F401,F403
from ..config import *  # noqa: F401,F403
from ..prompts import *  # noqa: F401,F403
from ..content.markdown import (  # noqa: F401
    _ensure_markdown_section_headers,
    _remove_academic_conclusion_phrases,
)


def _should_force_v2_fact_repair(fact_coverage: dict[str, Any]) -> bool:
    """Return True when factual retention is below threshold."""
    return bool(
        _safe_int(
            fact_coverage.get("coverage_score"), default=7, min_value=1, max_value=10
        )
        < 8
        or _safe_int(
            fact_coverage.get("missing_high_count"),
            default=0,
            min_value=0,
            max_value=99,
        )
        > 0
        or _safe_int(
            fact_coverage.get("missing_count"), default=0, min_value=0, max_value=99
        )
        >= 3
    )


def _should_force_v2_second_pass(
    quality: dict[str, Any], ngram_overlap: float, *, overlap_threshold: float = 0.08
) -> bool:
    """Return True when rewrite quality is below enforced bar."""
    return bool(
        quality.get("too_close_to_source")
        or ngram_overlap >= overlap_threshold
        or _safe_int(
            quality.get("overall_score"), default=6, min_value=1, max_value=10
        )
        < 8
        or _safe_int(
            quality.get("guideline_coverage_score"),
            default=6,
            min_value=1,
            max_value=10,
        )
        < 8
        or _safe_int(
            quality.get("informativeness_score"), default=6, min_value=1, max_value=10
        )
        < 8
        or _safe_int(
            quality.get("originality_score"), default=6, min_value=1, max_value=10
        )
        < 7
    )


def _build_v2_rewrite_retry_feedback(
    *,
    retry_count: int,
    retry_feedback: dict[str, Any],
    previous_quality: dict[str, Any],
) -> str:
    """Build prompt suffix for graph-level rewrite retries."""
    if retry_count <= 0:
        return ""

    retry_payload = _safe_dict(retry_feedback)
    quality_payload = _safe_dict(previous_quality)

    required_revisions = _safe_string_list(retry_payload.get("required_revisions"))
    if not required_revisions:
        required_revisions = _safe_string_list(quality_payload.get("required_revisions"))
    if not required_revisions:
        required_revisions = [
            "Increase guideline-aligned reader utility with clearer section intent.",
            "Improve specificity and practical takeaways; reduce generic filler.",
            "Restructure flow more decisively instead of light paraphrasing.",
        ]

    previous_overall_score = _safe_int(
        retry_payload.get("overall_score"),
        default=_safe_int(
            quality_payload.get("overall_score"),
            default=0,
            min_value=0,
            max_value=10,
        ),
        min_value=0,
        max_value=10,
    )
    previous_ngram_overlap = retry_payload.get("ngram_overlap")
    try:
        ngram_text = f"{float(previous_ngram_overlap):.3f}"
    except (TypeError, ValueError):
        ngram_text = "N/A"

    quality_summary = _safe_str(retry_payload.get("quality_summary")) or _safe_str(
        quality_payload.get("quality_summary")
    )
    if not quality_summary:
        quality_summary = (
            "Prior attempt did not clear quality thresholds for publication readiness."
        )

    rewrite_intensity = (
        "strong" if retry_count >= 2 or previous_overall_score <= 6 else "medium"
    )
    required_revisions_text = "\n".join(f"- {item}" for item in required_revisions[:6])

    return (
        V2_REWRITE_RETRY_FEEDBACK_SUFFIX.replace("{retry_attempt}", str(retry_count + 1))
        .replace("{previous_overall_score}", str(previous_overall_score))
        .replace("{previous_ngram_overlap}", ngram_text)
        .replace("{rewrite_intensity}", rewrite_intensity)
        .replace("{quality_summary}", quality_summary)
        .replace("{required_revisions}", required_revisions_text)
    )

__all__ = [
    "_should_force_v2_fact_repair",
    "_should_force_v2_second_pass",
    "_build_v2_rewrite_retry_feedback",
]
