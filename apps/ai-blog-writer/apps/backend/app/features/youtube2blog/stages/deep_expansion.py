"""Gap-analysis and additive expansion pipeline for non-listicle articles."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from app.features.youtube2blog.config import Y2B_DEEP_EXPAND_MAX_OUTPUT_TOKENS
from app.shared.prompts import ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown

from .deep_expand_llm import GetLlm
from .deep_expand_prompts import EXPANSION_PROMPT, GAP_ANALYSIS_PROMPT

InvokeJson = Callable[[str, str], dict[str, Any]]


def analyze_article_gaps(
    article: str,
    article_type: str,
    title: str,
    model_name: str,
    *,
    invoke_json: InvokeJson,
) -> dict[str, Any]:
    """Identify useful material missing from an otherwise finished article."""
    prompt = (
        GAP_ANALYSIS_PROMPT
        .replace("{title}", title[:300])
        .replace("{article_type}", article_type[:100])
        .replace("{article_content}", article[:20_000])
    )
    result = invoke_json(prompt, model_name)
    gaps = result.get("gaps")
    if not isinstance(gaps, list):
        gaps = []

    return {
        "gaps": gaps[:10],
        "expansion_plan": str(result.get("expansion_plan", "")).strip(),
    }


def expand_article_with_gaps(
    article: str,
    gaps: list[dict[str, Any]],
    expansion_plan: str,
    model_name: str,
    *,
    get_llm: GetLlm,
) -> str:
    """Add sections for the analyzed gaps while retaining existing material."""
    gaps_json = json.dumps(gaps, indent=2, ensure_ascii=False)
    prompt = (
        EXPANSION_PROMPT
        .replace("{gaps_json}", gaps_json[:3000])
        .replace("{expansion_plan}", expansion_plan[:500])
        .replace("{article_content}", article[:20_000])
    )
    prompt = f"{prompt}\n\n{ANTI_AI_TELLS_FULL}"
    llm = get_llm(
        temperature=0.2,
        max_tokens=Y2B_DEEP_EXPAND_MAX_OUTPUT_TOKENS,
        model_name=model_name,
    )
    raw = str(llm.invoke(prompt)).strip()
    return enforce_anti_ai_tells_markdown(
        raw,
        repair=lambda repair_prompt: llm.invoke(repair_prompt),
        context="youtube2blog deep expand",
    )


def run_deep_expansion(
    job_id: str,
    article: str,
    article_type: str,
    title: str,
    model_name: str,
    *,
    feature_name: str,
    now_iso: Callable[[], str],
    write_status: Callable[..., Any],
    write_stage_result: Callable[..., Any],
    analyze: Callable[..., dict[str, Any]],
    expand: Callable[..., str],
) -> None:
    """Persist and run the gap-analysis followed by additive expansion."""
    write_status(
        job_id,
        {
            "run_id": job_id,
            "stage": "analyzing",
            "state": "running",
            "updated_at": now_iso(),
            "error": None,
        },
        feature=feature_name,
    )

    analysis = analyze(article, article_type, title, model_name=model_name)
    gaps = analysis["gaps"]
    expansion_plan = analysis["expansion_plan"]
    write_stage_result(
        job_id,
        "gap_analysis",
        {
            "gaps": gaps,
            "expansion_plan": expansion_plan,
            "created_at": now_iso(),
        },
    )

    write_status(
        job_id,
        {
            "run_id": job_id,
            "stage": "expanding",
            "state": "running",
            "updated_at": now_iso(),
            "error": None,
        },
        feature=feature_name,
    )
    expanded_article = expand(
        article,
        gaps,
        expansion_plan,
        model_name=model_name,
    )
    write_stage_result(
        job_id,
        "expand_result",
        {
            "expanded_article": expanded_article,
            "gaps": gaps,
            "expansion_plan": expansion_plan,
            "created_at": now_iso(),
        },
    )
