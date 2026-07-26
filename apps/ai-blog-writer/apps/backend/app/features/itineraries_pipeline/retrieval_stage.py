"""Shell resolution and candidate retrieval for Itinerary Autobuild."""

from __future__ import annotations

import asyncio
import time

from .pipeline_state import ItineraryState
from .reporting import elapsed_ms
from .retrieval import fetch_candidates
from .schemas import (
    AutobuildStepEvent,
    Category,
    DayShell,
    GenerateItineraryRequest,
)


def resolve_day_shells(request: GenerateItineraryRequest) -> list[DayShell]:
    """Resolve the request's explicit shell snapshot into day order."""
    by_day = {entry.day_index: entry for entry in request.day_shells}
    return [
        DayShell(
            id=selection.shell_id,
            name=selection.shell_name or selection.shell_id,
            description=selection.shell_description or "",
            slots=selection.slots,
        )
        for selection in (by_day[day_index] for day_index in range(request.day_count))
    ]


def categories_for_shells(day_shells: list[DayShell]) -> list[Category]:
    """Return required collections in their first shell-slot order."""
    categories: list[Category] = []
    for shell in day_shells:
        for slot in shell.slots:
            for category in slot.acceptable_collections:
                if category not in categories:
                    categories.append(category)
    return categories


async def retrieve_candidates(state: ItineraryState) -> ItineraryState:
    request = state["request"]
    started = time.perf_counter()
    day_shells = resolve_day_shells(request)
    state["day_shells"] = day_shells

    categories = categories_for_shells(day_shells)
    if request.include_lodging and "accommodations" not in categories:
        categories.append("accommodations")

    results = await asyncio.gather(
        *(
            fetch_candidates(
                category=category,
                location_key=request.location,
                shared_neighborhoods=request.shared_neighborhoods,
                jwt_token=request.payload_jwt,
            )
            for category in categories
        )
    )
    state["candidates_by_cat"] = {
        category: pool for category, pool in zip(categories, results)
    }

    counts = {
        category: len(pool) for category, pool in state["candidates_by_cat"].items()
    }
    empty = sorted(category for category, count in counts.items() if count == 0)
    state.setdefault("steps", []).append(
        AutobuildStepEvent(
            name="retrieve",
            label="Candidates retrieved",
            status="warning" if empty else "ok",
            duration_ms=elapsed_ms(started),
            details={
                "counts_by_collection": counts,
                **({"empty_collections": empty} if empty else {}),
            },
        )
    )
    return state
