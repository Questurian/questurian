"""Detection and complete rewrite pipeline for listicle articles."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from app.features.youtube2blog.config import Y2B_DEEP_EXPAND_MAX_OUTPUT_TOKENS
from app.shared.prompts import ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown

from .deep_expand_llm import GetLlm
from .deep_expand_prompts import LISTICLE_DETECT_PROMPT, LISTICLE_REWRITE_PROMPT

InvokeJson = Callable[[str, str], dict[str, Any]]


def detect_listicle(
    article: str,
    title: str,
    model_name: str,
    *,
    invoke_json: InvokeJson,
    logger: logging.Logger,
) -> dict[str, Any]:
    """Detect whether an article is list-driven and extract its item names."""
    prompt = (
        LISTICLE_DETECT_PROMPT
        .replace("{title}", title[:300])
        .replace("{article_content}", article[:6_000])
    )
    try:
        result = invoke_json(prompt, model_name)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Listicle detection failed, defaulting to non-listicle: %s",
            exc,
        )
        return {
            "is_listicle": False,
            "list_type": None,
            "list_topic": None,
            "detected_items": [],
        }

    detected_items = result.get("detected_items")
    if not isinstance(detected_items, list):
        detected_items = []
    return {
        "is_listicle": bool(result.get("is_listicle", False)),
        "list_type": result.get("list_type"),
        "list_topic": result.get("list_topic"),
        "detected_items": [str(item) for item in detected_items[:20]],
    }


def rewrite_listicle_article(
    original_article: str,
    article_type: str,
    title: str,
    new_items: list[str],
    model_name: str,
    *,
    get_llm: GetLlm,
) -> str:
    """Rewrite an article around the editor's exact ordered item list."""
    numbered = "\n".join(
        f"{index + 1}. {item}" for index, item in enumerate(new_items)
    )
    prompt = (
        LISTICLE_REWRITE_PROMPT
        .replace("{title}", title[:300])
        .replace("{article_type}", article_type[:100])
        .replace("{original_article}", original_article[:15_000])
        .replace("{items_list}", numbered)
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
        context="youtube2blog listicle rewrite",
    )


def run_listicle_rewrite(
    job_id: str,
    article: str,
    article_type: str,
    title: str,
    rewrite_items: list[str],
    model_name: str,
    *,
    feature_name: str,
    now_iso: Callable[[], str],
    write_status: Callable[..., Any],
    write_stage_result: Callable[..., Any],
    rewrite: Callable[..., str],
) -> None:
    """Persist and run the complete listicle rewrite branch."""
    write_status(
        job_id,
        {
            "run_id": job_id,
            "stage": "rewriting",
            "state": "running",
            "updated_at": now_iso(),
            "error": None,
        },
        feature=feature_name,
    )
    rewritten = rewrite(
        article,
        article_type,
        title,
        rewrite_items,
        model_name=model_name,
    )
    write_stage_result(
        job_id,
        "expand_result",
        {
            "expanded_article": rewritten,
            "gaps": [],
            "expansion_plan": (
                f"Rewritten around {len(rewrite_items)} curated items."
            ),
            "created_at": now_iso(),
        },
    )
