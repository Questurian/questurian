"""Itinerary Autobuild orchestration — a linear LangGraph over the six stages
(ADR 0014): intent → retrieve → score → select → order → reasons.

Synchronous for v1 (no checkpointing/run storage); the stage boundaries are the
seam for promoting this to the async run-based pattern later without changing
the stage logic.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, TypedDict

from .llm_stages import extract_intent, score_candidates, write_reasons
from .ordering import Coord, order_day
from .retrieval import fetch_candidates
from .schemas import (
    CATEGORY_TO_BLOCK_TYPE,
    Candidate,
    Category,
    GenerateItineraryRequest,
    GenerateItineraryResponse,
    IntentSpec,
    PlanDay,
    PlanLodging,
    PlanStop,
    ScoredCandidate,
)
from .selection import distribute_across_days, pick_lodging_anchor, select_stops

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.5-flash-lite"

# Per-stage models: keep the premium writer (Opus, from the request) only on the
# quality-critical reasons/overview stage that seeds the blurb writer. Intent
# extraction and fit-scoring are structured/judgment work with no prose output
# and run on cheaper Gemini — scoring fans out per category and dominates token
# volume, so it stays off the expensive model deliberately.
INTENT_MODEL = "gemini-2.5-flash-lite"  # trivial JSON extraction
SCORING_MODEL = "gemini-2.5-flash"  # per-category judgment over the full candidate list


class ItineraryState(TypedDict, total=False):
    request: GenerateItineraryRequest
    model_name: str
    intent: IntentSpec
    candidates_by_cat: dict[Category, list[Candidate]]
    scored_by_cat: dict[Category, list[ScoredCandidate]]
    anchor: ScoredCandidate | None
    ordered_days: list[list[ScoredCandidate]]
    response: GenerateItineraryResponse


def _anchor_coord(anchor: ScoredCandidate | None) -> Coord | None:
    if anchor is None:
        return None
    c = anchor.candidate
    if c.latitude is None or c.longitude is None:
        return None
    return (c.latitude, c.longitude)


async def _node_intent(state: ItineraryState) -> ItineraryState:
    req = state["request"]
    state["intent"] = extract_intent(
        title=req.title, brief=req.brief, location=req.location, model_name=INTENT_MODEL
    )
    return state


async def _node_retrieve(state: ItineraryState) -> ItineraryState:
    req = state["request"]
    intent = state["intent"]
    categories: list[Category] = list(intent.categories)
    if intent.wants_lodging and "accommodations" not in categories:
        categories.append("accommodations")

    results = await asyncio.gather(
        *(
            fetch_candidates(
                category=cat,
                location_key=req.location,
                shared_neighborhoods=req.shared_neighborhoods,
                jwt_token=req.payload_jwt,
            )
            for cat in categories
        )
    )
    state["candidates_by_cat"] = {cat: pool for cat, pool in zip(categories, results)}
    return state


async def _node_score(state: ItineraryState) -> ItineraryState:
    req = state["request"]
    intent = state["intent"]
    scored: dict[Category, list[ScoredCandidate]] = {}
    for cat, pool in state["candidates_by_cat"].items():
        scored[cat] = score_candidates(
            intent=intent, category=cat, candidates=pool, brief=req.brief, model_name=SCORING_MODEL
        )
    state["scored_by_cat"] = scored
    return state


async def _node_select(state: ItineraryState) -> ItineraryState:
    req = state["request"]
    intent = state["intent"]
    scored = state["scored_by_cat"]

    anchor = pick_lodging_anchor(scored.get("accommodations", [])) if intent.wants_lodging else None
    total_slots = intent.stops_per_day * req.day_count
    stops = select_stops(scored, intent, total_slots)
    day_lists = distribute_across_days(stops, req.day_count)

    anchor_coord = _anchor_coord(anchor)
    ordered_days: list[list[ScoredCandidate]] = []
    for day in day_lists:
        ordered_candidates = order_day([s.candidate for s in day], anchor_coord)
        by_id = {s.candidate.id: s for s in day}
        ordered_days.append([by_id[c.id] for c in ordered_candidates if c.id in by_id])

    state["anchor"] = anchor
    state["ordered_days"] = ordered_days
    return state


async def _node_reasons(state: ItineraryState) -> ItineraryState:
    req = state["request"]
    anchor = state.get("anchor")
    ordered_days = state["ordered_days"]

    # Build provisional stops first (reasons need stable ids + titles).
    days_stops: list[list[PlanStop]] = []
    for day in ordered_days:
        stops: list[PlanStop] = []
        for s in day:
            c = s.candidate
            stops.append(
                PlanStop(
                    block_type=CATEGORY_TO_BLOCK_TYPE[c.category],
                    collection=c.category,
                    item=c.id,
                    title=c.title,
                    selection_reason=s.fit_note,
                )
            )
        days_stops.append(stops)

    reasons, overview = write_reasons(
        title=req.title,
        brief=req.brief,
        lodging=anchor,
        days=days_stops,
        model_name=state["model_name"],
    )

    notes: list[str] = []
    plan_days: list[PlanDay] = []
    for day_index, stops in enumerate(days_stops):
        for stop in stops:
            stop.selection_reason = reasons.get(stop.item, stop.selection_reason)
        lodging_rows: list[PlanLodging] = []
        if day_index == 0:  # single anchor for the whole trip (v1)
            if anchor is not None:
                ac = anchor.candidate
                lodging_rows.append(
                    PlanLodging(
                        item=ac.id,
                        title=ac.title,
                        selection_reason=reasons.get(ac.id, anchor.fit_note),
                    )
                )
            elif state["intent"].wants_lodging:
                notes.append("No suitable accommodation found for this location; day starts from the first stop.")
        plan_days.append(PlanDay(where_staying=lodging_rows, items=stops))

    state["response"] = GenerateItineraryResponse(
        days=plan_days,
        plan_overview=overview,
        model_used=state["model_name"],
        notes=notes,
    )
    return state


def _build_graph():
    from langgraph.graph import END, START, StateGraph

    builder = StateGraph(ItineraryState)
    builder.add_node("intent", _node_intent)
    builder.add_node("retrieve", _node_retrieve)
    builder.add_node("score", _node_score)
    builder.add_node("select", _node_select)
    builder.add_node("reasons", _node_reasons)
    builder.add_edge(START, "intent")
    builder.add_edge("intent", "retrieve")
    builder.add_edge("retrieve", "score")
    builder.add_edge("score", "select")
    builder.add_edge("select", "reasons")
    builder.add_edge("reasons", END)
    return builder.compile()


async def run_itinerary_pipeline(request: GenerateItineraryRequest) -> GenerateItineraryResponse:
    model_name = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    graph = _build_graph()
    final_state: dict[str, Any] = await graph.ainvoke({"request": request, "model_name": model_name})
    return final_state["response"]
