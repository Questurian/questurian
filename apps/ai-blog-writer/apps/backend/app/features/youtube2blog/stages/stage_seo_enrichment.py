"""LLM-backed SEO article enrichment with deterministic safeguards."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from langchain_core.prompts import PromptTemplate

from app.features.youtube2blog.config import (
    Y2B_PRIMARY_MODEL,
    Y2B_STAGE3_QUALITY_IMPROVEMENT_MAX_OUTPUT_TOKENS,
    Y2B_SEO_MAX_FOCUS_DENSITY,
    Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE,
    Y2B_SEO_MAX_FOCUS_OCCURRENCES,
)
from app.features.youtube2blog.content.markdown import count_words
from app.features.youtube2blog.content.seo_metrics import (
    keyword_occurrence_count,
    safe_text,
)
from app.features.youtube2blog.quality.article_revision import (
    articles_are_equivalent,
)
from app.shared.prompts import ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown
from shared import Stage3Output
from utils import get_vertex_llm

from .stage_seo_prompts import SEO_ENRICH_PROMPT

logger = logging.getLogger(__name__)


def enrich_seo_article(
    *,
    stage3: Stage3Output,
    seo_brief: dict[str, Any],
    mode: str,
    feedback: str | None = None,
    model_name: str = Y2B_PRIMARY_MODEL,
    tone_guidance: str | None = None,
    llm_factory: Callable[..., Any] | None = None,
    anti_ai_enforcer: Callable[..., str] | None = None,
) -> dict[str, Any]:
    """Rewrite an article for SEO while preserving facts and coverage."""
    if mode not in {"primary", "retry"}:
        raise ValueError(f"Unsupported SEO mode: {mode}")

    llm = (llm_factory or get_vertex_llm)(
        temperature=0.2,
        max_tokens=Y2B_STAGE3_QUALITY_IMPROVEMENT_MAX_OUTPUT_TOKENS,
        model_name=model_name,
    )
    prompt = PromptTemplate(
        input_variables=[
            "mode",
            "search_intent",
            "focus_keyword",
            "focus_count_before",
            "max_focus_occurrences",
            "max_focus_increase",
            "max_focus_density_pct",
            "secondary_keywords",
            "seo_objective",
            "heading_hints",
            "article_type",
            "guideline",
            "feedback",
            "article",
        ],
        template=SEO_ENRICH_PROMPT,
    )
    focus_keyword = safe_text(seo_brief.get("focus_keyword"))
    secondary_keywords = [
        safe_text(item)
        for item in (seo_brief.get("secondary_keywords") or [])
        if safe_text(item)
    ]
    heading_hints = [
        safe_text(item)
        for item in (seo_brief.get("heading_hints") or [])
        if safe_text(item)
    ]
    focus_count_before = keyword_occurrence_count(
        stage3.final_article,
        focus_keyword,
    )
    max_focus_occurrences = max(
        Y2B_SEO_MAX_FOCUS_OCCURRENCES,
        focus_count_before + Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE,
    )
    full_prompt = prompt.format(
        mode=mode,
        search_intent=safe_text(seo_brief.get("search_intent")) or "informational",
        focus_keyword=focus_keyword,
        focus_count_before=focus_count_before,
        max_focus_occurrences=max_focus_occurrences,
        max_focus_increase=Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE,
        max_focus_density_pct=round(Y2B_SEO_MAX_FOCUS_DENSITY * 100, 2),
        secondary_keywords=", ".join(secondary_keywords),
        seo_objective=safe_text(seo_brief.get("seo_objective")),
        heading_hints=", ".join(heading_hints),
        article_type=stage3.article_type,
        guideline=stage3.guideline_used[:8000],
        feedback=safe_text(feedback) if mode == "retry" else "N/A",
        # Never truncate the article being rewritten. Clipping the input made
        # the model rewrite a fragment, the short result tripped the retention
        # guard below, and the whole SEO branch rolled back having spent its
        # calls for nothing. The output token cap already bounds the response.
        article=stage3.final_article,
    )
    if tone_guidance:
        full_prompt = f"{full_prompt}\n\n{tone_guidance.strip()}"
    full_prompt = f"{full_prompt}\n\n{ANTI_AI_TELLS_FULL}"

    raw_response = llm.invoke(full_prompt)
    if not raw_response or not str(raw_response).strip():
        raise RuntimeError("SEO enrich returned empty response")

    enforce = anti_ai_enforcer or enforce_anti_ai_tells_markdown
    seo_article = enforce(
        str(raw_response),
        repair=lambda repair_prompt: llm.invoke(repair_prompt),
        context="youtube2blog SEO enrich",
    )
    first_response_text = str(raw_response)

    if articles_are_equivalent(seo_article, stage3.final_article):
        retry_prompt = (
            full_prompt
            + "\n\nThe rewrite was too similar. Make targeted improvements while "
            "keeping keyword usage restrained."
        )
        second_raw = llm.invoke(retry_prompt)
        if second_raw and str(second_raw).strip():
            seo_article = enforce(
                str(second_raw),
                repair=lambda repair_prompt: llm.invoke(repair_prompt),
                context="youtube2blog SEO retry",
            )
            raw_response = second_raw
            full_prompt = retry_prompt

    words_before = count_words(stage3.final_article)
    words_after = count_words(seo_article)
    min_allowed_words = max(140, int(words_before * 0.60))
    if words_after < min_allowed_words:
        logger.warning(
            "SEO enrich output too short (%d < %d); keeping previous article",
            words_after,
            min_allowed_words,
        )
        seo_article = stage3.final_article
        words_after = words_before

    focus_count_after = keyword_occurrence_count(seo_article, focus_keyword)
    focus_density_after = focus_count_after / max(1, words_after)
    focus_count_increase = max(0, focus_count_after - focus_count_before)
    reverted_to_source = False
    if focus_keyword and (
        focus_count_after > max_focus_occurrences
        or focus_count_increase > Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE
        or focus_density_after > Y2B_SEO_MAX_FOCUS_DENSITY
    ):
        logger.warning(
            "SEO enrich output exceeded keyword safety limits; "
            "reverting to source article (after=%d, before=%d, density=%.4f)",
            focus_count_after,
            focus_count_before,
            focus_density_after,
        )
        seo_article = stage3.final_article
        words_after = words_before
        focus_count_after = focus_count_before
        focus_density_after = focus_count_before / max(1, words_before)
        focus_count_increase = 0
        reverted_to_source = True

    return {
        "mode": mode,
        "seo_article": seo_article,
        "word_count_before": words_before,
        "word_count_after": words_after,
        "focus_keyword": focus_keyword,
        "focus_count_before": focus_count_before,
        "focus_count_after": focus_count_after,
        "focus_density_after": round(focus_density_after, 4),
        "focus_count_increase": focus_count_increase,
        "reverted_to_source": reverted_to_source,
        "safety_limits": {
            "max_focus_occurrences": max_focus_occurrences,
            "max_focus_density": Y2B_SEO_MAX_FOCUS_DENSITY,
            "max_focus_occurrence_increase": (Y2B_SEO_MAX_FOCUS_OCCURRENCE_INCREASE),
        },
        "secondary_keywords": secondary_keywords,
        "debug_seo_prompt": full_prompt,
        "debug_seo_response": str(raw_response),
        "debug_seo_first_response": first_response_text,
    }
