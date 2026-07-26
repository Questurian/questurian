"""LLM-backed SEO brief generation."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from langchain_core.prompts import PromptTemplate

from app.features.youtube2blog.config import Y2B_PRIMARY_MODEL
from app.features.youtube2blog.quality.seo_brief import (
    build_fallback_seo_brief,
    normalize_seo_brief,
)
from shared import Stage3Output
from utils import get_vertex_llm, parse_json_response

from .stage_seo_prompts import SEO_BRIEF_PROMPT

logger = logging.getLogger(__name__)


def generate_seo_brief(
    *,
    stage3: Stage3Output,
    model_name: str = Y2B_PRIMARY_MODEL,
    llm_factory: Callable[..., Any] | None = None,
    json_parser: Callable[[str], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Generate SEO direction from article content."""
    llm = (llm_factory or get_vertex_llm)(
        temperature=0.1,
        max_tokens=2048,
        model_name=model_name,
    )
    prompt = PromptTemplate(
        input_variables=["title", "article_type", "guideline", "article"],
        template=SEO_BRIEF_PROMPT,
    )
    full_prompt = prompt.format(
        title=stage3.title[:500],
        article_type=stage3.article_type,
        guideline=stage3.guideline_used[:8000],
        article=stage3.final_article[:20_000],
    )
    fallback = build_fallback_seo_brief(stage3)

    try:
        raw_response = llm.invoke(full_prompt)
        if not raw_response or not str(raw_response).strip():
            raise RuntimeError("SEO brief returned empty response")
        parsed = (json_parser or parse_json_response)(str(raw_response))
        return {
            **normalize_seo_brief(parsed, fallback=fallback),
            "debug_seo_brief_prompt": full_prompt,
            "debug_seo_brief_response": str(raw_response),
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("SEO brief fallback triggered: %s", exc)
        return {
            **fallback,
            "error": str(exc),
            "debug_seo_brief_prompt": full_prompt,
            "debug_seo_brief_response": "",
        }
