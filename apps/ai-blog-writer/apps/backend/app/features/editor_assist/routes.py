"""
Editor Assist API routes.

Provides lightweight AI rewrite actions for staging block editors.
"""

import logging
import re
import time
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .graph import (
    run_editor_assist_compose_brief_graph,
    run_editor_assist_compose_day_blurbs_graph,
    run_editor_assist_compose_intro_graph,
    run_editor_assist_compose_stop_reason_graph,
    run_editor_assist_generate_seo_graph,
    run_editor_assist_generate_title_graph,
    run_editor_assist_listicle_generation_graph,
    run_editor_assist_rewrite_graph,
)
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
from .critical_fields import CriticalFieldsResult, evaluate_critical_fields
from .research_profile import (
    ResearchProfile,
    ResearchProfileRequest,
    ResearchProfileTrace,
    run_research_profiles_concurrently,
)
from .listicle_writer import (
    BLURB_MAX_WORDS,
    BLURB_MIN_WORDS,
    LIST_TONE_GUIDANCE,
    LISTICLE_ANGLE_GUIDANCE,
    ListicleArticleType,
    ListicleCategory,
    strip_generation_fence,
    validate_generated_text,
)
from .writer_brief import run_writer_brief
from .writer_models import (
    WriterModelError,
    invoke_anthropic_structured,
    invoke_writer_model,
)
from app.shared.prompts import ANTI_AI_TELLS_BLURB, ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown, normalize_dashes

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

Write for readers first and SEO second. Use natural travel-news language, avoid \
keyword stuffing, avoid repetitive SEO headings, and make the article feel edited \
by a human. Include SEO elements only where they improve clarity: a strong \
headline, concise subhead, clean section structure, accurate metadata, and \
natural keywords.

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


COMPOSE_INTRO_PROMPT = """You are an expert travel-editorial writer composing the \
opening of a published listicle itinerary.

You will receive: the article title, the destination, the desired tone, an optional \
internal plan overview (the trip's thesis), and the ordered list of stops — each \
with its category, day placement, and an optional internal "why this pick" note.

Write the reader-facing INTRO — the prose that opens the article and sets up the \
days that follow.

Spine and texture:
- The plan overview is the spine: let the trip's thesis drive the intro's arc.
- The per-stop "why this pick" notes are texture: read them to understand what \
KIND of trip this is, and let that shape the characterization. Do NOT walk through \
the stops one by one or name every venue.
- The title and destination are framing constraints: stay consistent with the \
headline and ground the reader in the place.

Write for readers first and SEO second. Use natural travel-news language, avoid \
keyword stuffing, avoid repetitive SEO headings, and make the article feel edited \
by a human. Include SEO elements only where they improve clarity: a strong \
headline, concise subhead, clean section structure, accurate metadata, and \
natural keywords.

Hard rules:
- The plan overview and "why this pick" notes are INTERNAL planning notes, not \
reader copy. Transform them into natural reader-facing prose — never quote or \
echo them verbatim.
- Write 1 to 3 short paragraphs. No headings, no bullet points, no lists, no \
quotes, no commentary.
- You may gesture at the shape of the trip (e.g. how the days build) but do not \
produce a day-by-day or stop-by-stop rundown — the body of the article does that.
- Return only the intro prose."""

MAX_INTRO_STOPS = 60
MAX_INTRO_OVERVIEW_CHARS = 4000


