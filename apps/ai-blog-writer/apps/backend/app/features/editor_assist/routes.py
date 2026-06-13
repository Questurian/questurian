"""
Editor Assist API routes.

Provides lightweight AI rewrite actions for staging block editors.
"""

import logging
import re
import time
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .graph import (
    run_editor_assist_compose_brief_graph,
    run_editor_assist_generate_title_graph,
    run_editor_assist_listicle_generation_graph,
    run_editor_assist_rewrite_graph,
)
from .angle_assignment import (
    ANTI_AI_PROMPT_CATEGORIES,
    LEAN_PROMPT_CATEGORIES,
    ListicleAngle as AssignmentAngle,
)
from .critical_fields import CriticalFieldsResult, evaluate_critical_fields
from .research_profile import (
    ResearchFinding,
    ResearchProfile,
    ResearchProfileRequest,
    ResearchProfileTrace,
    run_research_profiles_concurrently,
)
from .listicle_writer import (
    LIST_TONE_GUIDANCE,
    LISTICLE_ANGLE_GUIDANCE,
    ListicleArticleType,
    ListicleCategory,
    ListicleWriterTarget,
    build_identity_only_writer_prompt,
    build_lean_writer_prompt,
    build_retry_prompt,
    build_writer_prompt,
    strip_generation_fence,
    validate_generated_text,
)
from .writer_brief import (
    MIN_SOURCE_FACTS,
    WriterBrief,
    run_writer_brief,
)
from .writer_models import WriterModelError, invoke_writer_model
from app.shared.text import normalize_dashes

router = APIRouter(prefix="/editor-assist", tags=["editor-assist"])
logger = logging.getLogger(__name__)


DEFAULT_MODEL = "gemini-2.5-flash-lite"
MAX_PROMPT_CHARS = 10000
MAX_BLOCK_CHARS = 24000
MAX_ARTICLE_TITLE_CHARS = 300
MAX_ARTICLE_CONTEXT_CHARS = 120000
MAX_TITLE_CHARS = 200

BLOCK_REWRITE_PROMPT = """You are an expert editorial rewriting assistant.

You will receive:
1) An editor instruction.
2) The article title (reference only).
3) Optional full-article context (reference only).
4) One markdown article block that is the only section to rewrite.

Rewrite ONLY that single block according to the instruction.

Hard rules:
- Return only rewritten block content (markdown), no commentary.
- Treat the title and full-article context as reference only.
- Do not rewrite or summarize any other section.
- Preserve markdown semantics and readability.
- Do not add meta notes, explanations, or surrounding prose.
- Keep the response as one standalone block body.
- Do not wrap the result in code fences.

Return ONLY using this exact envelope:
<<<BLOCK>>>
[rewritten markdown block content]
<<<END_BLOCK>>>"""


class RewriteBlockRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)
    block_content: str = Field(min_length=1, max_length=MAX_BLOCK_CHARS)
    model_name: str | None = Field(default=None, max_length=120)
    article_title: str | None = Field(
        default=None,
        max_length=MAX_ARTICLE_TITLE_CHARS,
    )
    article_context: str | None = Field(
        default=None,
        max_length=MAX_ARTICLE_CONTEXT_CHARS,
    )


class RewriteBlockResponse(BaseModel):
    rewritten_content: str
    model_used: str


def _safe_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    content = getattr(value, "content", None)
    if isinstance(content, str):
        return content.strip()
    return ""


def _strip_markdown_fence(text: str) -> str:
    fenced = re.match(
        r"^\s*```(?:markdown|md)?\s*(.*?)\s*```\s*$", text, flags=re.S | re.I
    )
    if fenced:
        return fenced.group(1).strip()
    return text.strip()


def _extract_rewritten_block(raw_response: str) -> str:
    envelope_match = re.search(
        r"<<<BLOCK>>>\s*(.*?)\s*<<<END_BLOCK>>>",
        raw_response,
        flags=re.S | re.I,
    )
    if envelope_match:
        extracted = envelope_match.group(1).strip()
        return _strip_markdown_fence(extracted)

    # Fallback in case the model ignores envelope instructions.
    return _strip_markdown_fence(raw_response)


