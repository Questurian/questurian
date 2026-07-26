"""Lodging Anchor scoring, selection, and report evidence."""

from __future__ import annotations

import time
from typing import Any

from .candidate_scoring import SCORING_MODEL, score_for_slot
from .pipeline_state import ItineraryState
from .reporting import elapsed_ms
from .schemas import (
    AutobuildStepEvent,
    IntentSpec,
    MIN_SLOT_FIT_SCORE,
    ScoredCandidate,
    ShellSlot,
)
from .selection import pick_lodging_anchor


def _lodging_slot(intent: IntentSpec) -> ShellSlot:
    return ShellSlot(
        id="lodging_anchor",
        label="Lodging anchor",
        daypart="evening",
        acceptable_collections=["accommodations"],
        preferred_collections=["accommodations"],
        intent_tags=["hotel", "lodging", *intent.lodging_keywords],
    )


def select_lodging(state: ItineraryState) -> ScoredCandidate | None:
    request = state["request"]
    steps = state.setdefault("steps", [])
    if not request.include_lodging:
        steps.append(
            AutobuildStepEvent(
                name="lodging",
                label="Lodging anchor",
                status="ok",
                details={
                    "skipped": True,
                    "reason": "Lodging excluded by operator setting.",
                },
            )
        )
        return None

    started = time.perf_counter()
    lodging_pool = state["candidates_by_cat"].get("accommodations", [])
    scores = score_for_slot(
        intent=state["intent"],
        slot=_lodging_slot(state["intent"]),
        candidates=lodging_pool,
        brief=request.brief,
    )
    # An opted-in Lodging Anchor always ships when any scored candidate exists,
    # even below the regular slot threshold.
    anchor = pick_lodging_anchor(scores.scored)
    low_fit = anchor is not None and anchor.fit_score < MIN_SLOT_FIT_SCORE
    details: dict[str, Any] = {"pool_size": len(lodging_pool)}
    if anchor is not None:
        details["winner"] = {
            "id": anchor.candidate.id,
            "title": anchor.candidate.title,
            "fit_score": anchor.fit_score,
            "fit_note": anchor.fit_note,
        }
        details["top_candidates"] = scores.top()
        if low_fit:
            details["low_fit"] = True
            details["min_slot_fit_score"] = MIN_SLOT_FIT_SCORE
    else:
        details["issue"] = (
            "No accommodations available for this location."
            if not lodging_pool
            else "Scoring produced no usable accommodation."
        )
    steps.append(
        AutobuildStepEvent(
            name="lodging",
            label="Lodging anchor",
            status="failed" if anchor is None else ("warning" if low_fit else "ok"),
            duration_ms=elapsed_ms(started),
            model=SCORING_MODEL if lodging_pool else None,
            prompt=scores.prompt,
            output=scores.output,
            details=details,
        )
    )
    return anchor
