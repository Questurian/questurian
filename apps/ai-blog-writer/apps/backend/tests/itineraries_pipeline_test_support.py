"""Shared factories for Itinerary Autobuild unit tests."""

from __future__ import annotations

import asyncio
import sys
import types

# Importing the pipeline package loads routes and their LLM dependencies. Keep
# deterministic unit tests independent from Vertex/LangChain.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
utils_stub.invoke_vertex_multimodal_text = lambda *args, **kwargs: ""
utils_stub.parse_json_response = lambda *args, **kwargs: {}
utils_stub.vertex_part_from_data = lambda *args, **kwargs: None
sys.modules.setdefault("utils", utils_stub)

from app.features.itineraries_pipeline.schemas import (  # noqa: E402
    Candidate,
    DayShellSelection,
    GenerateItineraryRequest,
    IntentSpec,
    ScoredCandidate,
)


def candidate(
    item_id: int,
    category: str = "dining",
    latitude: float | None = None,
    longitude: float | None = None,
    neighborhood_key: str | None = None,
) -> Candidate:
    return Candidate(
        id=item_id,
        title=f"c{item_id}",
        category=category,
        latitude=latitude,
        longitude=longitude,
        neighborhood_key=neighborhood_key,
    )


def scored_candidate(
    item_id: int,
    fit_score: int,
    category: str = "dining",
    latitude: float | None = None,
    longitude: float | None = None,
    neighborhood_key: str | None = None,
) -> ScoredCandidate:
    return ScoredCandidate(
        candidate=candidate(
            item_id,
            category,
            latitude,
            longitude,
            neighborhood_key,
        ),
        fit_score=fit_score,
    )


def slot(
    slot_id: str,
    daypart: str,
    collections: list[str],
    tags: list[str],
) -> dict:
    return {
        "id": slot_id,
        "label": slot_id.replace("_", " ").capitalize(),
        "daypart": daypart,
        "acceptable_collections": collections,
        "preferred_collections": collections[:1],
        "intent_tags": tags,
    }


def shell_selection(
    day_index: int,
    shell_id: str,
    slots: list[dict],
    **kwargs,
) -> DayShellSelection:
    return DayShellSelection(
        day_index=day_index,
        shell_id=shell_id,
        slots=slots,
        **kwargs,
    )


def itinerary_request(
    day_count: int,
    day_shells: list[DayShellSelection],
) -> GenerateItineraryRequest:
    return GenerateItineraryRequest(
        location="peru|lima",
        title="Lima days",
        brief="coffee, culture, tasting night",
        day_count=day_count,
        payload_jwt="token",
        day_shells=day_shells,
    )


def single_dinner_request() -> GenerateItineraryRequest:
    return itinerary_request(
        1,
        [
            shell_selection(
                0,
                "shell",
                [slot("dinner", "dinner", ["dining"], [])],
            )
        ],
    )


def selection_state(
    request: GenerateItineraryRequest,
    accommodations: list[Candidate],
):
    from app.features.itineraries_pipeline.retrieval_stage import resolve_day_shells

    return {
        "request": request,
        "intent": IntentSpec(),
        "candidates_by_cat": {
            "dining": [candidate(1)],
            "accommodations": accommodations,
        },
        "day_shells": resolve_day_shells(request),
    }


def run_selection(state, monkeypatch, scored_by_pool):
    from app.features.itineraries_pipeline import lodging_selection, selection_stage
    from app.features.itineraries_pipeline.candidate_scoring import CandidateScores

    def fake_score(*, intent, slot, candidates, brief):
        return CandidateScores(
            scored=scored_by_pool(slot, candidates),
            prompt="p",
            output="o",
        )

    monkeypatch.setattr(selection_stage, "score_for_slot", fake_score)
    monkeypatch.setattr(lodging_selection, "score_for_slot", fake_score)
    return asyncio.run(selection_stage.score_and_select_slots(state))
