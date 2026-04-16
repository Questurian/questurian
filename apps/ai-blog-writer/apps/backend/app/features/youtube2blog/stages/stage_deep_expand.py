"""
Stage: Deep Article Expansion & Listicle Rewrite.

Two separate pipelines share this module:

1. Deep Expand (non-listicle)
   Gap analysis → fills missing sections while preserving all existing content.

2. Listicle Rewrite
   User curates the item list (remove / rename / add / reorder).
   The article is completely rewritten around the new list.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.core import write_stage_result, write_status
from app.features.youtube2blog.config import Y2B_PRIMARY_MODEL
from utils import get_vertex_llm, parse_json_response

logger = logging.getLogger(__name__)

FEATURE_NAME = "youtube2blog_expand"

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

GAP_ANALYSIS_PROMPT = """You are an expert content analyst reviewing a finished article.

Your task: Identify what is MISSING to make this article more complete, useful, and authoritative for readers.

Examine the article for:
1. Background context or foundational knowledge readers likely need
2. Topics mentioned but not explored deeply enough
3. Practical "how to apply this" sections that are absent
4. External data, statistics, research, or references that would strengthen claims
5. Questions a reader would naturally have after finishing that go unanswered

Article title: {title}
Article type: {article_type}

Article content:
{article_content}

Return strict JSON only — no prose, no markdown fences:
{{
  "gaps": [
    {{
      "type": "background_context" | "deeper_dive" | "practical_application" | "external_context" | "unanswered_question",
      "topic": "the specific topic or question that is missing",
      "reason": "why adding this would make the article more complete",
      "suggested_section_title": "proposed heading for the new section"
    }}
  ],
  "expansion_plan": "2-3 sentence summary describing what will be added and how it strengthens the article"
}}"""

EXPANSION_PROMPT = """You are expanding an existing article by adding new content.

CRITICAL RULES — read carefully before writing:
1. PRESERVE every word of the existing article content exactly as written — do not rephrase, reorder, or remove anything
2. ADD new sections and subsections that integrate naturally with the existing structure
3. Match the existing article's voice, tone, and heading style
4. New content must be accurate, substantive, and genuinely useful — not filler
5. Insert new sections where they make logical sense in the flow (not always at the end)
6. Do not add a new top-level H1 title — keep the existing title if present

What to add (gap analysis results):
{gaps_json}

Expansion plan:
{expansion_plan}

Original article to expand:
{article_content}

Return ONLY the complete expanded article in Markdown. Do not include any commentary or explanation — just the full article text."""

LISTICLE_DETECT_PROMPT = """You are analyzing an article to determine if it is a listicle.

A listicle is an article structured around a ranked or unranked list of items — such as dishes, restaurants, hotels, places, products, tips, books, movies, etc.

Article title: {title}

Article content (first 6000 chars):
{article_content}

Return strict JSON only — no prose, no markdown fences:
{{
  "is_listicle": true or false,
  "list_type": "dishes" | "restaurants" | "hotels" | "places" | "products" | "tips" | "movies" | "books" | "other" | null,
  "list_topic": "short description of what the list is about, e.g. best dishes in Peru" or null,
  "detected_items": ["Item Name 1", "Item Name 2"]
}}

Rules:
- detected_items should contain only the name/title of each item, not descriptions (max 20 items)
- If not a listicle, return is_listicle: false and null for everything else
- detected_items must be an array even if empty"""

LISTICLE_REWRITE_PROMPT = """You are rewriting a listicle article with a new, curated set of items chosen by the editor.

This is a COMPLETE REWRITE. The editor has decided exactly which items to include and in what order.
Use the original article only as a reference for voice, tone, intro/outro style, and formatting.

Article topic: {title}
Article type: {article_type}

Original article (reference only — do NOT copy item sections verbatim):
{original_article}

New item list — write about these items IN THIS EXACT ORDER, no more, no less:
{items_list}

Instructions:
1. Write a complete, polished article with a section for each item in the list above
2. Each section should be thorough, useful, and match the depth of the original
3. Match the original article's voice, writing style, intro, and conclusion structure
4. Update the H1 title only if the item changes make it inaccurate — otherwise keep it
5. Do NOT include any items that are not in the list above
6. Do NOT change the order of items