TITLE_IMPROVE_PROMPT = """You are a headline editor for a travel and lifestyle listicle publication.

You will receive an existing article title and an editor instruction for how to improve it.

Rules:
- Return only the final improved title text.
- No quotes, no markdown, no explanation, no commentary.
- Output exactly one line."""


class GenerateTitleRequest(BaseModel):
    current_title: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)
    model_name: str | None = Field(default=None, max_length=120)


class GenerateTitleResponse(BaseModel):
    title: str


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


ListTone = Literal[
    "elevated", "casual", "hidden-gem", "family-friendly", "date-night", "budget"
]


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
    "evidence_profile_completed",
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


def _extract_generated_title(raw_response: str) -> str:
    # Strip any stray envelope tags the model may have included
    cleaned = re.sub(r"<<<[A-Z_]+>>>", "", raw_response, flags=re.I).strip()
    # Take the first non-empty line (titles should be one line)
    for line in cleaned.splitlines():
        line = line.strip()
        if line:
            return line
    return cleaned


def _generate_title_impl(request: GenerateTitleRequest) -> GenerateTitleResponse:
    current_title = request.current_title.strip()
    prompt = request.prompt.strip()

    if not current_title:
        raise HTTPException(status_code=400, detail="current_title is required")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    llm_prompt = (
        f"{TITLE_IMPROVE_PROMPT}\n\n"
        f"Current title: {current_title}\n\n"
        f"Editor instruction: {prompt}"
    )

    try:
        writer_result = invoke_writer_model(
            prompt=llm_prompt,
            model_name=model_used,
            max_tokens=2048,
            temperature=0.4,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist generate-title failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI title generation request failed",
        ) from exc

    raw_text = writer_result.text
    if not raw_text:
        raise HTTPException(
            status_code=502, detail="AI title generation returned empty output"
        )

    title = _extract_generated_title(raw_text)
    if not title:
        raise HTTPException(
            status_code=502, detail="AI title generation returned empty title"
        )

    return GenerateTitleResponse(title=title)


@router.post("/generate-title", response_model=GenerateTitleResponse)
async def generate_title(request: GenerateTitleRequest) -> GenerateTitleResponse:
    try:
        return run_editor_assist_generate_title_graph(
            step_runner=lambda: _generate_title_impl(request),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph generate-title failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI title generation graph failed",
        ) from exc


COMPOSE_BRIEF_PROMPT = """You are an expert travel-editorial planner writing an itinerary generation brief.

You will receive a structured Traveler Profile: traveler types, trip motivations, \
interests, budget, accommodation preferences, comfort and practical needs, and \
optional notes in the operator's own words. You may also receive the destination, \
trip length in days, and a working article title for grounding.

Compose ONE paragraph of 3 to 5 sentences describing the intended travel \
experience, written as a planning brief for an AI that will pick venues and \
order the days.

Hard rules:
- Experience-focused prose: who the trip is for, why they are traveling, what \
they want to eat, see, and do, how they want to stay and get around.
- NEVER name specific venues, restaurants, hotels, bars, or attractions — venue \
selection happens downstream.
- Weave the selections into natural sentences; do not enumerate them as a list \
or repeat section labels.
- If notes in the operator's own words are provided, honor them; they win over \
the structured selections on any conflict.
- No headings, no bullet points, no quotes, no commentary — return only the \
paragraph."""

MAX_PROFILE_OPTION_CHARS = 120
MAX_PROFILE_OPTIONS_PER_SECTION = 60
MAX_PROFILE_NOTES_CHARS = 2000


class ComposeItineraryBriefRequest(BaseModel):
    traveler_types: list[str] = Field(default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION)
    motivations: list[str] = Field(default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION)
    interests: list[str] = Field(default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION)
    budget: str | None = Field(default=None, max_length=8)
    accommodations: list[str] = Field(default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION)
    practical_needs: list[str] = Field(default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION)
    notes: str | None = Field(default=None, max_length=MAX_PROFILE_NOTES_CHARS)
    location_label: str | None = Field(default=None, max_length=300)
    day_count: int | None = Field(default=None, ge=1, le=7)
    article_title: str | None = Field(default=None, max_length=MAX_ARTICLE_TITLE_CHARS)
    model_name: str | None = Field(default=None, max_length=120)


