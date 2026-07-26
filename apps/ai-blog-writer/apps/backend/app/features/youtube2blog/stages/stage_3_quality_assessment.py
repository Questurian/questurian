"""LLM-backed Stage 3 article quality assessment."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from langchain_core.prompts import PromptTemplate

from app.features.youtube2blog.config import Y2B_PRIMARY_MODEL
from app.features.youtube2blog.quality.article_assessment import (
    assess_article_heuristically,
    normalize_llm_assessment,
)
from shared import Stage3Output
from utils import get_vertex_llm, parse_json_response

logger = logging.getLogger(__name__)

ARTICLE_QUALITY_ASSESSMENT_PROMPT = """You are evaluating article readiness for publication.

Task:
- Evaluate whether the draft is high quality for its article type and guideline.
- Do NOT classify tone or label it as "AI sounding."
- Focus on practical quality signals that impact reader value.

ARTICLE TYPE:
{article_type}

GUIDELINE:
{guideline}

DRAFT ARTICLE (MARKDOWN):
{article}

Return strict JSON only:
{{
  "dimension_scores": {{
    "clarity": <0-10>,
    "structure_coherence": <0-10>,
    "specificity": <0-10>,
    "usefulness_actionability": <0-10>,
    "repetition_control": <0-10>,
    "audience_fit": <0-10>
  }},
  "overall_quality_score": <0-10>,
  "top_issues": ["<max 3 concrete issues>"],
  "rewrite_brief": ["<3-5 specific rewrite instructions>"]
}}

Scoring intent:
- clarity: easy to understand without ambiguity
- structure_coherence: logical flow and section sequencing
- specificity: concrete details/examples vs generic filler
- usefulness_actionability: reader can do something with it
- repetition_control: low redundancy and low fluff
- audience_fit: aligns with intent of article type + guideline
"""


def assess_article_quality(
    *,
    stage3: Stage3Output,
    model_name: str = Y2B_PRIMARY_MODEL,
    llm_factory: Callable[..., Any] | None = None,
    json_parser: Callable[[str], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Assess Stage 3 article quality against publication-readiness dimensions."""
    llm = (llm_factory or get_vertex_llm)(
        temperature=0.05,
        max_tokens=2048,
        model_name=model_name,
    )
    prompt = PromptTemplate(
        input_variables=["article_type", "guideline", "article"],
        template=ARTICLE_QUALITY_ASSESSMENT_PROMPT,
    )
    full_prompt = prompt.format(
        article_type=stage3.article_type,
        guideline=stage3.guideline_used[:8000],
        article=stage3.final_article[:20000],
    )

    try:
        raw_response = llm.invoke(full_prompt)
        if not raw_response or not str(raw_response).strip():
            raise RuntimeError("Quality assessment returned empty response")
        parsed = (json_parser or parse_json_response)(str(raw_response))
        assessment = normalize_llm_assessment(parsed)
        return {
            **assessment,
            "debug_quality_prompt": full_prompt,
            "debug_quality_response": str(raw_response),
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("Stage 3 quality assessment fallback triggered: %s", exc)
        heuristic = assess_article_heuristically(stage3.final_article)
        heuristic["debug_quality_prompt"] = full_prompt
        heuristic["debug_quality_response"] = ""
        heuristic["error"] = str(exc)
        return heuristic
