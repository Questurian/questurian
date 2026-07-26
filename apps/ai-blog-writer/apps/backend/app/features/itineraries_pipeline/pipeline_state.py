"""Runtime state shared by the Itinerary Autobuild graph stages."""

from __future__ import annotations

from typing import TypedDict

from .schemas import (
    AutobuildStepEvent,
    Candidate,
    Category,
    DayShell,
    GenerateItineraryRequest,
    GenerateItineraryResponse,
    IntentSpec,
    PlanStop,
    ScoredCandidate,
    SlotIssue,
)


class ItineraryState(TypedDict, total=False):
    request: GenerateItineraryRequest
    model_name: str
    intent: IntentSpec
    candidates_by_cat: dict[Category, list[Candidate]]
    anchor: ScoredCandidate | None
    day_shells: list[DayShell]
    plan_days_stops: list[list[PlanStop]]
    slot_issues: list[SlotIssue]
    steps: list[AutobuildStepEvent]
    response: GenerateItineraryResponse