class ComposeItineraryBriefResponse(BaseModel):
    brief: str
    model_used: str


def _clean_profile_options(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    for value in values:
        text = value.strip()[:MAX_PROFILE_OPTION_CHARS]
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def _compose_itinerary_brief_impl(
    request: ComposeItineraryBriefRequest,
) -> ComposeItineraryBriefResponse:
    sections = {
        "Traveler types": _clean_profile_options(request.traveler_types),
        "Trip motivations": _clean_profile_options(request.motivations),
        "Interests": _clean_profile_options(request.interests),
        "Accommodation preferences": _clean_profile_options(request.accommodations),
        "Comfort and practical needs": _clean_profile_options(request.practical_needs),
    }
    budget = (request.budget or "").strip()
    notes = (request.notes or "").strip()

    if not budget and not notes and not any(sections.values()):
        raise HTTPException(
            status_code=400,
            detail="Traveler Profile is empty — select options or add notes first.",
        )

    profile_lines: list[str] = []
    for label, values in sections.items():
        if values:
            profile_lines.append(f"{label}: {', '.join(values)}")
    if budget:
        profile_lines.append(f"Budget level: {budget} (on a $ to $$$$ scale)")
    if notes:
        profile_lines.append(f"In the operator's own words: {notes}")

    context_lines: list[str] = []
    location_label = (request.location_label or "").strip()
    if location_label:
        context_lines.append(f"Destination: {location_label}")
    if request.day_count:
        context_lines.append(f"Trip length: {request.day_count} day(s)")
    article_title = (request.article_title or "").strip()
    if article_title:
        context_lines.append(f"Working article title: {article_title}")

    llm_prompt = f"{COMPOSE_BRIEF_PROMPT}\n\nTraveler Profile:\n" + "\n".join(profile_lines)
    if context_lines:
        llm_prompt += "\n\nTrip context:\n" + "\n".join(context_lines)

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    try:
        writer_result = invoke_writer_model(
            prompt=llm_prompt,
            model_name=model_used,
            max_tokens=2048,
            temperature=0.5,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist compose-itinerary-brief failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI brief composition request failed",
        ) from exc

    brief = normalize_dashes((writer_result.text or "").strip())
    if not brief:
        raise HTTPException(
            status_code=502, detail="AI brief composition returned empty output"
        )

    return ComposeItineraryBriefResponse(brief=brief, model_used=model_used)


@router.post("/compose-itinerary-brief", response_model=ComposeItineraryBriefResponse)
async def compose_itinerary_brief(
    request: ComposeItineraryBriefRequest,
) -> ComposeItineraryBriefResponse:
    try:
        return run_editor_assist_compose_brief_graph(
            step_runner=lambda: _compose_itinerary_brief_impl(request),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph compose-itinerary-brief failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI brief composition graph failed",
        ) from exc


def _merge_urls(*groups: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for url in group:
            if url in seen:
                continue
            seen.add(url)
            merged.append(url)
    return merged


def _format_research_profile_block(
    profile: ResearchProfile | None,
) -> str:
    """Render supported angle evidence and bucket evidence for the writer."""
    if profile is None:
        return ""
    lines: list[str] = ["RESEARCH PROFILE"]
    selected = profile.selected_angle
    if selected.status == "supported" and selected.angle and selected.summary:
        lines.append("SELECTED ANGLE EVIDENCE")
        lines.append(f"- {selected.angle} (effective angle): {selected.summary}")
    bucket_lines: list[str] = []
    for bucket, findings in profile.standard_buckets.items():
        for finding in findings:
            bucket_lines.append(f"- {bucket}: {finding.summary}")
    if bucket_lines:
        lines.append("STANDARD EVIDENCE BUCKETS")
        lines.extend(bucket_lines)
    return "\n".join(lines)


def _research_buckets_details(
    buckets: dict[str, list[ResearchFinding]],
) -> dict[str, list[dict[str, Any]]]:
    return {
        bucket: [
            {
                "summary": finding.summary,
                "citations": list(finding.citations),
            }
            for finding in findings
        ]
        for bucket, findings in buckets.items()
    }


def _to_listicle_writer_target(
    request_target: GenerateListicleTargetRequest,
    *,
    extra_supporting_context: str = "",
) -> ListicleWriterTarget:
    base_context = request_target.supporting_context or ""
    if extra_supporting_context:
        supporting_context = (
            f"{base_context}\n\n{extra_supporting_context}".strip()
            if base_context.strip()
            else extra_supporting_context
        )
    else:
        supporting_context = base_context

    return ListicleWriterTarget(
        target_id=request_target.target_id,
        field_type=request_target.field_type,
        category=request_target.category,
        display_name=request_target.display_name,
        research_subject=request_target.research_subject,
        location_label=request_target.location_label,
        current_content=request_target.current_content or "",
        supporting_context=supporting_context,
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
) -> GenerateListicleTargetResponse:
    steps: list[StepEvent] = []
    source_urls: list[str] = []
    warnings: list[str] = []

    def _elapsed_ms(start: float) -> int:
        return int((time.perf_counter() - start) * 1000)

    # 1) critical_fields_evaluated
    cf_start = time.perf_counter()
    steps.append(
        StepEvent(
            name="critical_fields_evaluated",
            status="ok" if cf_result.passed else "failed",
            details={
                "passed": cf_result.passed,
                "missing": list(cf_result.missing),
                "category": request_target.category,
                "field_type": request_target.field_type,
            },
            duration_ms=_elapsed_ms(cf_start),
        )
    )
    if not cf_result.passed:
        return GenerateListicleTargetResponse(
            target_id=request_target.target_id,
            status="error",
            model_used=model_name,
            error_message=f"Critical Fields gate failed: missing {', '.join(cf_result.missing)}",
            requested_angle=requested_angle,
            effective_angle=effective_angle,
            steps=steps,
        )

    # 2) research_profile_completed (blurbs only)
    is_blurb = request_target.field_type == "blurb"
    if is_blurb and research_profile is not None:
        rp_start = time.perf_counter()
        source_urls = _merge_urls(source_urls, research_profile.source_urls)
        warnings = list(research_profile.warnings)
        trace = research_profile_trace or ResearchProfileTrace(prompt="")
        steps.append(
            StepEvent(
                name="research_profile_completed",
                status="ok" if research_profile.usable_for_blurb else "failed",
                prompt=trace.prompt or None,
                output=trace.raw_response or None,
                model=trace.model or None,
                details={
                    "requested_angle": requested_angle,
                    "effective_angle": research_profile.effective_angle,
                    "selected_angle": {
                        "angle": research_profile.selected_angle.angle,
                        "status": research_profile.selected_angle.status,
                        "summary": research_profile.selected_angle.summary,
                        "citations": list(research_profile.selected_angle.citations),
                        "reason": research_profile.selected_angle.reason,
                    },
                    "standard_buckets": _research_buckets_details(
                        research_profile.standard_buckets
                    ),
                    "usable_for_blurb": research_profile.usable_for_blurb,
                    "source_urls": list(source_urls),
                    "warnings": list(warnings),
                    "parser_dropped_reason": trace.parser_dropped_reason,
                    "error": trace.error,
                },
                duration_ms=_elapsed_ms(rp_start),
            )
        )

    # 3) writer_called
    angle_failed = (
        is_blurb
        and request_target.category in ANTI_AI_PROMPT_CATEGORIES
        and requested_angle is not None
        and effective_angle is None
    )
    low_confidence = angle_failed
    if (
        is_blurb
        and research_profile is not None
        and not research_profile.usable_for_blurb
    ):
        low_confidence = True

    # 2b) writer_brief. The Writer Brief curator compresses the Research
    # Profile into a venue-tailored angle directive + flat Source Facts list.
    # Runs for categories on the lean writer path (ADR 0007 nightlife,
    # ADR 0009 dining, ADR 0011 accommodations, ADR 0012 attractions).
    # The bucket-dump path remains for categories outside
    # LEAN_PROMPT_CATEGORIES until they are individually ported.
    use_lean_prompt = (
        is_blurb
        and request_target.category in LEAN_PROMPT_CATEGORIES
        and research_profile is not None
        and research_profile.usable_for_blurb
    )
    writer_brief: WriterBrief | None = None
    if use_lean_prompt:
        wb_start = time.perf_counter()
        venue_name = (
            request_target.research_subject or request_target.display_name or ""
        ).strip()
        location_label = (request_target.location_label or article_location).strip()
        writer_brief, wb_trace = run_writer_brief(
            venue_name=venue_name,
            location_label=location_label,
            category=request_target.category or "nightlife",
            angle=effective_angle,
            research_profile=research_profile,
        )
        if not writer_brief.is_usable:
            low_confidence = True
        steps.append(
            StepEvent(
                name="writer_brief_completed",
                status="ok" if writer_brief.is_usable else "failed",
                prompt=wb_trace.prompt or None,
                output=wb_trace.raw_response or None,
                model=wb_trace.model or None,
                details={
                    "angle": writer_brief.angle,
                    "angle_directive": writer_brief.angle_directive,
                    "source_facts": [
                        {"fact": entry.fact, "citations": list(entry.citations)}
                        for entry in writer_brief.source_facts
                    ],
                    "source_facts_count": len(writer_brief.source_facts),
                    "min_source_facts": MIN_SOURCE_FACTS,
                    "is_usable": writer_brief.is_usable,
                    "parser_dropped_reason": wb_trace.parser_dropped_reason,
                    "error": wb_trace.error,
                },
                duration_ms=_elapsed_ms(wb_start),
            )
        )

    findings_block = _format_research_profile_block(research_profile)
    target = _to_listicle_writer_target(
        request_target, extra_supporting_context=findings_block
    )

    wr_start = time.perf_counter()
    if use_lean_prompt and writer_brief is not None and writer_brief.is_usable:
        # Lean path: prompt is built from the Writer Brief only. BUILDER CONTEXT
        # and the bucket-labeled Research Profile findings are intentionally not
        # passed to the writer for categories on the lean path.
        lean_target = _to_listicle_writer_target(request_target)
        prompt = build_lean_writer_prompt(
            category=request_target.category or "nightlife",
            article_title=article_title,
            article_type=article_type,
            article_location=article_location,
            target=lean_target,
            brief=writer_brief,
            custom_instruction=custom_instruction,
            list_tone=list_tone,
        )
    elif (
        is_blurb
        and research_profile is not None
        and not research_profile.usable_for_blurb
    ):
        prompt = build_identity_only_writer_prompt(
            article_title=article_title,
            article_type=article_type,
            article_location=article_location,
            target=target,
            article_context=article_context,
            custom_instruction=custom_instruction,
            list_tone=list_tone,
        )
    elif use_lean_prompt:
        # Lean fallback: curator returned an unusable brief. Drop to the
        # identity-only path with low_confidence already flagged above.
        prompt = build_identity_only_writer_prompt(
            article_title=article_title,
            article_type=article_type,
            article_location=article_location,
            target=target,
            article_context=article_context,
            custom_instruction=custom_instruction,
            list_tone=list_tone,
        )
    else:
        prompt = build_writer_prompt(
            article_title=article_title,
            article_type=article_type,
            article_location=article_location,
            target=target,
            article_context=article_context,
            custom_instruction=custom_instruction,
            list_tone=list_tone,
            listicle_angle=effective_angle,
        )
    try:
        writer_result = invoke_writer_model(
            prompt=prompt,
            model_name=model_name,
            max_tokens=8192,
            temperature=0.15,
        )
    except WriterModelError as exc:
        steps.append(
            StepEvent(
                name="writer_called",
                status="failed",
                prompt=prompt,
                model=model_name,
                details={
                    "error": str(exc),
                    "custom_instruction": custom_instruction or None,
                    "list_tone": list_tone,
                    "requested_angle": requested_angle,
                    "effective_angle": effective_angle,
                    "low_confidence": low_confidence,
                    "warnings": list(warnings),
                },
                duration_ms=_elapsed_ms(wr_start),
            )
        )
        logger.exception(
            "Writer model call failed for target %s", request_target.target_id
        )
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    candidate = strip_generation_fence(writer_result.text)
    model_used = writer_result.model_name
    steps.append(
        StepEvent(
            name="writer_called",
            status="ok",
            prompt=prompt,
            output=candidate,
            model=model_used,
            details={
                "raw_output": writer_result.text,
                "custom_instruction": custom_instruction or None,
                "list_tone": list_tone,
                "requested_angle": requested_angle,
                "effective_angle": effective_angle,
                "low_confidence": low_confidence,
                "warnings": list(warnings),
            },
            duration_ms=_elapsed_ms(wr_start),
        )
    )

    # 4) validated
    val_start = time.perf_counter()
    validation_errors = validate_generated_text(
        field_type=target.field_type,
        text=candidate,
    )
    steps.append(
        StepEvent(
            name="validated",
            status="ok" if not validation_errors else "failed",
            details={
                "validation_errors": list(validation_errors),
                "passed": not validation_errors,
                "field_type": target.field_type,
            },
            duration_ms=_elapsed_ms(val_start),
        )
    )

    # 5) retry_called (only when first validation failed)
    if validation_errors:
        rt_start = time.perf_counter()
        if (
            use_lean_prompt
            and writer_brief is not None
            and writer_brief.is_usable
            and request_target.category == "nightlife"
        ):
            # Nightlife: retry inline on the lean prompt (existing behavior
            # preserved from ADR 0007). ADR 0009 intentionally leaves this
            # path on inline construction rather than build_retry_prompt to
            # avoid touching nightlife.
            lean_target = _to_listicle_writer_target(request_target)
            base_lean_prompt = build_lean_writer_prompt(
                category="nightlife",
                article_title=article_title,
                article_type=article_type,
                article_location=article_location,
                target=lean_target,
                brief=writer_brief,
                custom_instruction=custom_instruction,
                list_tone=list_tone,
            )
            failures = "\n".join(f"- {item}" for item in validation_errors)
            retry_prompt = (
                f"{base_lean_prompt}\n\n"
                "REVISION TASK\n"
                "The previous draft did not pass validation. Rewrite it so it fully complies.\n\n"
                f"VALIDATION FAILURES\n{failures}\n\n"
                f"CURRENT DRAFT\n{candidate.strip()}\n\n"
                "Return only the corrected final paragraph."
            )
        else:
            # Lean retry routes through build_retry_prompt with a usable
            # brief for categories ported after nightlife. Other categories
            # get the fat-prompt retry.
            retry_brief = (
                writer_brief
                if (
                    use_lean_prompt
                    and writer_brief is not None
                    and writer_brief.is_usable
                    and request_target.category
                    in {"dining", "accommodations", "attractions"}
                )
                else None
            )
            retry_prompt = build_retry_prompt(
                article_title=article_title,
                article_type=article_type,
                article_location=article_location,
                target=target,
                article_context=article_context,
                custom_instruction=custom_instruction,
                current_output=candidate,
                validation_errors=validation_errors,
                list_tone=list_tone,
                listicle_angle=effective_angle,
                brief=retry_brief,
            )
        try:
            retry_result = invoke_writer_model(
                prompt=retry_prompt,
                model_name=model_name,
                max_tokens=8192,
                temperature=0.1,
            )
        except WriterModelError as exc:
            steps.append(
                StepEvent(
                    name="retry_called",
                    status="failed",
                    prompt=retry_prompt,
                    model=model_name,
                    details={"error": str(exc)},
                    duration_ms=_elapsed_ms(rt_start),
                )
            )
            logger.exception(
                "Writer model retry failed for target %s", request_target.target_id
            )
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        candidate = strip_generation_fence(retry_result.text)
        validation_errors = validate_generated_text(
            field_type=target.field_type,
            text=candidate,
        )
        model_used = retry_result.model_name
        steps.append(
            StepEvent(
                name="retry_called",
                status="ok" if not validation_errors else "failed",
                prompt=retry_prompt,
                output=candidate,
                model=model_used,
                details={
                    "raw_output": retry_result.text,
                    "post_retry_validation_errors": list(validation_errors),
                    "passed": not validation_errors,
                },
                duration_ms=_elapsed_ms(rt_start),
            )
        )

    # 6) finalized
    fn_start = time.perf_counter()
    if validation_errors:
        steps.append(
            StepEvent(
                name="finalized",
                status="failed",
                output=candidate,
                model=model_used,
                details={
                    "final_status": "error",
                    "validation_errors": list(validation_errors),
                    "source_urls": list(source_urls),
                    "low_confidence": low_confidence,
                    "warnings": list(warnings),
                },
                duration_ms=_elapsed_ms(fn_start),
            )
        )
        return GenerateListicleTargetResponse(
            target_id=request_target.target_id,
            status="error",
            model_used=model_used,
            source_urls=source_urls,
            validation_errors=validation_errors,
            error_message="Generated content failed validation after retry.",
            low_confidence=low_confidence,
            warnings=warnings,
            requested_angle=requested_angle,
            effective_angle=effective_angle,
            steps=steps,
        )

    steps.append(
        StepEvent(
            name="finalized",
            status="ok",
            output=candidate,
            model=model_used,
            details={
                "final_status": "generated",
                "source_urls": list(source_urls),
                "low_confidence": low_confidence,
                "warnings": list(warnings),
            },
            duration_ms=_elapsed_ms(fn_start),
        )
    )
    return GenerateListicleTargetResponse(
        target_id=request_target.target_id,
        status="generated",
        markdown=candidate,
        model_used=model_used,
        source_urls=source_urls,
        low_confidence=low_confidence,
        warnings=warnings,
        requested_angle=requested_angle,
        effective_angle=effective_angle,
        steps=steps,
    )


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


def _rewrite_block_impl(request: RewriteBlockRequest) -> RewriteBlockResponse:
    prompt = request.prompt.strip()
    block_content = request.block_content.strip()
    article_title = (
        request.article_title.strip() if request.article_title else "Untitled article"
    )
    article_context = request.article_context.strip() if request.article_context else ""

    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    if not block_content:
        raise HTTPException(status_code=400, detail="block_content is required")

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    llm_prompt = (
        f"{BLOCK_REWRITE_PROMPT}\n\n"
        f"Editor instruction:\n{prompt}\n\n"
        f"Article title (reference only):\n{article_title}\n\n"
    )

    if article_context:
        llm_prompt += (
            "Full article context for reference only. "
            "Do not rewrite this context. Rewrite only the current markdown block.\n"
            "<<<ARTICLE_CONTEXT>>>\n"
            f"{article_context}\n"
            "<<<END_ARTICLE_CONTEXT>>>\n\n"
        )

    llm_prompt += (
        "Current markdown block to rewrite:\n"
        "<<<CURRENT_BLOCK>>>\n"
        f"{block_content}\n"
        "<<<END_CURRENT_BLOCK>>>"
    )

    try:
        writer_result = invoke_writer_model(
            prompt=llm_prompt,
            model_name=model_used,
            max_tokens=8192,
            temperature=0.1,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist rewrite failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI rewrite request failed",
        ) from exc

    raw_text = writer_result.text
    if not raw_text:
        raise HTTPException(status_code=502, detail="AI rewrite returned empty output")

    rewritten_content = _extract_rewritten_block(raw_text)
    if not rewritten_content:
        raise HTTPException(
            status_code=502, detail="AI rewrite returned empty block content"
        )

    rewritten_content = normalize_dashes(rewritten_content)

    return RewriteBlockResponse(
        rewritten_content=rewritten_content,
        model_used=writer_result.model_name,
    )


@router.post("/rewrite-block", response_model=RewriteBlockResponse)
async def rewrite_block(request: RewriteBlockRequest) -> RewriteBlockResponse:
    try:
        return run_editor_assist_rewrite_graph(
            step_runner=lambda: _rewrite_block_impl(request),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph rewrite failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI rewrite graph failed",
        ) from exc


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
) -> GenerateListicleContentResponse:
    try:
        return run_editor_assist_listicle_generation_graph(
            step_runner=lambda: _generate_listicle_content_impl(request),
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
