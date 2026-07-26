"""Listicle Content Generation HTTP contract and batch orchestration."""

import logging
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .angle_assignment import (
    ANTI_AI_PROMPT_CATEGORIES,
    ListicleAngle as AssignmentAngle,
)
from .blurb_composer import (
    ListicleCompositionDeps,
    ListicleCompositionResult,
    ListicleCompositionSettings,
    ListicleCompositionStep,
    ListicleCompositionTarget,
    ListicleCompositionWriterError,
    compose_listicle_target,
)
from .contracts import (
    DEFAULT_MODEL,
    MAX_ARTICLE_CONTEXT_CHARS,
    MAX_ARTICLE_TITLE_CHARS,
    MAX_BLOCK_CHARS,
    MAX_PROMPT_CHARS,
    ListTone,
)
from .critical_fields import CriticalFieldsResult, evaluate_critical_fields
from .dependencies import EditorAssistDependencies, get_editor_assist_dependencies
from .listicle_prompt_policy import (
    LIST_TONE_GUIDANCE,
    LISTICLE_ANGLE_GUIDANCE,
)
from .listicle_writer_contracts import (
    ListicleArticleType,
    ListicleCategory,
)
from .research_profile import (
    ResearchProfile,
    ResearchProfileRequest,
    ResearchProfileTrace,
    run_research_profiles_concurrently,
)
from .writer_brief import run_writer_brief

router = APIRouter()
logger = logging.getLogger(__name__)

PayloadCollectionSlug = Literal[
    "dining", "accommodations", "attractions", "nightlife", "key-locations"
]
ListicleAngleRequest = Literal[
    # Dining
    "signature-dish",
    "atmosphere",
    "founders-backstory",
    "insider-tip",
    "best-for",
    "whats-different",
    # Accommodations (ADR 0011)
    "location-and-setting",
    "view-and-vista",
    "design-and-aesthetic",
    "signature-amenity",
    "food-and-beverage",
    "trip-fit",
    "property-backstory",
    "booking-tip",
    # Attractions
    "signature-feature",
    "setting",
    "history-built",
    "visit-time-tip",
    "best-for-visit-type",
    # Nightlife (single-angle pool per ADR 0008)
    "best-for-night",
]


class GenerateListicleTargetRequest(BaseModel):
    target_id: str = Field(min_length=1, max_length=200)
    field_type: Literal["intro", "blurb"]
    category: ListicleCategory | None = None
    display_name: str | None = Field(default=None, max_length=240)
    research_subject: str | None = Field(default=None, max_length=240)
    location_label: str | None = Field(default=None, max_length=300)
    current_content: str = Field(default="", max_length=MAX_BLOCK_CHARS)
    supporting_context: str | None = Field(default=None, max_length=12000)
    payload_doc_id: str | None = Field(default=None, max_length=64)
    payload_collection: PayloadCollectionSlug | None = None
    angle: ListicleAngleRequest | None = None


class GenerateListicleContentRequest(BaseModel):
    article_title: str = Field(min_length=1, max_length=MAX_ARTICLE_TITLE_CHARS)
    article_type: ListicleArticleType
    location_label: str = Field(min_length=1, max_length=300)
    article_context: str | None = Field(
        default=None, max_length=MAX_ARTICLE_CONTEXT_CHARS
    )
    model_name: str | None = Field(default=None, max_length=120)
    custom_instruction: str | None = Field(default=None, max_length=MAX_PROMPT_CHARS)
    skip_existing: bool = False
    list_tone: ListTone | None = None
    targets: list[GenerateListicleTargetRequest] = Field(default_factory=list)


StepEventName = Literal[
    "critical_fields_evaluated",
    "research_profile_completed",
    "writer_brief_completed",
    "writer_called",
    "validated",
    "retry_called",
    "finalized",
]
StepEventStatus = Literal["ok", "skipped", "failed"]


class StepEvent(BaseModel):
    name: StepEventName
    status: StepEventStatus
    prompt: str | None = None
    output: str | None = None
    model: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    duration_ms: int = 0


class GenerateListicleTargetResponse(BaseModel):
    target_id: str
    status: Literal["generated", "skipped", "error"]
    markdown: str | None = None
    model_used: str
    source_urls: list[str] = Field(default_factory=list)
    validation_errors: list[str] = Field(default_factory=list)
    error_message: str | None = None
    low_confidence: bool = False
    warnings: list[str] = Field(default_factory=list)
    requested_angle: ListicleAngleRequest | None = None
    effective_angle: ListicleAngleRequest | None = None
    steps: list[StepEvent] = Field(default_factory=list)


class GenerateListicleContentResponse(BaseModel):
    results: dict[str, GenerateListicleTargetResponse]


