"""LLM-backed Stage 3 quality rewrite with deterministic safeguards."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from langchain_core.prompts import PromptTemplate

from app.features.youtube2blog.config import (
    Y2B_PRIMARY_MODEL,
    Y2B_STAGE3_QUALITY_IMPROVEMENT_MAX_OUTPUT_TOKENS,
)
from app.features.youtube2blog.quality.article_assessment import tokenize_words
from app.features.youtube2blog.quality.article_revision import articles_are_equivalent
from app.shared.prompts import ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown
from shared import Stage3Output
from utils import get_vertex_llm

logger = logging.getLogger(__name__)

ARTICLE_QUALITY_IMPROVEMENT_PROMPT = """You are improving an article draft for publication quality.

Rewrite mode: {mode}
Article type: {article_type}
Guideline: {guideline}
Priority quality dimensions:
{focus_dimensions}

Quality issues to fix:
{top_issues}

Rewrite brief:
{rewrite_brief}

Rules:
1. Preserve factual meaning from the source draft.
2. Do NOT add new factual claims, numbers, dates, or entities not supported by source draft.
3. Improve clarity, specificity, flow, and usefulness.
4. Reduce generic filler and repetition.
5. Preserve markdown format and section structure.
6. Keep roughly similar coverage depth (do not collapse into a short summary).
7. Respect rewrite mode:
   - light: tighten wording and improve transitions with minimal structural changes
   - medium: rephrase and reorganize sections for clarity and usefulness
   - strong: substantial rewrite for clarity/specificity while keeping factual meaning

SOURCE DRAFT:
{article}

Output only the improved markdown article. No JSON, no explanations.
"""


def improve_article(
    *,
    stage3: Stage3Output,
    top_issues: list[str],
    rewrite_brief: list[str],
    mode: str,
    focus_dimensions: list[str] | None = None,
    model_name: str = Y2B_PRIMARY_MODEL,
    tone_guidance: str | None = None,
    llm_factory: Callable[..., Any] | None = None,
    anti_ai_enforcer: Callable[..., str] | None = None,
) -> dict[str, Any]:
    """Rewrite article draft to improve quality while preserving facts."""
    if mode not in {"light", "medium", "strong"}:
        raise ValueError(f"Unsupported rewrite mode: {mode}")

    llm = (llm_factory or get_vertex_llm)(
        temperature=0.2,
        max_tokens=Y2B_STAGE3_QUALITY_IMPROVEMENT_MAX_OUTPUT_TOKENS,
        model_name=model_name,
    )
    prompt = PromptTemplate(
        input_variables=[
            "mode",
            "article_type",
            "guideline",
            "focus_dimensions",
            "top_issues",
            "rewrite_brief",
            "article",
        ],
        template=ARTICLE_QUALITY_IMPROVEMENT_PROMPT,
    )
    full_prompt = prompt.format(
        mode=mode,
        article_type=stage3.article_type,
        guideline=stage3.guideline_used[:8000],
        focus_dimensions=", ".join(focus_dimensions or [])
        or "clarity, specificity, structure",
        top_issues="\n".join(f"- {item}" for item in top_issues[:3])
        or "- Improve overall quality.",
        rewrite_brief="\n".join(f"- {item}" for item in rewrite_brief[:5])
        or "- Improve clarity and usefulness while preserving facts.",
        article=stage3.final_article[:24000],
    )
    if tone_guidance:
        full_prompt = f"{full_prompt}\n\n{tone_guidance.strip()}"
    full_prompt = f"{full_prompt}\n\n{ANTI_AI_TELLS_FULL}"

    raw_response = llm.invoke(full_prompt)
    if not raw_response or not str(raw_response).strip():
        raise RuntimeError("Stage 3 quality improvement returned empty response")

    enforce = anti_ai_enforcer or enforce_anti_ai_tells_markdown
    improved_article = enforce(
        str(raw_response),
        repair=lambda repair_prompt: llm.invoke(repair_prompt),
        context="youtube2blog quality improvement",
    )
    first_response_text = str(raw_response)

    if articles_are_equivalent(improved_article, stage3.final_article):
        stronger_mode = "strong" if mode != "strong" else mode
        fallback_prompt = (
            full_prompt
            + "\n\nThe prior rewrite was too similar. Rewrite more decisively while "
            "preserving facts."
        )
        second_raw = llm.invoke(fallback_prompt)
        if second_raw and str(second_raw).strip():
            improved_article = enforce(
                str(second_raw),
                repair=lambda repair_prompt: llm.invoke(repair_prompt),
                context="youtube2blog quality fallback",
            )
            raw_response = second_raw
            mode = stronger_mode
            full_prompt = fallback_prompt

    original_word_count = len(tokenize_words(stage3.final_article))
    improved_word_count = len(tokenize_words(improved_article))
    min_allowed_words = max(120, int(original_word_count * 0.55))
    if improved_word_count < min_allowed_words:
        logger.warning(
            "Stage 3 quality improvement too short (%d < %d); keeping original draft",
            improved_word_count,
            min_allowed_words,
        )
        improved_article = stage3.final_article
        improved_word_count = original_word_count

    return {
        "mode": mode,
        "focus_dimensions": list(focus_dimensions or []),
        "improved_article": improved_article,
        "word_count_before": original_word_count,
        "word_count_after": improved_word_count,
        "debug_improve_prompt": full_prompt,
        "debug_improve_response": str(raw_response),
        "debug_improve_first_response": first_response_text,
    }
