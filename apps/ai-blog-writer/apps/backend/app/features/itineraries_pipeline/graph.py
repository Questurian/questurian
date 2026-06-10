"""Itinerary Autobuild orchestration — a linear LangGraph over the shell-first
stages: intent → retrieve → slot-score/select → reasons.

Synchronous for v1 (no checkpointing/run storage); the stage boundaries are the
seam for promoting this to the async run-based pattern later without changing
the stage logic.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, TypedDict

from .day_shells import BUILT_IN_DAY_SHELLS, DEFAULT_DAY_SHELL_ID
from .llm_stages import extract_intent, score_candidates, write_reasons
from .retrieval import fetch_candidates
from .schemas import (
    CATEGORY_TO_BLOCK_TYPE,
    Candidate,
    Category,
    DayShell,
    DayShellSelection,
    GenerateItineraryRequest,
    GenerateItineraryResponse,
    IntentSpec,
    MIN_SLOT_FIT_SCORE,
    PlanDay,
    PlanLodging,
    PlanStop,
    ScoredCandidate,
    ShellSlot,
    SlotIssue,
)
from .selection import pick_lodging_anchor

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
    anchor: ScoredCandidate | None
    day_shells: list[DayShell]
    plan_days_stops: list[list[PlanStop]]
    slot_issues: list[SlotIssue]
    response: GenerateItineraryResponse


async def _node_intent(state: ItineraryState) -> ItineraryState:
    req = state["request"]
    state["intent"] = extract_intent(
        title=req.title, brief=req.brief, location=req.location, model_name=INTENT_MODEL
    )
    return state


async def _node_retrieve(state: ItineraryState) -> ItineraryState:
    req = state["request"]
    intent = state["intent"]
    day_shells = _resolve_day_shells(req)
    state["day_shells"] = day_shells

    categories = _categories_for_shells(day_shells)
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
    # Slot scoring happens during selection because each Shell Slot has its own
    # collection and intent constraints.
    return state


async def _node_select(state: ItineraryState) -> ItineraryState:
    req = state["request"]
    intent = state["intent"]
    candidates_by_cat = state["candidates_by_cat"]

    anchor = None
    if intent.wants_lodging:
        lodging_pool = candidates_by_cat.get("accommodations", [])
        lodging_slot = ShellSlot(
            id="lodging_anchor",
            label="Lodging anchor",
            daypart="evening",
            acceptable_collections=["accommodations"],
            preferred_collections=["accommodations"],
            intent_tags=["hotel", "lodging", *intent.lodging_keywords],
        )
        scored_lodging = score_candidates(
            intent=intent,
            slot=lodging_slot,
            candidates=lodging_pool,
            brief=req.brief,
            model_name=SCORING_MODEL,
        )
        anchor = pick_lodging_anchor(scored_lodging)

    seen: set[tuple[Category, int]] = set()
    plan_days_stops: list[list[PlanStop]] = []
    slot_issues: list[SlotIssue] = []
    for day_index, shell in enumerate(state["day_shells"]):
        day_stops: list[PlanStop] = []
        for slot in shell.slots:
            pool = _pool_for_slot(slot, candidates_by_cat, seen)
            if not pool:
                if slot.required:
                    slot_issues.append(_slot_issue(day_index, shell, slot, "No candidates available for this slot."))
                continue

            scored = score_candidates(
                intent=intent,
                slot=slot,
                candidates=pool,
                brief=req.brief,
                model_name=SCORING_MODEL,
            )
            best = max(scored, key=lambda s: s.fit_score, default=None)
            if best is None or best.fit_score < MIN_SLOT_FIT_SCORE:
                if slot.required:
                    slot_issues.append(
                        _slot_issue(
                            day_index,
                            shell,
                            slot,
                            f"No candidate met the minimum fit score ({MIN_SLOT_FIT_SCORE}) for this slot.",
                        )
                    )
                continue

            c = best.candidate
            seen.add((c.category, c.id))
            day_stops.append(
                PlanStop(
                    slot_id=slot.id,
                    slot_label=slot.label,
                    daypart=slot.daypart,
                    block_type=CATEGORY_TO_BLOCK_TYPE[c.category],
                    collection=c.category,
                    item=c.id,
                    title=c.title,
                    selection_reason=f"{slot.label}: {best.fit_note}".strip(),
                )
            )
        plan_days_stops.append(day_stops)

    state["anchor"] = anchor
    state["plan_days_stops"] = plan_days_stops
    state["slot_issues"] = slot_issues
    return state


async def _node_reasons(state: ItineraryState) -> ItineraryState:
    req = state["request"]
    anchor = state.get("anchor")
    days_stops = state["plan_days_stops"]

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
            stop.selection_reason = reasons.get(f"{stop.collection}:{stop.item}", reasons.get(str(stop.item), stop.selection_reason))
        lodging_rows: list[PlanLodging] = []
        if day_index == 0:  # single anchor for the whole trip (v1)
            if anchor is not None:
                ac = anchor.candidate
                lodging_rows.append(
                    PlanLodging(
                        item=ac.id,
                        title=ac.title,
                        selection_reason=reasons.get(f"accommodations:{ac.id}", reasons.get(str(ac.id), anchor.fit_note)),
                    )
                )
            elif state["intent"].wants_lodging:
                notes.append("No suitable accommodation found for this location; day starts from the first stop.")
        shell = state["day_shells"][day_index]
        plan_days.append(PlanDay(shell_id=shell.id, shell_name=shell.name, where_staying=lodging_rows, items=stops))

    state["response"] = GenerateItineraryResponse(
        days=plan_days,
        plan_overview=overview,
        model_used=state["model_name"],
        notes=notes,
        slot_issues=state.get("slot_issues", []),
    )
    return state


def _resolve_day_shells(req: GenerateItineraryRequest) -> list[DayShell]:
    by_day: dict[int, DayShellSelection] = {entry.day_index: entry for entry in req.day_shells}
    shells: list[DayShell] = []
    for day_index in range(req.day_count):
        selection = by_day.get(day_index)
        if selection is not None and selection.slots:
            shells.append(
                DayShell(
                    id=selection.shell_id,
                    name=BUILT_IN_DAY_SHELLS.get(selection.shell_id, BUILT_IN_DAY_SHELLS[DEFAULT_DAY_SHELL_ID]).name,
                    slots=selection.slots,
                )
            )
            continue
        shell_id = selection.shell_id if selection is not None else DEFAULT_DAY_SHELL_ID
        shells.append(BUILT_IN_DAY_SHELLS.get(shell_id, BUILT_IN_DAY_SHELLS[DEFAULT_DAY_SHELL_ID]))
    return shells


def _categories_for_shells(day_shells: list[DayShell]) -> list[Category]:
    categories: list[Category] = []
    for shell in day_shells:
        for slot in shell.slots:
            for category in slot.acceptable_collections:
                if category not in categories:
                    categories.append(category)
    return categories


def _pool_for_slot(
    slot: ShellSlot,
    candidates_by_cat: dict[Category, list[Candidate]],
    seen: set[tuple[Category, int]],
) -> list[Candidate]:
    pool: list[Candidate] = []
    for category in slot.acceptable_collections:
        for candidate in candidates_by_cat.get(category, []):
            if (candidate.category, candidate.id) not in seen:
                pool.append(candidate)
    return pool


def _slot_issue(day_index: int, shell: DayShell, slot: ShellSlot, issue: str) -> SlotIssue:
    return SlotIssue(
        day_index=day_index,
        shell_id=shell.id,
        slot_id=slot.id,
        slot_label=slot.label,
        daypart=slot.daypart,
        issue=issue,
    )


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