class ComposeItineraryIntroStop(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    category: str | None = Field(default=None, max_length=80)
    day_label: str | None = Field(default=None, max_length=80)
    selection_reason: str | None = Field(default=None, max_length=2000)


class ComposeItineraryIntroRequest(BaseModel):
    article_title: str = Field(min_length=1, max_length=MAX_ARTICLE_TITLE_CHARS)
    location_label: str = Field(min_length=1, max_length=300)
    list_tone: ListTone | None = None
    plan_overview: str | None = Field(default=None, max_length=MAX_INTRO_OVERVIEW_CHARS)
    day_count: int | None = Field(default=None, ge=1, le=7)
    stops: list[ComposeItineraryIntroStop] = Field(
        default_factory=list, max_length=MAX_INTRO_STOPS
    )
    model_name: str | None = Field(default=None, max_length=120)


ComposeIntroStepStatus = Literal["ok", "warning", "failed"]


class ComposeIntroStepEvent(BaseModel):
    """One diagnostic step in a Compose-from-plan run, mirroring the Autobuild
    Report timeline so the operator can inspect what signal went in and out."""

    name: str
    label: str
    status: ComposeIntroStepStatus
    duration_ms: int = 0
    model: str | None = None
    prompt: str | None = None
    output: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class ComposeItineraryIntroResponse(BaseModel):
    intro: str
    model_used: str
    steps: list[ComposeIntroStepEvent] = Field(default_factory=list)


def _format_intro_stop_line(stop: ComposeItineraryIntroStop) -> str:
    tags = [tag for tag in (stop.day_label, stop.category) if tag and tag.strip()]
    prefix = f"[{' · '.join(tag.strip() for tag in tags)}] " if tags else ""
    reason = (stop.selection_reason or "").strip()
    suffix = f" — chosen for: {reason}" if reason else ""
    return f"- {prefix}{stop.title.strip()}{suffix}"


def _compose_itinerary_intro_impl(
    request: ComposeItineraryIntroRequest,
) -> ComposeItineraryIntroResponse:
    article_title = request.article_title.strip()
    location_label = request.location_label.strip()

    if not article_title:
        raise HTTPException(status_code=400, detail="article_title is required")
    if not location_label:
        raise HTTPException(status_code=400, detail="location_label is required")

    stop_lines = [
        _format_intro_stop_line(stop)
        for stop in request.stops
        if stop.title.strip()
    ]
    if not stop_lines:
        raise HTTPException(
            status_code=400,
            detail="Add at least one stop before composing the intro.",
        )

    inputs_started = time.monotonic()
    context_lines = [
        f"Article title: {article_title}",
        f"Destination: {location_label}",
    ]
    if request.day_count:
        context_lines.append(f"Trip length: {request.day_count} day(s)")
    tone_guidance = LIST_TONE_GUIDANCE.get(request.list_tone) if request.list_tone else None
    if tone_guidance:
        context_lines.append(f"Tone — {request.list_tone}: {tone_guidance}")
    plan_overview = (request.plan_overview or "").strip()
    if plan_overview:
        context_lines.append(f"Internal plan overview (the spine): {plan_overview}")

    llm_prompt = (
        f"{COMPOSE_INTRO_PROMPT}\n\n"
        + "Trip context:\n" + "\n".join(context_lines)
        + "\n\nItinerary stops (in order):\n" + "\n".join(stop_lines)
        + f"\n\n{ANTI_AI_TELLS_FULL}"
    )

    stops_with_reason = sum(
        1 for stop in request.stops if (stop.selection_reason or "").strip()
    )
    steps: list[ComposeIntroStepEvent] = [
        ComposeIntroStepEvent(
            name="inputs",
            label="Collected plan signal",
            status="ok" if plan_overview else "warning",
            duration_ms=int((time.monotonic() - inputs_started) * 1000),
            details={
                "list_tone": request.list_tone,
                "day_count": request.day_count,
                "plan_overview_present": bool(plan_overview),
                "stop_count": len(stop_lines),
                "stops_with_reason": stops_with_reason,
            },
        )
    ]

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    writer_started = time.monotonic()
    try:
        writer_result = invoke_writer_model(
            prompt=llm_prompt,
            model_name=model_used,
            max_tokens=2048,
            temperature=0.6,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist compose-itinerary-intro failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI intro composition request failed",
        ) from exc

    raw_text = (writer_result.text or "").strip()
    steps.append(
        ComposeIntroStepEvent(
            name="writer",
            label="Composer model call",
            status="ok" if raw_text else "failed",
            duration_ms=int((time.monotonic() - writer_started) * 1000),
            model=model_used,
            prompt=llm_prompt,
            output=raw_text,
            details={"raw_chars": len(raw_text)},
        )
    )

    intro = enforce_anti_ai_tells_markdown(
        strip_generation_fence(raw_text),
        repair=lambda repair_prompt: invoke_writer_model(
            prompt=repair_prompt,
            model_name=model_used,
            max_tokens=2048,
            temperature=0.2,
        ).text,
        context="editor_assist itinerary intro",
    )
    if not intro:
        raise HTTPException(
            status_code=502, detail="AI intro composition returned empty output"
        )

    steps.append(
        ComposeIntroStepEvent(
            name="finalize",
            label="Finalized intro",
            status="ok",
            output=intro,
            details={"chars": len(intro), "validated_and_unfenced": True},
        )
    )

    return ComposeItineraryIntroResponse(intro=intro, model_used=model_used, steps=steps)


@router.post("/compose-itinerary-intro", response_model=ComposeItineraryIntroResponse)
async def compose_itinerary_intro(
    request: ComposeItineraryIntroRequest,
) -> ComposeItineraryIntroResponse:
    try:
        return run_editor_assist_compose_intro_graph(
            step_runner=lambda: _compose_itinerary_intro_impl(request),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph compose-itinerary-intro failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI intro composition graph failed",
        ) from exc


# --- Itinerary day-blurb composer (ADR 0019) --------------------------------
#
# Unlike the per-target listicle writer, this authors a single day's stop blurbs
# in ONE call so they read as a connected journey (handoffs between stops, time
# of day, sequence). It is gated behind the finished Intro on the frontend and
# consumes that Intro as a framing input. Output per stop still obeys the blurb
# half of `validate_generated_text` — narrative lives in cross-stop handoffs, not
# in structurally fancier paragraphs.

MAX_DAY_BLURB_STOPS = 20

COMPOSE_DAY_BLURBS_PROMPT = """You are an expert travel-editorial writer composing \
the per-stop copy for ONE day of a published listicle itinerary.

You will receive: the article title, the destination, the desired tone, the \
reader-facing intro that already opens the article, an optional internal plan \
overview, and this day's stops in order — each with its category, rough time of \
day, an optional editorial angle, and an optional internal "why this pick" note. \
Each stop is marked either [TO WRITE] or [ALREADY WRITTEN]. Stops marked \
[ALREADY WRITTEN] are shown with their existing copy and are context ONLY — you \
must not rewrite or re-emit them. You may also receive the adjacent day's edge \
stop for context only.

Write ONE paragraph of reader-facing copy for ONLY the [TO WRITE] stops, in the \
given order. Emit nothing for [ALREADY WRITTEN] stops or adjacent-day edge stops.

Narrative and texture:
- These blurbs are a sequence, not isolated reviews. Let each paragraph be aware \
of where it sits in the day: the morning stop opens the day, later stops can hand \
off from what came before ("after the cathedral, wander down to ...") using the \
time of day and order you are given.
- Thread every [TO WRITE] stop into the [ALREADY WRITTEN] copy around it: pick up \
the handoff the preceding stop offers and lead naturally toward the stop that \
follows, matching their voice. Reference them lightly — never restate, quote, or \
rewrite their copy.
- Stay consistent with the intro's framing and the plan overview's thesis, but do \
NOT repeat the intro or restate the trip premise in every blurb.
- Weave each stop's KEY HIGHLIGHTS into the prose (the standout dish, the view, \
the signature feature). Highlights are woven into the paragraph, never bulleted.
- Honor the stop's editorial angle when one is given.
- The "why this pick" notes and plan overview are INTERNAL planning notes, not \
reader copy. Transform them into natural prose, never quote or echo them.
- Adjacent-day edge stops and [ALREADY WRITTEN] stops are context only. Do NOT \
write copy for them.

Write for readers first and SEO second. Use natural travel-news language, avoid \
keyword stuffing, avoid repetitive SEO headings, and make the article feel edited \
by a human. Include SEO elements only where they improve clarity: a strong \
headline, concise subhead, clean section structure, accurate metadata, and \
natural keywords.

Hard rules per blurb:
- One paragraph of about {min_words} to {max_words} words. No heading, no \
subheading, no bullet points, no lists, no quotes. The stop's title is rendered \
elsewhere, so do not restate it as a label.
- Never mention reviews, reviewers, ratings, stars, or the research process. Do \
not invent details.
- Do not print literal day/stop labels ("Day 2, Stop 1:") in the prose.

Output envelope — emit EXACTLY one block per [TO WRITE] stop, copying each stop's \
id tag verbatim, and nothing else outside the blocks:
<<<BLURB:the_stop_id>>>
[the single paragraph for that stop]
<<<END>>>"""

BLURB_ENVELOPE_PATTERN = re.compile(
    r"<<<BLURB:(?P<tid>[^>]+)>>>(?P<body>.*?)<<<END>>>", flags=re.S
)


class ComposeDayBlurbStop(BaseModel):
    target_id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=240)
    category: str | None = Field(default=None, max_length=80)
    daypart: str | None = Field(default=None, max_length=80)
    angle: str | None = Field(default=None, max_length=80)
    selection_reason: str | None = Field(default=None, max_length=2000)
    # The stop's already-written blurb. Used only when the stop is context-only
    # (not in write_target_ids), so a written sibling can be threaded off without
    # being rewritten (ADR 0022).
    existing_blurb: str | None = Field(default=None, max_length=4000)