def _to_composition_target(
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


def _to_step_event(step: ListicleCompositionStep) -> StepEvent:
    return StepEvent(
        name=step.name,
        status=step.status,
        prompt=step.prompt,
        output=step.output,
        model=step.model,
        details=step.details,
        duration_ms=step.duration_ms,
    )


def _to_target_response(
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
        steps=[_to_step_event(step) for step in result.steps],
    )


def _generate_single_listicle_target(
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
    list_tone: ListTone | None = None,
    requested_angle: AssignmentAngle | None = None,
    effective_angle: AssignmentAngle | None = None,
    dependencies: EditorAssistDependencies,
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
            target=_to_composition_target(request_target),
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
    return _to_target_response(result)


def _evaluate_target_cf(
    request_target: GenerateListicleTargetRequest,
) -> CriticalFieldsResult:
    if request_target.field_type == "intro":
        return CriticalFieldsResult(passed=True, missing=[])
    return evaluate_critical_fields(
        name=request_target.display_name or request_target.research_subject,
        category=request_target.category,
        location_label=request_target.location_label,
        payload_doc_id=request_target.payload_doc_id,
    )


def _is_skipped_existing_target(
    target: GenerateListicleTargetRequest,
    *,
    skip_existing: bool,
) -> bool:
    return skip_existing and bool((target.current_content or "").strip())


def _build_research_profile_requests(
    targets: list[GenerateListicleTargetRequest],
    cf_by_target_id: dict[str, CriticalFieldsResult],
    *,
    article_location: str,
    skip_existing: bool,
) -> list[ResearchProfileRequest]:
    requests: list[ResearchProfileRequest] = []
    for t in targets:
        if t.field_type != "blurb":
            continue
        if _is_skipped_existing_target(t, skip_existing=skip_existing):
            continue
        if not cf_by_target_id.get(t.target_id, CriticalFieldsResult(False, [])).passed:
            continue
        if t.category not in ANTI_AI_PROMPT_CATEGORIES:
            continue
        venue_name = (t.display_name or t.research_subject or "").strip()
        location_label = (t.location_label or article_location).strip()
        requests.append(
            ResearchProfileRequest(
                target_id=t.target_id,
                venue_name=venue_name,
                location_label=location_label,
                category=t.category,
                requested_angle=t.angle,
            )
        )
    return requests


def _generate_listicle_content_impl(
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

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    results: dict[str, GenerateListicleTargetResponse] = {}

    # 1) Critical Fields pass (per-target, in-memory, no I/O).
    cf_by_target_id: dict[str, CriticalFieldsResult] = {
        t.target_id: _evaluate_target_cf(t) for t in request.targets
    }

    # 2) Research Profile parallel pass for every generating blurb in enabled
    #    categories. The operator-selected angle is authoritative (ADR 0010);
    #    Research Profile validates it post-hoc.
    rp_requests = _build_research_profile_requests(
        request.targets,
        cf_by_target_id,
        article_location=article_location,
        skip_existing=request.skip_existing,
    )
    research_results: dict[str, tuple[ResearchProfile, ResearchProfileTrace]] = (
        run_research_profiles_concurrently(rp_requests) if rp_requests else {}
    )
    research_by_target_id: dict[str, ResearchProfile] = {
        tid: pair[0] for tid, pair in research_results.items()
    }
    research_trace_by_target_id: dict[str, ResearchProfileTrace] = {
        tid: pair[1] for tid, pair in research_results.items()
    }
    effective_angle_by_target_id: dict[str, AssignmentAngle | None] = {}
    for t in request.targets:
        profile = research_by_target_id.get(t.target_id)
        if profile is not None:
            effective_angle_by_target_id[t.target_id] = profile.effective_angle

    # 5) Per-target composition.
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

        requested_angle = request_target.angle
        effective_angle = effective_angle_by_target_id.get(request_target.target_id)
        try:
            results[request_target.target_id] = _generate_single_listicle_target(
                article_title=article_title,
                article_type=request.article_type,
                article_location=article_location,
                article_context=article_context,
                request_target=request_target,
                custom_instruction=custom_instruction,
                model_name=model_used,
                cf_result=cf_by_target_id[request_target.target_id],
                research_profile=research_by_target_id.get(request_target.target_id),
                research_profile_trace=research_trace_by_target_id.get(
                    request_target.target_id
                ),
                list_tone=request.list_tone,
                requested_angle=requested_angle,
                effective_angle=effective_angle,
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


class ListicleGuidelinesResponse(BaseModel):
    angles: dict[str, str]
    tones: dict[str, str]


@router.get("/listicle-guidelines", response_model=ListicleGuidelinesResponse)
async def get_listicle_guidelines() -> ListicleGuidelinesResponse:
    """Return the exact angle and tone guidance strings injected into the writer prompt."""
    return ListicleGuidelinesResponse(
        angles=dict(LISTICLE_ANGLE_GUIDANCE),
        tones=dict(LIST_TONE_GUIDANCE),
    )


@router.post(
    "/generate-listicle-content", response_model=GenerateListicleContentResponse
)
async def generate_listicle_content(
    request: GenerateListicleContentRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> GenerateListicleContentResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_generate_listicle_content",
            step_runner=lambda: _generate_listicle_content_impl(request, dependencies),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Editor Assist graph generate-listicle-content failed: %s", exc
        )
        raise HTTPException(
            status_code=502,
            detail="AI listicle generation graph failed",
        ) from exc
