"""Reader-facing itinerary intro composition."""

import logging
import time

from fastapi import HTTPException

from app.shared.prompts import ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown
from app.shared.writer_invocation import WriterModelError

from .contracts import DEFAULT_MODEL
from .dependencies import EditorAssistDependencies
from .itinerary_composition_contracts import (
    ComposeIntroStepEvent,
    ComposeItineraryIntroRequest,
    ComposeItineraryIntroResponse,
    ComposeItineraryIntroStop,
)
from .listicle_prompt_policy import LIST_TONE_GUIDANCE
from .listicle_writer_validation import strip_generation_fence

logger = logging.getLogger(__name__)

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
