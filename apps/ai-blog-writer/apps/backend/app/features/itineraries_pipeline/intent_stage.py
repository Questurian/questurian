"""Intent-extraction stage for Itinerary Autobuild."""

from __future__ import annotations

import time

from .llm_stages import extract_intent
from .pipeline_state import ItineraryState
from .reporting import elapsed_ms
from .schemas import AutobuildStepEvent

# Intent is a small structured extraction with no reader-facing prose.
INTENT_MODEL = "gemini-2.5-flash-lite"


async def extract_request_intent(state: ItineraryState) -> ItineraryState:
    request = state["request"]
    started = time.perf_counter()
    trace: dict[str, str] = {}
    intent = extract_intent(
        title=request.title,
        brief=request.brief,
        location=request.location,
        model_name=INTENT_MODEL,
        trace=trace,
    )
    state["intent"] = intent
    extracted_anything = bool(
        intent.keywords
        or intent.lodging_keywords
        or intent.price_min
        or intent.price_max
    )
    state.setdefault("steps", []).append(
        AutobuildStepEvent(
            name="intent",
            label="Intent extracted",
            status="ok" if extracted_anything else "warning",
            duration_ms=elapsed_ms(started),
            model=INTENT_MODEL,
            prompt=trace.get("prompt"),
            output=trace.get("output"),
            details={
                "keywords": intent.keywords,
                "lodging_keywords": intent.lodging_keywords,
                "price_min": intent.price_min,
                "price_max": intent.price_max,
                **(
                    {}
                    if extracted_anything
                    else {"note": "No intent extracted; creative defaults in effect."}
                ),
            },
        )
    )
    return state
