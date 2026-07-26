"""Stable Stage 3 quality facade.

Provider-backed assessment and rewriting live in focused modules. Deterministic
revision decisions live under ``quality`` so callers can test them without an
LLM dependency.
"""

from __future__ import annotations

from typing import Any

from app.features.youtube2blog.config import Y2B_PRIMARY_MODEL
from app.features.youtube2blog.quality.article_assessment import QUALITY_DIMENSIONS
from app.features.youtube2blog.quality.article_revision import (
    build_targeted_feedback,
    pick_improvement_mode,
)
from app.shared.text import enforce_anti_ai_tells_markdown
from shared import Stage3Output
from utils import get_vertex_llm, parse_json_response

from .stage_3_quality_assessment import (
    ARTICLE_QUALITY_ASSESSMENT_PROMPT,
    assess_article_quality,
)
from .stage_3_quality_rewrite import (
    ARTICLE_QUALITY_IMPROVEMENT_PROMPT,
    improve_article,
)


def stage_3_assess_article_quality(
    *,
    stage3: Stage3Output,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, Any]:
    return assess_article_quality(
        stage3=stage3,
        model_name=model_name,
        llm_factory=get_vertex_llm,
        json_parser=parse_json_response,
    )


def stage_3_pick_improvement_mode(
    *,
    overall_quality_score: float,
    retry_count: int,
) -> str:
    return pick_improvement_mode(
        overall_quality_score=overall_quality_score,
        retry_count=retry_count,
    )


def stage_3_improve_article(
    *,
    stage3: Stage3Output,
    top_issues: list[str],
    rewrite_brief: list[str],
    mode: str,
    focus_dimensions: list[str] | None = None,
    model_name: str = Y2B_PRIMARY_MODEL,
    tone_guidance: str | None = None,
) -> dict[str, Any]:
    return improve_article(
        stage3=stage3,
        top_issues=top_issues,
        rewrite_brief=rewrite_brief,
        mode=mode,
        focus_dimensions=focus_dimensions,
        model_name=model_name,
        tone_guidance=tone_guidance,
        llm_factory=get_vertex_llm,
        anti_ai_enforcer=enforce_anti_ai_tells_markdown,
    )


def stage_3_build_targeted_feedback(
    *,
    dimension_scores: dict[str, float],
    top_issues: list[str],
    rewrite_brief: list[str],
) -> dict[str, Any]:
    return build_targeted_feedback(
        dimension_scores=dimension_scores,
        top_issues=top_issues,
        rewrite_brief=rewrite_brief,
    )


__all__ = [
    "ARTICLE_QUALITY_ASSESSMENT_PROMPT",
    "ARTICLE_QUALITY_IMPROVEMENT_PROMPT",
    "QUALITY_DIMENSIONS",
    "stage_3_assess_article_quality",
    "stage_3_build_targeted_feedback",
    "stage_3_improve_article",
    "stage_3_pick_improvement_mode",
]
