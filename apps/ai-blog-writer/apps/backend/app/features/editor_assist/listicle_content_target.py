"""Composition adapter for one Listicle Content Generation target."""

from __future__ import annotations

from fastapi import HTTPException

from .angle_assignment import ListicleAngle as AssignmentAngle
from .blurb_composer import (
    ListicleCompositionDeps,
    ListicleCompositionResult,
    ListicleCompositionSettings,
    ListicleCompositionStep,
    ListicleCompositionTarget,
    ListicleCompositionWriterError,
    compose_listicle_target,
)
from .contracts import ListTone
from .critical_fields import CriticalFieldsResult
from .dependencies import EditorAssistDependencies
from .listicle_content_contracts import (
    GenerateListicleTargetRequest,
    GenerateListicleTargetResponse,
    StepEvent,
)
from .listicle_writer_contracts import ListicleArticleType
from .research_profile import ResearchProfile, ResearchProfileTrace
from .writer_brief import run_writer_brief


def to_composition_target(
    request_target: GenerateListicleTargetRequest,
) -> ListicleCompositionTarget:
    return ListicleCompositionTarget(
        target_id=request_target.target_id,
        field_type=request_target.field_type,
        category=request_target.category,
        display_name=request_target.display_name,
        research_subject=request_target.research_subject,
        location_label=request_target.location_label,
        current_content=request_target.current_content or "",
        supporting_context=request_target.supporting_context,
    )


def to_step_event(step: ListicleCompositionStep) -> StepEvent:
    return StepEvent(
        name=step.name,
        status=step.status,
        prompt=step.prompt,
        output=step.output,
        model=step.model,
        details=step.details,
        duration_ms=step.duration_ms,
    )


def to_target_response(
    result: ListicleCompositionResult,
) -> GenerateListicleTargetResponse:
    return GenerateListicleTargetResponse(
        target_id=result.target_id,
        status=result.status,
        markdown=result.markdown,
        model_used=result.model_used,
        source_urls=result.source_urls,
        validation_errors=result.validation_errors,
        error_message=result.error_message,
        low_confidence=result.low_confidence,
        warnings=result.warnings,
        requested_angle=result.requested_angle,
        effective_angle=result.effective_angle,
        steps=[to_step_event(step) for step in result.steps],
    )


def generate_listicle_target(
    *,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    article_context: str,
    request_target: GenerateListicleTargetRequest,
    custom_instruction: str,
    model_name: str,
    cf_result: CriticalFieldsResult,
    research_profile: ResearchProfile | None,
    research_profile_trace: ResearchProfileTrace | None,
    dependencies: EditorAssistDependencies,
    list_tone: ListTone | None = None,
    requested_angle: AssignmentAngle | None = None,
    effective_angle: AssignmentAngle | None = None,
) -> GenerateListicleTargetResponse:
    settings = ListicleCompositionSettings(
        article_title=article_title,
        article_type=article_type,
        article_location=article_location,
        article_context=article_context,
        custom_instruction=custom_instruction,
        model_name=model_name,
        list_tone=list_tone,
        requested_angle=requested_angle,
        effective_angle=effective_angle,
    )
    try:
        result = compose_listicle_target(
            target=to_composition_target(request_target),
            settings=settings,
            cf_result=cf_result,
            research_profile=research_profile,
            research_profile_trace=research_profile_trace,
            deps=ListicleCompositionDeps(
                invoke_writer=dependencies.invoke_writer,
                run_writer_brief=run_writer_brief,
            ),
        )
    except ListicleCompositionWriterError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return to_target_response(result)


__all__ = [
    "generate_listicle_target",
    "to_composition_target",
    "to_step_event",
    "to_target_response",
]
