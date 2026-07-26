"""Itinerary Composition for Traveler Profiles, Intros, blurbs, and Selection Reasons."""

import logging
import re
import time
from typing import Annotated, Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.shared.prompts import ANTI_AI_TELLS_BLURB, ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown, normalize_dashes
from app.shared.writer_invocation import WriterModelError

from .contracts import (
    DEFAULT_MODEL,
    MAX_ARTICLE_TITLE_CHARS,
    ListTone,
)
from .dependencies import EditorAssistDependencies, get_editor_assist_dependencies
from .listicle_writer import (
    BLURB_MAX_WORDS,
    BLURB_MIN_WORDS,
    LIST_TONE_GUIDANCE,
    LISTICLE_ANGLE_GUIDANCE,
    strip_generation_fence,
    validate_generated_text,
)

router = APIRouter()
logger = logging.getLogger(__name__)

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
    traveler_types: list[str] = Field(
        default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION
    )
    motivations: list[str] = Field(
        default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION
    )
    interests: list[str] = Field(
        default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION
    )
    budget: str | None = Field(default=None, max_length=8)
    accommodations: list[str] = Field(
        default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION
    )
    practical_needs: list[str] = Field(
        default_factory=list, max_length=MAX_PROFILE_OPTIONS_PER_SECTION
    )
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
    dependencies: EditorAssistDependencies,
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

    llm_prompt = f"{COMPOSE_BRIEF_PROMPT}\n\nTraveler Profile:\n" + "\n".join(
        profile_lines
    )
    if context_lines:
        llm_prompt += "\n\nTrip context:\n" + "\n".join(context_lines)

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    try:
        writer_result = dependencies.invoke_writer(
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
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> ComposeItineraryBriefResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_compose_itinerary_brief",
            step_runner=lambda: _compose_itinerary_brief_impl(request, dependencies),
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
    dependencies: EditorAssistDependencies,
) -> ComposeItineraryIntroResponse:
    article_title = request.article_title.strip()
    location_label = request.location_label.strip()

    if not article_title:
        raise HTTPException(status_code=400, detail="article_title is required")
    if not location_label:
        raise HTTPException(status_code=400, detail="location_label is required")

    stop_lines = [
        _format_intro_stop_line(stop) for stop in request.stops if stop.title.strip()
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
    tone_guidance = (
        LIST_TONE_GUIDANCE.get(request.list_tone) if request.list_tone else None
    )
    if tone_guidance:
        context_lines.append(f"Tone — {request.list_tone}: {tone_guidance}")
    plan_overview = (request.plan_overview or "").strip()
    if plan_overview:
        context_lines.append(f"Internal plan overview (the spine): {plan_overview}")

    llm_prompt = (
        f"{COMPOSE_INTRO_PROMPT}\n\n"
        + "Trip context:\n"
        + "\n".join(context_lines)
        + "\n\nItinerary stops (in order):\n"
        + "\n".join(stop_lines)
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
        writer_result = dependencies.invoke_writer(
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
        repair=lambda repair_prompt: dependencies.invoke_writer(
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

    return ComposeItineraryIntroResponse(
        intro=intro, model_used=model_used, steps=steps
    )


@router.post("/compose-itinerary-intro", response_model=ComposeItineraryIntroResponse)
async def compose_itinerary_intro(
    request: ComposeItineraryIntroRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> ComposeItineraryIntroResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_compose_itinerary_intro",
            step_runner=lambda: _compose_itinerary_intro_impl(request, dependencies),
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
    angle_suffix = (
        f"\n    Angle — {angle}: {angle_guidance}"
        if angle_guidance
        else (f"\n    Angle: {angle}" if angle else "")
    )
    reason = (stop.selection_reason or "").strip()
    reason_suffix = f"\n    Why this pick: {reason}" if reason else ""
    return (
        f"{index}. id={stop.target_id} [TO WRITE] {prefix}{title}"
        f"{angle_suffix}{reason_suffix}"
    )


def _compose_day_blurbs_impl(
    request: ComposeDayBlurbsRequest,
    dependencies: EditorAssistDependencies,
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
    tone_guidance = (
        LIST_TONE_GUIDANCE.get(request.list_tone) if request.list_tone else None
    )
    if tone_guidance:
        context_lines.append(f"Tone — {request.list_tone}: {tone_guidance}")
    intro_text = (request.intro or "").strip()
    if intro_text:
        context_lines.append(
            f"Article intro (already written, for framing): {intro_text}"
        )
    plan_overview = (request.plan_overview or "").strip()
    if plan_overview:
        context_lines.append(f"Internal plan overview (the spine): {plan_overview}")
    if request.prev_day_last_stop:
        prev = request.prev_day_last_stop
        cat = (
            f" ({prev.category.strip()})"
            if prev.category and prev.category.strip()
            else ""
        )
        context_lines.append(
            f"Previous day ended at (context only, do not write): {prev.title.strip()}{cat}"
        )
    if request.next_day_first_stop:
        nxt = request.next_day_first_stop
        cat = (
            f" ({nxt.category.strip()})"
            if nxt.category and nxt.category.strip()
            else ""
        )
        context_lines.append(
            f"Next day opens at (context only, do not write): {nxt.title.strip()}{cat}"
        )

    stop_lines = [
        _format_day_blurb_stop_line(index + 1, stop, stop.target_id in write_ids)
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
        writer_result = dependencies.invoke_writer(
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
                "AI day-blurb composition request failed " f"(error {error_id}): {exc}"
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
            repair=lambda repair_prompt: dependencies.invoke_writer(
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

    return ComposeDayBlurbsResponse(model_used=model_used, results=results, steps=steps)


@router.post("/compose-itinerary-day-blurbs", response_model=ComposeDayBlurbsResponse)
async def compose_itinerary_day_blurbs(
    request: ComposeDayBlurbsRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> ComposeDayBlurbsResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_compose_itinerary_day_blurbs",
            step_runner=lambda: _compose_day_blurbs_impl(request, dependencies),
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
    dependencies: EditorAssistDependencies,
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
            f"Editorial angle — {angle}: {angle_guidance}"
            if angle_guidance
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
        + "Context:\n"
        + "\n".join(context_lines)
        + f"\n\nOperator's rough note:\n{rough_reason}"
    )

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    try:
        writer_result = dependencies.invoke_writer(
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


@router.post("/compose-itinerary-stop-reason", response_model=ComposeStopReasonResponse)
async def compose_itinerary_stop_reason(
    request: ComposeStopReasonRequest,
    dependencies: Annotated[
        EditorAssistDependencies, Depends(get_editor_assist_dependencies)
    ],
) -> ComposeStopReasonResponse:
    try:
        return dependencies.run_graph(
            node_name="editor_assist_compose_itinerary_stop_reason",
            step_runner=lambda: _compose_stop_reason_impl(request, dependencies),
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