Return ONLY the complete rewritten article in Markdown. No commentary, no explanation."""


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _invoke_json_llm(prompt: str, model_name: str = Y2B_PRIMARY_MODEL) -> dict[str, Any]:
    """Invoke LLM and parse JSON response with retries."""
    strict_prompt = (
        f"{prompt}\n\n"
        "CRITICAL OUTPUT RULE:\n"
        "Return ONLY one valid JSON object.\n"
        "No prose, no markdown, no code fences."
    )

    llm = get_vertex_llm(
        temperature=0.1,
        max_tokens=4096,
        model_name=model_name,
    )

    current_prompt = strict_prompt
    last_error = "Unknown parse failure"
    last_response = ""

    for attempt in range(1, 4):
        raw = str(llm.invoke(current_prompt)).strip()
        last_response = raw
        try:
            return parse_json_response(raw)
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            logger.warning("Deep expand JSON parse failed (attempt %d): %s", attempt, last_error)
            current_prompt = (
                "Your previous output was invalid JSON.\n"
                "Return ONLY one strict JSON object.\n"
                "No markdown fences, no commentary.\n\n"
                f"Previous invalid output:\n{raw[:4000]}"
            )

    raise RuntimeError(
        f"Failed to parse JSON after 3 attempts: {last_error}. Preview: {last_response[:240]}"
    )


def _invoke_text_llm(prompt: str, model_name: str = Y2B_PRIMARY_MODEL) -> str:
    """Invoke LLM and return plain text response."""
    llm = get_vertex_llm(
        temperature=0.2,
        max_tokens=16384,
        model_name=model_name,
    )
    return str(llm.invoke(prompt)).strip()


# ---------------------------------------------------------------------------
# Listicle detection
# ---------------------------------------------------------------------------

def detect_listicle(
    article: str,
    title: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, Any]:
    """Quickly detect whether the article is a listicle and extract its items."""
    prompt = (
        LISTICLE_DETECT_PROMPT
        .replace("{title}", title[:300])
        .replace("{article_content}", article[:6_000])
    )
    try:
        result = _invoke_json_llm(prompt, model_name=model_name)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Listicle detection failed, defaulting to non-listicle: %s", exc)
        return {"is_listicle": False, "list_type": None, "list_topic": None, "detected_items": []}

    is_listicle = bool(result.get("is_listicle", False))
    detected_items = result.get("detected_items")
    if not isinstance(detected_items, list):
        detected_items = []

    return {
        "is_listicle": is_listicle,
        "list_type": result.get("list_type"),
        "list_topic": result.get("list_topic"),
        "detected_items": [str(i) for i in detected_items[:20]],
    }


# ---------------------------------------------------------------------------
# Gap analysis + expansion (non-listicle path)
# ---------------------------------------------------------------------------

def analyze_article_gaps(
    article: str,
    article_type: str,
    title: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> dict[str, Any]:
    """Step 1: Identify what is missing from the article."""
    prompt = (
        GAP_ANALYSIS_PROMPT
        .replace("{title}", title[:300])
        .replace("{article_type}", article_type[:100])
        .replace("{article_content}", article[:20_000])
    )
    result = _invoke_json_llm(prompt, model_name=model_name)

    gaps = result.get("gaps")
    if not isinstance(gaps, list):
        gaps = []
    expansion_plan = str(result.get("expansion_plan", "")).strip()

    return {"gaps": gaps[:10], "expansion_plan": expansion_plan}


def expand_article_with_gaps(
    article: str,
    gaps: list[dict[str, Any]],
    expansion_plan: str,
    model_name: str = Y2B_PRIMARY_MODEL,
) -> str:
    """Step 2: Expand the article by filling identified gaps."""
    import json
    gaps_json = json.dumps(gaps, indent=2, ensure_ascii=False)
    prompt = (
        EXPANSION_PROMPT
        .replace("{gaps_json}", gaps_json[:3000])
        .replace("{expansion_plan}", expansion_plan[:500])
        .replace("{article_content}", article[:20_000])
    )
    return _invoke_text_llm(prompt, model_name=model_name)


# ---------------------------------------------------------------------------
# Listicle rewrite path
# ---------------------------------------------------------------------------

def rewrite_listicle_article(
    original_article: str,
    article_type: str,
    title: str,
    new_items: list[str],
    model_name: str = Y2B_PRIMARY_MODEL,
) -> str:
    """Rewrite the article from scratch around the editor-curated item list."""
    numbered = "\n".join(f"{i + 1}. {item}" for i, item in enumerate(new_items))
    prompt = (
        LISTICLE_REWRITE_PROMPT
        .replace("{title}", title[:300])
        .replace("{article_type}", article_type[:100])
        .replace("{original_article}", original_article[:15_000])
        .replace("{items_list}", numbered)
    )
    return _invoke_text_llm(prompt, model_name=model_name)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def run_deep_expand(
    expand_job_id: str,
    article: str,
    article_type: str,
    title: str,
    model_name: str = Y2B_PRIMARY_MODEL,
    rewrite_items: list[str] | None = None,
) -> None:
    """
    Orchestrate deep expansion or listicle rewrite.

    Runs in a background task. Progress polled via status endpoint.
    Results stored under expand_job_id in the stages table.

    If rewrite_items is provided the article is fully rewritten around those items
    (listicle path). Otherwise the standard gap-analysis + expansion path runs.
    """
    try:
        if rewrite_items:
            # ----------------------------------------------------------------
            # Listicle rewrite path
            # ----------------------------------------------------------------
            write_status(
                expand_job_id,
                {
                    "run_id": expand_job_id,
                    "stage": "rewriting",
                    "state": "running",
                    "updated_at": _now_iso(),
                    "error": None,
                },
                feature=FEATURE_NAME,
            )

            rewritten = rewrite_listicle_article(
                article, article_type, title, rewrite_items, model_name=model_name
            )

            write_stage_result(
                expand_job_id,
                "expand_result",
                {
                    "expanded_article": rewritten,
                    "gaps": [],
                    "expansion_plan": f"Rewritten around {len(rewrite_items)} curated items.",
                    "created_at": _now_iso(),
                },
            )

        else:
            # ----------------------------------------------------------------
            # Standard gap analysis + expansion path
            # ----------------------------------------------------------------
            write_status(
                expand_job_id,
                {
                    "run_id": expand_job_id,
                    "stage": "analyzing",
                    "state": "running",
                    "updated_at": _now_iso(),
                    "error": None,
                },
                feature=FEATURE_NAME,
            )

            analysis = analyze_article_gaps(article, article_type, title, model_name=model_name)
            gaps = analysis["gaps"]
            expansion_plan = analysis["expansion_plan"]

            write_stage_result(
                expand_job_id,
                "gap_analysis",
                {
                    "gaps": gaps,
                    "expansion_plan": expansion_plan,
                    "created_at": _now_iso(),
                },
            )

            write_status(
                expand_job_id,
                {
                    "run_id": expand_job_id,
                    "stage": "expanding",
                    "state": "running",
                    "updated_at": _now_iso(),
                    "error": None,
                },
                feature=FEATURE_NAME,
            )

            expanded_article = expand_article_with_gaps(
                article, gaps, expansion_plan, model_name=model_name
            )

            write_stage_result(
                expand_job_id,
                "expand_result",
                {
                    "expanded_article": expanded_article,
                    "gaps": gaps,
                    "expansion_plan": expansion_plan,
                    "created_at": _now_iso(),
                },
            )

        write_status(
            expand_job_id,
            {
                "run_id": expand_job_id,
                "stage": "completed",
                "state": "completed",
                "updated_at": _now_iso(),
                "error": None,
            },
            feature=FEATURE_NAME,
        )

    except Exception as exc:  # noqa: BLE001
        logger.error("Deep expand failed for %s: %s", expand_job_id, exc)
        write_status(
            expand_job_id,
            {
                "run_id": expand_job_id,
                "stage": "error",
                "state": "failed",
                "updated_at": _now_iso(),
                "error": str(exc),
            },
            feature=FEATURE_NAME,
        )
        raise
