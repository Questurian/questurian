from __future__ import annotations

import logging
from typing import Any

from app.shared.prompts import ANTI_AI_TELLS_FULL

from ..content.editorial_blocks import (
    _normalize_markdown_for_comparison,
    _sanitize_editorial_augmentation,
)
from ..dependencies import PipelineDependencies
from ..graph.state import Prompt2BlogGraphState
from ..observability import _append_stage_trace
from ..policies import evaluate_augmentation
from ..prompts.editorial import P2B_EDITORIAL_AUGMENTATION_PROMPT
from ..schemas import EDITORIAL_AUGMENTATION_SCHEMA
from ..support import _json

logger = logging.getLogger(__name__)


def run_augmentation_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_editorial_augmentation"
    run_id = state["run_id"]
    rewrite = state["rewrite"]
    guideline = state["guideline"]
    dependencies.recorder.start_stage(run_id, stage)

    raw_response = ""
    augmentation = _sanitize_editorial_augmentation(
        {},
        fallback_content=rewrite["improved_content"],
    )

    if state["enable_editorial_augmentation"]:
        prompt = P2B_EDITORIAL_AUGMENTATION_PROMPT.format(
            article_title=rewrite["improved_title"],
            article_content=rewrite["improved_content"],
            article_type_json=_json(
                {
                    "id": guideline["id"],
                    "name": guideline["name"],
                    "definition": guideline["definition"],
                }
            ),
            narrative_focus=state["narrative_focus"],
            style_directive=state["style_directive"],
        )
        prompt = f"{prompt}\n\n{ANTI_AI_TELLS_FULL}"
        try:
            parsed, raw_response = dependencies.llm.invoke_json(
                prompt=prompt,
                max_tokens=6144,
                temperature=0.05,
                model_name=state["writing_model"],
                schema=EDITORIAL_AUGMENTATION_SCHEMA,
            )
            if isinstance(parsed.get("augmented_content"), str):
                parsed["augmented_content"] = dependencies.llm.enforce_anti_ai(
                    parsed["augmented_content"],
                    model_name=state["writing_model"],
                    max_tokens=6144,
                    context="prompt2blog editorial augmentation",
                )
            augmentation = _sanitize_editorial_augmentation(
                parsed,
                fallback_content=rewrite["improved_content"],
            )
            _append_stage_trace(
                state["trace"],
                state["include_debug"],
                stage=stage,
                model_name=state["writing_model"],
                input_payload={
                    "article_title": rewrite["improved_title"],
                    "article_type": {
                        "id": guideline["id"],
                        "name": guideline["name"],
                    },
                    "narrative_focus": state["narrative_focus"],
                    "style_directive": state["style_directive"],
                },
                prompt=prompt,
                raw_response=raw_response,
                parsed=parsed,
                output=augmentation,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Prompt2Blog editorial augmentation failed: %s", exc)
            _append_stage_trace(
                state["trace"],
                state["include_debug"],
                stage=stage,
                model_name=state["writing_model"],
                input_payload={
                    "article_title": rewrite["improved_title"],
                    "article_type": {
                        "id": guideline["id"],
                        "name": guideline["name"],
                    },
                    "narrative_focus": state["narrative_focus"],
                    "style_directive": state["style_directive"],
                },
                prompt=prompt,
                error=str(exc),
            )
    else:
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=state["model_name"],
            output={
                "skipped": True,
                "reason": "Editorial augmentation disabled for this run.",
            },
            skipped=True,
        )

    # Augmentation is additive by contract. Its output used to replace the
    # draft unconditionally, so a pass that dropped sections or truncated the
    # article shipped unnoticed.
    accepted, augmentation_diagnostics = evaluate_augmentation(
        original_content=rewrite["improved_content"],
        augmented_content=augmentation["augmented_content"],
    )
    rolled_back = augmentation["augmentation_applied"] and not accepted
    if rolled_back:
        logger.warning(
            "Prompt2Blog editorial augmentation rolled back: %s",
            augmentation_diagnostics,
        )
        augmentation = _sanitize_editorial_augmentation(
            {},
            fallback_content=rewrite["improved_content"],
        )
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=state["writing_model"],
            output={
                "rolled_back": True,
                "reason": "Augmented content regressed against the draft.",
                "checks": augmentation_diagnostics,
            },
        )

    # `augmentation_applied` requires components to have been added. Content
    # can change without them -- augmentation is a full-article generation call
    # and returns rewritten prose either way -- so what the downstream re-check
    # keys off is the text itself, not the component list.
    content_changed = _normalize_markdown_for_comparison(
        augmentation["augmented_content"]
    ) != _normalize_markdown_for_comparison(rewrite["improved_content"])

    rewrite = {**rewrite, "improved_content": augmentation["augmented_content"]}
    dependencies.recorder.record_stage(
        run_id,
        stage,
        {
            "editorial_augmentation": augmentation,
            "raw_response": raw_response,
            "skipped": not state["enable_editorial_augmentation"],
            "rolled_back": rolled_back,
            "content_changed": content_changed,
            "retention_checks": augmentation_diagnostics,
        },
    )
    return {
        "current_stage": stage,
        "rewrite": rewrite,
        "editorial_augmentation": augmentation,
        "editorial_augmentation_raw_response": raw_response,
        "augmentation_rolled_back": rolled_back,
        "content_changed_by_augmentation": content_changed,
    }