class ComposeDayBlurbsNeighborStop(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    category: str | None = Field(default=None, max_length=80)


class ComposeDayBlurbsRequest(BaseModel):
    article_title: str = Field(min_length=1, max_length=MAX_ARTICLE_TITLE_CHARS)
    location_label: str = Field(min_length=1, max_length=300)
    list_tone: ListTone | None = None
    plan_overview: str | None = Field(default=None, max_length=MAX_INTRO_OVERVIEW_CHARS)
    intro: str | None = Field(default=None, max_length=MAX_INTRO_OVERVIEW_CHARS)
    day_label: str | None = Field(default=None, max_length=80)
    day_count: int | None = Field(default=None, ge=1, le=7)
    prev_day_last_stop: ComposeDayBlurbsNeighborStop | None = None
    next_day_first_stop: ComposeDayBlurbsNeighborStop | None = None
    stops: list[ComposeDayBlurbStop] = Field(
        default_factory=list, max_length=MAX_DAY_BLURB_STOPS
    )
    # When present, author ONLY these stops; the rest of `stops` are context-only
    # (their existing copy threads the written ones, ADR 0022). When omitted, the
    # whole day is authored — the original ADR 0019 behavior, unchanged.
    write_target_ids: list[str] | None = Field(
        default=None, max_length=MAX_DAY_BLURB_STOPS
    )
    model_name: str | None = Field(default=None, max_length=120)


class ComposeDayBlurbResult(BaseModel):
    target_id: str
    status: Literal["generated", "error"]
    markdown: str | None = None
    validation_errors: list[str] = Field(default_factory=list)


class ComposeDayBlurbsResponse(BaseModel):
    model_used: str
    results: dict[str, ComposeDayBlurbResult] = Field(default_factory=dict)
    steps: list[ComposeIntroStepEvent] = Field(default_factory=list)


def _format_day_blurb_stop_line(
    index: int, stop: ComposeDayBlurbStop, is_write: bool
) -> str:
    tags = [tag for tag in (stop.daypart, stop.category) if tag and tag.strip()]
    prefix = f"[{' · '.join(tag.strip() for tag in tags)}] " if tags else ""
    title = stop.title.strip()

    if not is_write:
        existing = (stop.existing_blurb or "").strip()
        body = (
            f"\n    Existing copy (context only, do NOT rewrite): {existing}"
            if existing
            else "\n    (Planned, not yet written — context only.)"
        )
        return f"{index}. id={stop.target_id} [ALREADY WRITTEN] {prefix}{title}{body}"

    angle = (stop.angle or "").strip()
    angle_guidance = LISTICLE_ANGLE_GUIDANCE.get(angle) if angle else None
    angle_suffix = f"\n    Angle — {angle}: {angle_guidance}" if angle_guidance else (
        f"\n    Angle: {angle}" if angle else ""
    )
    reason = (stop.selection_reason or "").strip()
    reason_suffix = f"\n    Why this pick: {reason}" if reason else ""
    return (
        f"{index}. id={stop.target_id} [TO WRITE] {prefix}{title}"
        f"{angle_suffix}{reason_suffix}"
    )


def _compose_day_blurbs_impl(
    request: ComposeDayBlurbsRequest,
) -> ComposeDayBlurbsResponse:
    article_title = request.article_title.strip()
    location_label = request.location_label.strip()

    if not article_title:
        raise HTTPException(status_code=400, detail="article_title is required")
    if not location_label:
        raise HTTPException(status_code=400, detail="location_label is required")

    stops = [stop for stop in request.stops if stop.title.strip()]
    if not stops:
        raise HTTPException(
            status_code=400,
            detail="Add at least one resolved stop before composing day blurbs.",
        )

    # Resolve which stops to author. Omitted write_target_ids = author the whole
    # day (ADR 0019). Otherwise author only the named subset; the rest are
    # context-only so a written sibling threads the new stop (ADR 0022).
    if request.write_target_ids is None:
        write_ids = {stop.target_id for stop in stops}
    else:
        requested = {tid.strip() for tid in request.write_target_ids if tid.strip()}
        write_ids = {stop.target_id for stop in stops if stop.target_id in requested}
        if not write_ids:
            raise HTTPException(
                status_code=400,
                detail="None of the requested stops to write are in this day.",
            )
    write_stops = [stop for stop in stops if stop.target_id in write_ids]

    inputs_started = time.monotonic()
    context_lines = [
        f"Article title: {article_title}",
        f"Destination: {location_label}",
    ]
    if request.day_label and request.day_label.strip():
        context_lines.append(f"This day: {request.day_label.strip()}")
    if request.day_count:
        context_lines.append(f"Trip length: {request.day_count} day(s)")
    tone_guidance = LIST_TONE_GUIDANCE.get(request.list_tone) if request.list_tone else None
    if tone_guidance:
        context_lines.append(f"Tone — {request.list_tone}: {tone_guidance}")
    intro_text = (request.intro or "").strip()
    if intro_text:
        context_lines.append(f"Article intro (already written, for framing): {intro_text}")
    plan_overview = (request.plan_overview or "").strip()
    if plan_overview:
        context_lines.append(f"Internal plan overview (the spine): {plan_overview}")
    if request.prev_day_last_stop:
        prev = request.prev_day_last_stop
        cat = f" ({prev.category.strip()})" if prev.category and prev.category.strip() else ""
        context_lines.append(
            f"Previous day ended at (context only, do not write): {prev.title.strip()}{cat}"
        )
    if request.next_day_first_stop:
        nxt = request.next_day_first_stop
        cat = f" ({nxt.category.strip()})" if nxt.category and nxt.category.strip() else ""
        context_lines.append(
            f"Next day opens at (context only, do not write): {nxt.title.strip()}{cat}"
        )

    stop_lines = [
        _format_day_blurb_stop_line(
            index + 1, stop, stop.target_id in write_ids
        )
        for index, stop in enumerate(stops)
    ]

    llm_prompt = (
        COMPOSE_DAY_BLURBS_PROMPT.format(
            min_words=BLURB_MIN_WORDS, max_words=BLURB_MAX_WORDS
        )
        + "\n\nTrip context:\n"
        + "\n".join(context_lines)
        + "\n\nDay stops in order (write only [TO WRITE]):\n"
        + "\n".join(stop_lines)
        + f"\n\n{ANTI_AI_TELLS_BLURB}"
    )

    steps: list[ComposeIntroStepEvent] = [
        ComposeIntroStepEvent(
            name="inputs",
            label="Collected day plan signal",
            status="ok" if intro_text else "warning",
            duration_ms=int((time.monotonic() - inputs_started) * 1000),
            details={
                "day_label": request.day_label,
                "list_tone": request.list_tone,
                "stop_count": len(stops),
                "write_count": len(write_stops),
                "context_only_count": len(stops) - len(write_stops),
                "intro_present": bool(intro_text),
                "plan_overview_present": bool(plan_overview),
                "has_prev_neighbor": request.prev_day_last_stop is not None,
                "has_next_neighbor": request.next_day_first_stop is not None,
                "stops_with_reason": sum(
                    1 for s in write_stops if (s.selection_reason or "").strip()
                ),
            },
        )
    ]

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    writer_started = time.monotonic()
    try:
        writer_result = invoke_writer_model(
            prompt=llm_prompt,
            model_name=model_used,
            max_tokens=8192,
            temperature=0.55,
        )
    except WriterModelError as exc:
        error_id = str(uuid4())
        logger.exception(
            "Editor assist compose-itinerary-day-blurbs failed | "
            "error_id=%s model=%s stops=%d write_stops=%d error=%s",
            error_id,
            model_used,
            len(stops),
            len(write_stops),
            exc,
        )
        raise HTTPException(
            status_code=502,
            detail=(
                "AI day-blurb composition request failed "
                f"(error {error_id}): {exc}"
            ),
        ) from exc

    raw_text = (writer_result.text or "").strip()
    parsed: dict[str, str] = {
        match.group("tid").strip(): match.group("body").strip()
        for match in BLURB_ENVELOPE_PATTERN.finditer(raw_text)
    }
    steps.append(
        ComposeIntroStepEvent(
            name="writer",
            label="Day composer model call",
            status="ok" if parsed else "failed",
            duration_ms=int((time.monotonic() - writer_started) * 1000),
            model=model_used,
            prompt=llm_prompt,
            output=raw_text,
            details={"raw_chars": len(raw_text), "blocks_parsed": len(parsed)},
        )
    )

    if not parsed:
        raise HTTPException(
            status_code=502,
            detail="AI day-blurb composition returned no parseable blurbs",
        )

    results: dict[str, ComposeDayBlurbResult] = {}
    for stop in write_stops:
        body = parsed.get(stop.target_id, "").strip()
        if not body:
            results[stop.target_id] = ComposeDayBlurbResult(
                target_id=stop.target_id,
                status="error",
                validation_errors=["Composer returned no paragraph for this stop."],
            )
            steps.append(
                ComposeIntroStepEvent(
                    name=f"stop:{stop.target_id}",
                    label=f"{stop.title.strip()} — missing",
                    status="failed",
                    details={"reason": "no_block_for_target"},
                )
            )
            continue

        blurb = enforce_anti_ai_tells_markdown(
            strip_generation_fence(body),
            repair=lambda repair_prompt: invoke_writer_model(
                prompt=repair_prompt,
                model_name=model_used,
                max_tokens=2048,
                temperature=0.2,
            ).text,
            context=f"editor_assist day blurb {stop.target_id}",
        )
        validation_errors = validate_generated_text(field_type="blurb", text=blurb)
        results[stop.target_id] = ComposeDayBlurbResult(
            target_id=stop.target_id,
            status="generated",
            markdown=blurb,
            validation_errors=validation_errors,
        )
        steps.append(
            ComposeIntroStepEvent(
                name=f"stop:{stop.target_id}",
                label=f"{stop.title.strip()} — blurb",
                status="warning" if validation_errors else "ok",
                model=model_used,
                output=blurb,
                details={
                    "chars": len(blurb),
                    "validation_errors": validation_errors,
                },
            )
        )

    generated = sum(1 for r in results.values() if r.status == "generated")
    steps.append(
        ComposeIntroStepEvent(
            name="finalize",
            label="Finalized day blurbs",
            status="ok" if generated else "failed",
            details={"generated": generated, "total": len(write_stops)},
        )
    )

    return ComposeDayBlurbsResponse(
        model_used=model_used, results=results, steps=steps
    )


@router.post(
    "/compose-itinerary-day-blurbs", response_model=ComposeDayBlurbsResponse
)
async def compose_itinerary_day_blurbs(
    request: ComposeDayBlurbsRequest,
) -> ComposeDayBlurbsResponse:
    try:
        return run_editor_assist_compose_day_blurbs_graph(
            step_runner=lambda: _compose_day_blurbs_impl(request),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Editor Assist graph compose-itinerary-day-blurbs failed: %s", exc
        )
        raise HTTPException(
            status_code=502,
            detail="AI day-blurb composition graph failed",
        ) from exc


# --- Stop selection reason (operator-authored, ADR 0020) ---------------------
#
# Refines an operator's rough "why did you pick this?" note into the same
# internal register Autobuild's reasons stage produces (itineraries_pipeline
# REASONS_PROMPT): venue draw + why it fits here, NOT scoring jargon, NOT the
# blurb. Output is an internal planning note seeding the day-blurb and intro
# composers — it is deliberately OFF the anti-AI reader-voice path.

COMPOSE_STOP_REASON_PROMPT = """You are refining an operator's rough note on why \
they chose a specific venue for a stop in a travel itinerary, so a later writer \
can build a blurb from it. The operator picked this stop by hand: their note is \
the substance. Keep their intent, sharpen the wording, and expand only enough to \
make it concrete and specific.

Write 1 to 2 sentences on this venue's draw and why it fits here. Match the \
register of an internal planning note: concrete about the venue, NOT scoring \
jargon, NOT reader-facing marketing prose. Do NOT write the blurb itself. Do NOT \
invent facts the operator did not give and that are not obvious from the venue's \
identity.

Return ONLY the refined reason text — no labels, quotes, or commentary."""


class ComposeStopReasonRequest(BaseModel):
    rough_reason: str = Field(min_length=1, max_length=2000)
    title: str = Field(min_length=1, max_length=240)
    category: str | None = Field(default=None, max_length=80)
    daypart: str | None = Field(default=None, max_length=80)
    angle: str | None = Field(default=None, max_length=80)
    article_title: str | None = Field(default=None, max_length=MAX_ARTICLE_TITLE_CHARS)
    location_label: str | None = Field(default=None, max_length=300)
    plan_overview: str | None = Field(default=None, max_length=MAX_INTRO_OVERVIEW_CHARS)
    model_name: str | None = Field(default=None, max_length=120)


class ComposeStopReasonResponse(BaseModel):
    reason: str
    model_used: str


def _compose_stop_reason_impl(
    request: ComposeStopReasonRequest,
) -> ComposeStopReasonResponse:
    rough_reason = request.rough_reason.strip()
    title = request.title.strip()
    if not rough_reason:
        raise HTTPException(status_code=400, detail="rough_reason is required")
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    stop_tags = [
        tag.strip()
        for tag in (request.daypart, request.category)
        if tag and tag.strip()
    ]
    stop_descriptor = f"{title} [{' · '.join(stop_tags)}]" if stop_tags else title

    context_lines = [f"Stop: {stop_descriptor}"]
    angle = (request.angle or "").strip()
    if angle:
        angle_guidance = LISTICLE_ANGLE_GUIDANCE.get(angle)
        context_lines.append(
            f"Editorial angle — {angle}: {angle_guidance}" if angle_guidance
            else f"Editorial angle: {angle}"
        )
    article_title = (request.article_title or "").strip()
    if article_title:
        context_lines.append(f"Article title: {article_title}")
    location_label = (request.location_label or "").strip()
    if location_label:
        context_lines.append(f"Destination: {location_label}")
    plan_overview = (request.plan_overview or "").strip()
    if plan_overview:
        context_lines.append(f"Internal plan overview (the spine): {plan_overview}")

    llm_prompt = (
        f"{COMPOSE_STOP_REASON_PROMPT}\n\n"
        + "Context:\n" + "\n".join(context_lines)
        + f"\n\nOperator's rough note:\n{rough_reason}"
    )

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    try:
        writer_result = invoke_writer_model(
            prompt=llm_prompt,
            model_name=model_used,
            max_tokens=1024,
            temperature=0.3,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist compose-itinerary-stop-reason failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI stop-reason composition request failed",
        ) from exc

    reason = strip_generation_fence(writer_result.text or "").strip()
    if not reason:
        raise HTTPException(
            status_code=502,
            detail="AI stop-reason composition returned empty output",
        )

    return ComposeStopReasonResponse(reason=reason, model_used=model_used)


@router.post(
    "/compose-itinerary-stop-reason", response_model=ComposeStopReasonResponse
)
async def compose_itinerary_stop_reason(
    request: ComposeStopReasonRequest,
) -> ComposeStopReasonResponse:
    try:
        return run_editor_assist_compose_stop_reason_graph(
            step_runner=lambda: _compose_stop_reason_impl(request),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Editor Assist graph compose-itinerary-stop-reason failed: %s", exc
        )
        raise HTTPException(
            status_code=502,
            detail="AI stop-reason composition graph failed",
        ) from exc


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
                invoke_writer=invoke_writer_model,
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
        f"\n\n{ANTI_AI_TELLS_FULL}"
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

    rewritten_content = enforce_anti_ai_tells_markdown(
        rewritten_content,
        repair=lambda repair_prompt: invoke_writer_model(
            prompt=repair_prompt,
            model_name=model_used,
            max_tokens=8192,
            temperature=0.1,
        ).text,
        context="editor_assist block rewrite",
    )

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


# --- Structured SEO metadata generation -----------------------------------
#
# Unlike /rewrite-block (free text + envelope extraction + client-side JSON
# repair), this endpoint forces the model to answer through a tool whose
# input schema matches the SEO patch shape. The API validates the payload,
# so the response is guaranteed-parseable JSON.

SEO_PATCH_TOOL_NAME = "emit_seo_patch"

# Forced-tool calls now dispatch per provider (see utils.invoke_structured_tool),
# so this endpoint accepts Gemini writers too. While Anthropic is switched off a
# claude-* default would just be substituted, so pin the Google writer directly.
SEO_STRUCTURED_DEFAULT_MODEL = "gemini-3.1-pro-preview"

SEO_PATCH_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "seoTitle": {
            "type": "string",
            "description": "SEO title, <= 60 characters, keyword-rich.",
        },
        "metaDescription": {
            "type": "string",
            "description": "Compelling meta description, around 150-160 characters.",
        },
        "openGraph": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string"},
                "description": {"type": "string"},
                "url": {"type": "string"},
            },
        },
        "twitterCard": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "card": {
                    "type": "string",
                    "enum": ["summary", "summary_large_image"],
                },
                "title": {"type": "string"},
                "description": {"type": "string"},
            },
        },
        "structuredData": {
            "type": "object",
            "description": "JSON-LD object. Only when structured data is requested.",
        },
        "robots": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "index": {"type": "string", "enum": ["index", "noindex"]},
                "follow": {"type": "string", "enum": ["follow", "nofollow"]},
            },
        },
    },
}


class GenerateSeoMetadataRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)
    seed: str = Field(min_length=1, max_length=MAX_BLOCK_CHARS)
    model_name: str | None = Field(default=None, max_length=120)
    article_title: str | None = Field(
        default=None,
        max_length=MAX_ARTICLE_TITLE_CHARS,
    )
    article_context: str | None = Field(
        default=None,
        max_length=MAX_ARTICLE_CONTEXT_CHARS,
    )


class GenerateSeoMetadataResponse(BaseModel):
    seo_patch: dict[str, Any]
    model_used: str


def _generate_seo_metadata_impl(
    request: GenerateSeoMetadataRequest,
) -> GenerateSeoMetadataResponse:
    prompt = request.prompt.strip()
    seed = request.seed.strip()
    article_title = (
        request.article_title.strip() if request.article_title else "Untitled article"
    )
    article_context = request.article_context.strip() if request.article_context else ""

    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    if not seed:
        raise HTTPException(status_code=400, detail="seed is required")

    model_used = (
        (request.model_name or SEO_STRUCTURED_DEFAULT_MODEL).strip()
        or SEO_STRUCTURED_DEFAULT_MODEL
    )

    llm_prompt = (
        f"{prompt}\n\n"
        f"Article title (reference only):\n{article_title}\n\n"
    )
    if article_context:
        llm_prompt += (
            "Full article context (reference only, source of truth for facts):\n"
            "<<<ARTICLE_CONTEXT>>>\n"
            f"{article_context}\n"
            "<<<END_ARTICLE_CONTEXT>>>\n\n"
        )
    llm_prompt += (
        "Current SEO metadata (seed values, JSON):\n"
        "<<<CURRENT_SEO>>>\n"
        f"{seed}\n"
        "<<<END_CURRENT_SEO>>>\n\n"
        f"Respond by calling the {SEO_PATCH_TOOL_NAME} tool with only the "
        "requested fields filled in. Omit every field the instruction does "
        "not ask for."
    )

    try:
        structured_result = invoke_anthropic_structured(
            prompt=llm_prompt,
            model_name=model_used,
            tool_name=SEO_PATCH_TOOL_NAME,
            tool_description=(
                "Emit the generated SEO metadata patch. Include only the "
                "fields the editor instruction requested."
            ),
            input_schema=SEO_PATCH_INPUT_SCHEMA,
            max_tokens=4096,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist generate-seo failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI SEO generation request failed",
        ) from exc

    if not structured_result.payload:
        raise HTTPException(
            status_code=502, detail="AI SEO generation returned an empty patch"
        )

    return GenerateSeoMetadataResponse(
        seo_patch=structured_result.payload,
        model_used=structured_result.model_name,
    )


@router.post("/generate-seo-metadata", response_model=GenerateSeoMetadataResponse)
async def generate_seo_metadata(
    request: GenerateSeoMetadataRequest,
) -> GenerateSeoMetadataResponse:
    try:
        return run_editor_assist_generate_seo_graph(
            step_runner=lambda: _generate_seo_metadata_impl(request),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist generate-seo graph failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI SEO generation graph failed",
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
