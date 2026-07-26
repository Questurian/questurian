"""Traveler Profile brief composition."""

import logging

from fastapi import HTTPException

from app.shared.text import normalize_dashes
from app.shared.writer_invocation import WriterModelError

from .contracts import DEFAULT_MODEL
from .dependencies import EditorAssistDependencies
from .itinerary_composition_contracts import (
    MAX_PROFILE_OPTION_CHARS,
    ComposeItineraryBriefRequest,
    ComposeItineraryBriefResponse,
)

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

    profile_lines = [
        f"{label}: {', '.join(values)}" for label, values in sections.items() if values
    ]
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
