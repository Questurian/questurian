"""Per-slot scoring and selection for Itinerary Autobuild."""

from __future__ import annotations

import time

from model_gateway import model_for

from .candidate_scoring import JOB as SCORING_JOB, score_for_slot
from .lodging_selection import select_lodging
from .pipeline_state import ItineraryState
from .reporting import elapsed_ms
from .schemas import (
    CATEGORY_TO_BLOCK_TYPE,
    AutobuildStepEvent,
    Candidate,
    Category,
    DayShell,
    IntentSpec,
    MIN_SLOT_FIT_SCORE,
    PlanStop,
    ShellSlot,
    SlotIssue,
)
from .slot_issues import SlotSelection, unfilled_slot


def candidate_pool_for_slot(
    slot: ShellSlot,
    candidates_by_category: dict[Category, list[Candidate]],
    seen: set[tuple[Category, int]],
) -> list[Candidate]:
    """Combine acceptable collections while excluding earlier itinerary picks."""
    return [
        candidate
        for category in slot.acceptable_collections
        for candidate in candidates_by_category.get(category, [])
        if (candidate.category, candidate.id) not in seen
    ]


def _select_slot(
    *,
    request_brief: str,
    intent: IntentSpec,
    day_index: int,
    shell: DayShell,
    slot: ShellSlot,
    pool: list[Candidate],
) -> SlotSelection:
    started = time.perf_counter()
    if not pool:
        issue_text = "No candidates available for this slot."
        return unfilled_slot(
            day_index=day_index,
            shell=shell,
            slot=slot,
            started=started,
            issue_text=issue_text,
            details={
                "pool_size": 0,
                "issue": issue_text,
                "acceptable_collections": list(slot.acceptable_collections),
            },
        )

    scores = score_for_slot(
        intent=intent,
        slot=slot,
        candidates=pool,
        brief=request_brief,
    )
    best = scores.best()
    if best is None or best.fit_score < MIN_SLOT_FIT_SCORE:
        issue_text = (
            "No candidate met the minimum fit score "
            f"({MIN_SLOT_FIT_SCORE}) for this slot."
        )
        return unfilled_slot(
            day_index=day_index,
            shell=shell,
            slot=slot,
            started=started,
            issue_text=issue_text,
            trace={
                key: value
                for key, value in (
                    ("prompt", scores.prompt),
                    ("output", scores.output),
                )
                if value is not None
            },
            details={
                "pool_size": len(pool),
                "issue": (
                    "No candidate met the minimum fit score " f"({MIN_SLOT_FIT_SCORE})."
                ),
                "min_slot_fit_score": MIN_SLOT_FIT_SCORE,
                "top_candidates": scores.top(),
            },
        )

    candidate = best.candidate
    return SlotSelection(
        stop=PlanStop(
            slot_id=slot.id,
            slot_label=slot.label,
            daypart=slot.daypart,
            block_type=CATEGORY_TO_BLOCK_TYPE[candidate.category],
            collection=candidate.category,
            item=candidate.id,
            title=candidate.title,
            selection_reason=f"{slot.label}: {best.fit_note}".strip(),
        ),
        issue=None,
        step=AutobuildStepEvent(
            name="slot",
            label=f"Day {day_index + 1} · {slot.label}",
            status="ok",
            duration_ms=elapsed_ms(started),
            day_index=day_index,
            slot_id=slot.id,
            model=model_for(SCORING_JOB),
            prompt=scores.prompt,
            output=scores.output,
            details={
                "pool_size": len(pool),
                "winner": {
                    "id": candidate.id,
                    "title": candidate.title,
                    "collection": candidate.category,
                    "fit_score": best.fit_score,
                    "fit_note": best.fit_note,
                },
                "top_candidates": scores.top(),
            },
        ),
    )


async def score_and_select_slots(state: ItineraryState) -> ItineraryState:
    """Score every requirement, select winners, and retain every failed slot."""
    anchor = select_lodging(state)
    seen: set[tuple[Category, int]] = set()
    plan_days_stops: list[list[PlanStop]] = []
    slot_issues: list[SlotIssue] = []
    steps = state.setdefault("steps", [])

    for day_index, shell in enumerate(state["day_shells"]):
        day_stops: list[PlanStop] = []
        for slot in shell.slots:
            result = _select_slot(
                request_brief=state["request"].brief,
                intent=state["intent"],
                day_index=day_index,
                shell=shell,
                slot=slot,
                pool=candidate_pool_for_slot(
                    slot,
                    state["candidates_by_cat"],
                    seen,
                ),
            )
            steps.append(result.step)
            if result.issue is not None:
                slot_issues.append(result.issue)
            if result.stop is not None:
                seen.add((result.stop.collection, result.stop.item))
                day_stops.append(result.stop)
        plan_days_stops.append(day_stops)

    state["anchor"] = anchor
    state["plan_days_stops"] = plan_days_stops
    state["slot_issues"] = slot_issues
    return state
