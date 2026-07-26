"""Selection-reason writing and response assembly for Itinerary Autobuild."""

from __future__ import annotations

import time

from .llm_stages import write_reasons
from .pipeline_state import ItineraryState
from .reporting import elapsed_ms
from .schemas import (
    AutobuildStepEvent,
    GenerateItineraryResponse,
    MIN_SLOT_FIT_SCORE,
    PlanDay,
    PlanLodging,
)


def _reason_for(
    reasons: dict[str, str],
    *,
    collection: str,
    item: int,
    fallback: str,
) -> str:
    return reasons.get(f"{collection}:{item}", reasons.get(str(item), fallback))


async def write_selection_reasons(state: ItineraryState) -> ItineraryState:
    request = state["request"]
    anchor = state.get("anchor")
    days_stops = state["plan_days_stops"]
    steps = state.setdefault("steps", [])

    started = time.perf_counter()
    trace: dict[str, str] = {}
    reasons, overview = write_reasons(
        title=request.title,
        brief=request.brief,
        lodging=anchor,
        days=days_stops,
        model_name=state["model_name"],
        trace=trace,
    )
    stop_count = sum(len(stops) for stops in days_stops) + (
        1 if anchor is not None else 0
    )
    steps.append(
        AutobuildStepEvent(
            name="reasons",
            label="Selection reasons written",
            status="ok" if reasons or stop_count == 0 else "warning",
            duration_ms=elapsed_ms(started),
            model=state["model_name"],
            prompt=trace.get("prompt"),
            output=trace.get("output"),
            details={
                "stops_to_explain": stop_count,
                "reasons_written": len(reasons),
                "overview_written": bool(overview),
                **(
                    {}
                    if reasons or stop_count == 0
                    else {"note": "Reason writing failed; fit notes used as fallback."}
                ),
            },
        )
    )

    notes: list[str] = []
    plan_days: list[PlanDay] = []
    for day_index, stops in enumerate(days_stops):
        for stop in stops:
            stop.selection_reason = _reason_for(
                reasons,
                collection=stop.collection,
                item=stop.item,
                fallback=stop.selection_reason,
            )

        lodging_rows: list[PlanLodging] = []
        if day_index == 0:
            if anchor is not None:
                accommodation = anchor.candidate
                lodging_rows.append(
                    PlanLodging(
                        item=accommodation.id,
                        title=accommodation.title,
                        selection_reason=_reason_for(
                            reasons,
                            collection="accommodations",
                            item=accommodation.id,
                            fallback=anchor.fit_note,
                        ),
                    )
                )
                if anchor.fit_score < MIN_SLOT_FIT_SCORE:
                    notes.append(
                        f"Lodging anchor '{accommodation.title}' scored below "
                        f"the fit threshold ({anchor.fit_score} < "
                        f"{MIN_SLOT_FIT_SCORE}); review the pick."
                    )
            elif request.include_lodging:
                notes.append(
                    "No suitable accommodation found for this location; "
                    "day starts from the first stop."
                )

        shell = state["day_shells"][day_index]
        plan_days.append(
            PlanDay(
                shell_id=shell.id,
                shell_name=shell.name,
                where_staying=lodging_rows,
                items=stops,
            )
        )

    state["response"] = GenerateItineraryResponse(
        days=plan_days,
        plan_overview=overview,
        model_used=state["model_name"],
        notes=notes,
        slot_issues=state.get("slot_issues", []),
        steps=steps,
    )
    return state
