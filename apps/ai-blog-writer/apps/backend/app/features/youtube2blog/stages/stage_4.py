"""
Stage 4/5: Article title generation and quality evaluation helpers.

This module now supports:
1. Primary title generation
2. Retry title generation with quality feedback
3. Deterministic title quality scoring for graph gates
"""

from __future__ import annotations

import logging
import re
from typing import Any

from langchain_core.prompts import PromptTemplate

from app.core import get_article_type_by_name
from app.features.youtube2blog.config import (
    Y2B_PRIMARY_MODEL,
    Y2B_STAGE5_MAX_TITLE_CHARS,
    Y2B_STAGE5_MIN_TITLE_CHARS,
)
from shared import Stage3Output, Stage4Output
from utils import get_vertex_llm

logger = logging.getLogger(__name__)

TITLE_GENERATION_PROMPT = """You are an expert content strategist and headline writer. Your task is to create a compelling article title that accurately represents the content while following specific editorial guidelines.

## Your Task
Generate a single, optimized title for the article provided below. The title must:
1. Accurately reflects the article's content
2. Fully complies with the provided title guideline
3. Is engaging and encourages readership
4. Is clear, specific, and non-generic

## Original Title (Baseline)
{original_title}

Use this original title as a baseline and starting point. Preserve the core subject matter and key terms from the original title where appropriate, while refining it to comply with the title guideline and better represent the article content.

## Article Content
{article}

## Title Guideline
{guideline}

## Instructions
- Use the original title as a baseline - preserve its core subject and key terminology where relevant
- Read the article carefully to understand its core message and key takeaways
- Use the guideline as the primary constraint when crafting the title
- Do not infer, reinterpret, or add rules beyond what the guideline explicitly states
- Resolve any ambiguity by favoring strict compliance over creativity
- Do not prioritize style, SEO, or creativity unless the guideline requires it


## Output Rules (Strict)
- Output exactly ONE title
- No explanations, reasoning, alternatives, or formatting
- No quotation marks
- Format the title in title case, capitalizing the main words
- Please ensure the title is complete and fully formed
- The title must be fully formed and not cut off. Make sure the response includes the entire title without any truncation.
- The title should accurately reflect the key points of the article and avoid any hallucinations or inaccuracies.
"""

TITLE_RETRY_FEEDBACK_SUFFIX = """

Previous attempt feedback:
{feedback}

Rewrite the title to satisfy this feedback while still following all original rules.
Return only one final title.
"""


def _retrieve_title_guideline(article_type: str) -> str:
    """Fetch title_guideline from article_types table."""
    article_type_data = get_article_type_by_name(article_type)
    if not article_type_data:
        logger.warning("No article type found for: %s", article_type)
        return ""
    return article_type_data.get("title_guideline", "") or ""


def _sanitize_title(raw_text: str) -> str:
    generated_title = raw_text.strip()
    generated_title = generated_title.strip("\"'")
    generated_title = generated_title.lstrip("#").strip()
    generated_title = re.sub(r"\s+", " ", generated_title).strip()
    return generated_title


def _title_word_count(title: str) -> int:
    words = [word for word in re.split(r"\s+", title.strip()) if word]
    return len(words)


def _title_guideline_keywords(guideline: str) -> list[str]:
    candidates = re.findall(r"[A-Za-z][A-Za-z\-]{3,}", guideline.lower())
    deduped: list[str] = []
    for token in candidates:
        if token not in deduped:
            deduped.append(token)
    return deduped[:20]


def _article_terms(article: str) -> set[str]:
    tokens = re.findall(r"[A-Za-z][A-Za-z\-]{3,}", article.lower())
    return set(tokens)


