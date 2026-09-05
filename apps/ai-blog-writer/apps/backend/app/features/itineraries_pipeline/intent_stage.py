"""Intent-extraction stage for Itinerary Autobuild."""

from __future__ import annotations

from model_gateway import model_for

import time

from .llm_stages import extract_intent
from .pipeline_state import ItineraryState
from .reporting import elapsed_ms
from .schemas import AutobuildStepEvent

# Intent is a small structured extraction with no reader-facing prose.
# What the trace shows the operator, resolved rather than recited: the
# dashboard can change this job's model, and a step event naming a stale
# constant would be a confident lie about what just ran.
JOB = "itinerary.intent"


async def extract_request_intent(state: ItineraryState) -> ItineraryState:
    request = state["request"]
    started = time.perf_counter()
    trace: dict[str, str] = {}
    intent = extract_intent(
        title=request.title,
        brief=request.brief,
        location=request.location,
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
            model=model_for(JOB),
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
