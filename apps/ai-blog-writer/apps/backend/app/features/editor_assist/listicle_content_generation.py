"""Batch orchestration for Listicle Content Generation."""

from __future__ import annotations

import logging

from fastapi import HTTPException

from app.shared.model_calls import resolve

from .dependencies import EditorAssistDependencies
from .listicle_content_batch import prepare_listicle_batch
from .listicle_content_contracts import (
    GenerateListicleContentRequest,
    GenerateListicleContentResponse,
    GenerateListicleTargetResponse,
)
from .listicle_content_target import generate_listicle_target

logger = logging.getLogger(__name__)

JOB = "editor.listicle_blurb"


def generate_listicle_content(
    request: GenerateListicleContentRequest,
    dependencies: EditorAssistDependencies,
) -> GenerateListicleContentResponse:
    article_title = request.article_title.strip()
    article_location = request.location_label.strip()
    article_context = request.article_context.strip() if request.article_context else ""
    custom_instruction = (
        request.custom_instruction.strip() if request.custom_instruction else ""
    )

    if not article_title:
        raise HTTPException(status_code=400, detail="article_title is required")
    if not article_location:
        raise HTTPException(status_code=400, detail="location_label is required")
    if not request.targets:
        raise HTTPException(status_code=400, detail="At least one target is required")

    # An operator's own choice, or None so the gateway decides.
    chosen_model = (request.model_name or "").strip() or None
    model_used = resolve(JOB, chosen_model)
    prepared = prepare_listicle_batch(
        request.targets,
        article_location=article_location,
        skip_existing=request.skip_existing,
    )
    results: dict[str, GenerateListicleTargetResponse] = {}

    for request_target in request.targets:
        current_content = (request_target.current_content or "").strip()
        if request.skip_existing and current_content:
            results[request_target.target_id] = GenerateListicleTargetResponse(
                target_id=request_target.target_id,
                status="skipped",
                model_used=model_used,
                markdown=current_content,
            )
            continue

        try:
            results[request_target.target_id] = generate_listicle_target(
                article_title=article_title,
                article_type=request.article_type,
                article_location=article_location,
                article_context=article_context,
                request_target=request_target,
                custom_instruction=custom_instruction,
                model_name=model_used,
                cf_result=prepared.critical_fields_by_target_id[
                    request_target.target_id
                ],
                research_profile=prepared.research_by_target_id.get(
                    request_target.target_id
                ),
                research_profile_trace=prepared.research_trace_by_target_id.get(
                    request_target.target_id
                ),
                list_tone=request.list_tone,
                requested_angle=request_target.angle,
                effective_angle=prepared.effective_angle_by_target_id.get(
                    request_target.target_id
                ),
                dependencies=dependencies,
            )
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Listicle generation failed for target %s: %s",
                request_target.target_id,
                exc,
            )
            results[request_target.target_id] = GenerateListicleTargetResponse(
                target_id=request_target.target_id,
                status="error",
                model_used=model_used,
                error_message=str(exc),
            )

    return GenerateListicleContentResponse(results=results)


__all__ = ["generate_listicle_content"]
