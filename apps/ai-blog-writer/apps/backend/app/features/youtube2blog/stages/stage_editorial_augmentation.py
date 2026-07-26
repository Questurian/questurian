"""Thin orchestration facade for the Editorial Augmentation Stage."""

from __future__ import annotations

import logging

from app.features.youtube2blog.config import Y2B_EDITORIAL_AUGMENTATION_MODEL
from app.features.youtube2blog.content.editorial_blocks import (
    EDITORIAL_COMPONENT_LABELS,
)
from shared import Stage3Output, StageEditorialAugmentationOutput

from .editorial_augmentation_llm import (
    enforce_editorial_anti_ai_tells,
    invoke_json_llm,
)
from .editorial_augmentation_prompts import (
    Y2B_EDITORIAL_AUGMENTATION_PROMPT,
    build_editorial_augmentation_prompt,
)
from .editorial_augmentation_validation import sanitize_editorial_augmentation

logger = logging.getLogger(__name__)

DEFAULT_MODEL = Y2B_EDITORIAL_AUGMENTATION_MODEL

# Keep the private seam available for existing tests and callers that patch the
# stage transport without invoking a provider.
_invoke_json_llm = invoke_json_llm

__all__ = [
    "DEFAULT_MODEL",
    "EDITORIAL_COMPONENT_LABELS",
    "Y2B_EDITORIAL_AUGMENTATION_PROMPT",
    "stage_editorial_augmentation",
]


def stage_editorial_augmentation(
    stage3: Stage3Output,
    *,
    fail_fast: bool = False,
    model_name: str = DEFAULT_MODEL,
    writing_model: str | None = None,
    tone_guidance: str | None = None,
) -> StageEditorialAugmentationOutput:
    """Apply optional editorial augmentation to stage 3 content."""
    prompt = build_editorial_augmentation_prompt(
        article_title=stage3.title,
        article_content=stage3.final_article,
        article_type=stage3.article_type,
        tone_guidance=tone_guidance,
    )
    fallback = sanitize_editorial_augmentation(
        {},
        fallback_content=stage3.final_article,
    )

    # Pinned to the Claude editorial model regardless of the caller-supplied
    # base model (the graph runner passes the run's Gemini model here).
    _ = model_name
    editorial_model = writing_model or Y2B_EDITORIAL_AUGMENTATION_MODEL
    try:
        parsed, raw_response = _invoke_json_llm(
            prompt=prompt,
            model_name=editorial_model,
        )
        if isinstance(parsed.get("augmented_content"), str):
            parsed["augmented_content"] = enforce_editorial_anti_ai_tells(
                parsed["augmented_content"],
                model_name=editorial_model,
            )
        editorial = sanitize_editorial_augmentation(
            parsed,
            fallback_content=stage3.final_article,
        )
        return StageEditorialAugmentationOutput(
            video_id=stage3.video_id,
            title=stage3.title,
            article_type=stage3.article_type,
            augmented_content=editorial["augmented_content"],
            components_added=editorial["components_added"],
            diagnostic=editorial["diagnostic"],
            augmentation_summary=editorial["augmentation_summary"],
            augmentation_applied=editorial["augmentation_applied"],
            debug_prompt=prompt,
            debug_raw_response=raw_response,
            error=None,
        )
    except Exception as exc:  # noqa: BLE001
        if fail_fast:
            raise RuntimeError(
                f"YouTube2Blog editorial augmentation failed: {exc}"
            ) from exc
        logger.warning("YouTube2Blog editorial augmentation failed: %s", exc)
        return StageEditorialAugmentationOutput(
            video_id=stage3.video_id,
            title=stage3.title,
            article_type=stage3.article_type,
            augmented_content=fallback["augmented_content"],
            components_added=fallback["components_added"],
            diagnostic=fallback["diagnostic"],
            augmentation_summary=fallback["augmentation_summary"],
            augmentation_applied=False,
            debug_prompt=prompt,
            debug_raw_response="",
            error=str(exc),
        )
