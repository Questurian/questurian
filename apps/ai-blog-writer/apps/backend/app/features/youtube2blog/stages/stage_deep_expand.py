"""Compatibility facade and orchestrator for article expansion jobs.

The two execution paths live in separate modules:

- :mod:`deep_expansion` performs gap analysis and additive expansion.
- :mod:`listicle_rewrite` detects and completely rewrites listicles.

Public functions remain here because routes and integrations already import
this stage module directly.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.core import write_stage_result, write_status
from app.features.youtube2blog.config import Y2B_PRIMARY_MODEL
from utils import get_vertex_llm, parse_json_response

from . import deep_expansion as expansion_pipeline
from . import listicle_rewrite as listicle_pipeline
from .deep_expand_llm import invoke_json_llm, invoke_text_llm
from .deep_expand_prompts import (
    EXPANSION_PROMPT,
    GAP_ANALYSIS_PROMPT,
    LISTICLE_DETECT_PROMPT,
    LISTICLE_REWRITE_PROMPT,
)

logger = logging.getLogger(__name__)

FEATURE_NAME = "youtube2blog_expand"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _invoke_json_llm(
    prompt: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, Any]:
    """Invoke the configured model and parse its strict JSON response."""
    return invoke_json_llm(
        prompt,
        model_name,
        get_llm=get_vertex_llm,
        parse_json=parse_json_response,
        logger=logger,
    )


def _invoke_text_llm(
    prompt: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> str:
    """Invoke the configured model using the expansion output budget."""
    return invoke_text_llm(prompt, model_name, get_llm=get_vertex_llm)


def detect_listicle(
    article: str,
    title: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, Any]:
    """Detect a listicle through the dedicated listicle pipeline."""
    return listicle_pipeline.detect_listicle(
        article,
        title,
        model_name,
        invoke_json=_invoke_json_llm,
        logger=logger,
    )


def analyze_article_gaps(
    article: str,
    article_type: str,
    title: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, Any]:
    """Analyze missing material through the additive-expansion pipeline."""
    return expansion_pipeline.analyze_article_gaps(
        article,
        article_type,
        title,
        model_name,
        invoke_json=_invoke_json_llm,
    )


def expand_article_with_gaps(
    article: str,
    gaps: list[dict[str, Any]],
    expansion_plan: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> str:
    """Generate additive expansion through the dedicated pipeline."""
    return expansion_pipeline.expand_article_with_gaps(
        article,
        gaps,
        expansion_plan,
        model_name,
        get_llm=get_vertex_llm,
    )


def rewrite_listicle_article(
    original_article: str,
    article_type: str,
    title: str,
    new_items: list[str],
    model_name: str = Y2B_PRIMARY_MODEL,
) -> str:
    """Rewrite a listicle through the dedicated listicle pipeline."""
    return listicle_pipeline.rewrite_listicle_article(
        original_article,
        article_type,
        title,
        new_items,
        model_name,
        get_llm=get_vertex_llm,
    )


def _write_terminal_status(job_id: str, *, error: str | None = None) -> None:
    failed = error is not None
    write_status(
        job_id,
        {
            "run_id": job_id,
            "stage": "error" if failed else "completed",
            "state": "failed" if failed else "completed",
            "updated_at": _now_iso(),
            "error": error,
        },
        feature=FEATURE_NAME,
    )


def run_deep_expand(
    expand_job_id: str,
    article: str,
    article_type: str,
    title: str,
    model_name: str = Y2B_PRIMARY_MODEL,
    rewrite_items: list[str] | None = None,
) -> None:
    """Run and persist either additive expansion or a listicle rewrite."""
    try:
        shared_dependencies = {
            "feature_name": FEATURE_NAME,
            "now_iso": _now_iso,
            "write_status": write_status,
            "write_stage_result": write_stage_result,
        }
        if rewrite_items:
            listicle_pipeline.run_listicle_rewrite(
                expand_job_id,
                article,
                article_type,
                title,
                rewrite_items,
                model_name,
                rewrite=rewrite_listicle_article,
                **shared_dependencies,
            )
        else:
            expansion_pipeline.run_deep_expansion(
                expand_job_id,
                article,
                article_type,
                title,
                model_name,
                analyze=analyze_article_gaps,
                expand=expand_article_with_gaps,
                **shared_dependencies,
            )
        _write_terminal_status(expand_job_id)
    except Exception as exc:  # noqa: BLE001
        logger.error("Deep expand failed for %s: %s", expand_job_id, exc)
        _write_terminal_status(expand_job_id, error=str(exc))
        raise


__all__ = [
    "EXPANSION_PROMPT",
    "FEATURE_NAME",
    "GAP_ANALYSIS_PROMPT",
    "LISTICLE_DETECT_PROMPT",
    "LISTICLE_REWRITE_PROMPT",
    "analyze_article_gaps",
    "detect_listicle",
    "expand_article_with_gaps",
    "rewrite_listicle_article",
    "run_deep_expand",
]
