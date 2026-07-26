"""Stable facade for the YouTube2Blog SEO phases."""

from __future__ import annotations

from typing import Any

from app.features.youtube2blog.config import Y2B_PRIMARY_MODEL
from app.features.youtube2blog.quality.seo_assessment import evaluate_seo_quality
from app.shared.text import enforce_anti_ai_tells_markdown
from shared import Stage3Output
from utils import get_vertex_llm, parse_json_response

from .stage_seo_brief import generate_seo_brief
from .stage_seo_enrichment import enrich_seo_article
from .stage_seo_prompts import SEO_BRIEF_PROMPT, SEO_ENRICH_PROMPT


def stage_seo_generate_brief(
    *,
    stage3: Stage3Output,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, Any]:
    """Generate SEO direction from article content."""
    return generate_seo_brief(
        stage3=stage3,
        model_name=model_name,
        llm_factory=get_vertex_llm,
        json_parser=parse_json_response,
    )


def stage_seo_enrich_article(
    *,
    stage3: Stage3Output,
    seo_brief: dict[str, Any],
    mode: str,
    feedback: str | None = None,
    model_name: str = Y2B_PRIMARY_MODEL,
    tone_guidance: str | None = None,
) -> dict[str, Any]:
    """Rewrite an article for SEO while preserving facts and coverage."""
    return enrich_seo_article(
        stage3=stage3,
        seo_brief=seo_brief,
        mode=mode,
        feedback=feedback,
        model_name=model_name,
        tone_guidance=tone_guidance,
        llm_factory=get_vertex_llm,
        anti_ai_enforcer=enforce_anti_ai_tells_markdown,
    )


def stage_seo_evaluate_quality(
    *,
    article: str,
    seo_brief: dict[str, Any],
    baseline_article: str | None = None,
) -> dict[str, Any]:
    """Evaluate enriched article SEO quality for graph gating."""
    return evaluate_seo_quality(
        article=article,
        seo_brief=seo_brief,
        baseline_article=baseline_article,
    )


__all__ = [
    "SEO_BRIEF_PROMPT",
    "SEO_ENRICH_PROMPT",
    "stage_seo_enrich_article",
    "stage_seo_evaluate_quality",
    "stage_seo_generate_brief",
]