def stage_5_evaluate_title_quality(
    *,
    title: str,
    article: str,
    guideline: str,
    baseline_title: str,
) -> dict[str, Any]:
    """
    Deterministic title-quality score used by the graph gate.

    Returns:
      {
        "score": float,
        "checks": {...},
        "feedback": "string",
      }
    """
    clean_title = title.strip()
    title_len = len(clean_title)
    word_count = _title_word_count(clean_title)

    checks: dict[str, bool] = {
        "length_range": Y2B_STAGE5_MIN_TITLE_CHARS <= title_len <= Y2B_STAGE5_MAX_TITLE_CHARS,
        "word_count_range": 6 <= word_count <= 16,
        "has_letters": bool(re.search(r"[A-Za-z]", clean_title)),
        "no_markup": "#" not in clean_title and "`" not in clean_title and "\n" not in clean_title,
        "not_all_caps": clean_title != clean_title.upper(),
        "not_question_spam": clean_title.count("?") <= 1,
    }

    baseline_tokens = set(re.findall(r"[A-Za-z][A-Za-z\-]{3,}", baseline_title.lower()))
    title_tokens = set(re.findall(r"[A-Za-z][A-Za-z\-]{3,}", clean_title.lower()))
    overlap_baseline = bool(title_tokens.intersection(baseline_tokens))
    checks["preserves_subject_terms"] = overlap_baseline

    guideline_tokens = _title_guideline_keywords(guideline)
    guideline_overlap = bool(title_tokens.intersection(set(guideline_tokens)))
    checks["aligns_with_guideline_terms"] = guideline_overlap or not guideline_tokens

    article_token_set = _article_terms(article)
    article_overlap = len(title_tokens.intersection(article_token_set)) >= 2
    checks["grounded_in_article_terms"] = article_overlap

    weights = {
        "length_range": 2.5,
        "word_count_range": 1.5,
        "has_letters": 0.5,
        "no_markup": 1.0,
        "not_all_caps": 0.5,
        "not_question_spam": 0.5,
        "preserves_subject_terms": 1.5,
        "aligns_with_guideline_terms": 1.0,
        "grounded_in_article_terms": 1.0,
    }
    weighted_total = sum(weights.values())
    weighted_score = sum(weight for key, weight in weights.items() if checks[key])
    score = round((weighted_score / weighted_total) * 10.0, 2)

    failures = [name for name, passed in checks.items() if not passed]
    if failures:
        feedback = "Improve title quality by fixing: " + ", ".join(failures) + "."
    else:
        feedback = "Title quality checks passed."

    return {
        "score": score,
        "checks": checks,
        "feedback": feedback,
        "metrics": {
            "title_length": title_len,
            "word_count": word_count,
        },
    }


def _generate_title_impl(
    *,
    stage3: Stage3Output,
    mode: str,
    retry_feedback: str | None = None,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> Stage4Output:
    if mode not in {"primary", "retry"}:
        raise ValueError(f"Unsupported title generation mode: {mode}")

    logger.info("=" * 60)
    logger.info("STAGE 4/5: Generating article title (%s mode)", mode)
    logger.info("=" * 60)
    logger.info("  Video: %s", stage3.title)
    logger.info("  Article Type: %s", stage3.article_type)
    logger.info("  Article length: %d chars", len(stage3.final_article))

    llm = get_vertex_llm(
        temperature=0.1,
        max_tokens=1024,
        model_name=model_name,
    )

    logger.info("  Step 1: Retrieving title guideline...")
    title_guideline = _retrieve_title_guideline(stage3.article_type)
    if not title_guideline:
        logger.warning("  No title guideline found for article type: %s", stage3.article_type)
        title_guideline = (
            "Create a clear, descriptive title that accurately reflects the article content."
        )

    prompt_template = TITLE_GENERATION_PROMPT
    input_variables = ["original_title", "article", "guideline"]
    if mode == "retry":
        prompt_template += TITLE_RETRY_FEEDBACK_SUFFIX
        input_variables.append("feedback")

    prompt = PromptTemplate(
        input_variables=input_variables,
        template=prompt_template,
    )
    prompt_kwargs = {
        "original_title": stage3.title,
        "article": stage3.final_article,
        "guideline": title_guideline,
    }
    if mode == "retry":
        prompt_kwargs["feedback"] = retry_feedback or "No additional feedback."
    full_prompt = prompt.format(**prompt_kwargs)
    logger.info("  Title generation prompt length: %d chars", len(full_prompt))

    result = llm.invoke(full_prompt)
    logger.info("  Title generation response length: %d chars", len(result) if result else 0)
    if not result or not result.strip():
        raise RuntimeError("Title generation failed: LLM returned empty response")

    generated_title = _sanitize_title(result)
    logger.info("  Generated title: %s", generated_title)

    return Stage4Output(
        video_id=stage3.video_id,
        title=generated_title,
        content=stage3.final_article,
        article_type=stage3.article_type,
        title_guideline_used=title_guideline,
        debug_prompt=full_prompt,
        debug_raw_response=result,
    )


def stage_4_generate_title(stage3: Stage3Output, *, model_name: str = Y2B_PRIMARY_MODEL) -> Stage4Output:
    """Primary title generation pass."""
    return _generate_title_impl(stage3=stage3, mode="primary", model_name=model_name)


def stage_5_generate_title_retry(
    stage3: Stage3Output,
    *,
    feedback: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> Stage4Output:
    """Retry title generation with explicit quality feedback."""
    return _generate_title_impl(
        stage3=stage3,
        mode="retry",
        retry_feedback=feedback,
        model_name=model_name,
    )
