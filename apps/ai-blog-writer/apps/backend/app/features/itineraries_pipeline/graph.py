"""LangGraph assembly boundary for the Itinerary Autobuild stages."""

from __future__ import annotations

from typing import Any

from .candidate_scoring import defer_slot_scoring
from .intent_stage import extract_request_intent
from .pipeline_state import ItineraryState
from .reasons_stage import write_selection_reasons
from .retrieval_stage import retrieve_candidates
from .schemas import GenerateItineraryRequest, GenerateItineraryResponse
from .selection_stage import score_and_select_slots


def _build_graph():
    from langgraph.graph import END, START, StateGraph

    builder = StateGraph(ItineraryState)
    builder.add_node("intent", extract_request_intent)
    builder.add_node("retrieve", retrieve_candidates)
    builder.add_node("score", defer_slot_scoring)
    builder.add_node("select", score_and_select_slots)
    builder.add_node("reasons", write_selection_reasons)
    builder.add_edge(START, "intent")
    builder.add_edge("intent", "retrieve")
    builder.add_edge("retrieve", "score")
    builder.add_edge("score", "select")
    builder.add_edge("select", "reasons")
    builder.add_edge("reasons", END)
    return builder.compile()


async def run_itinerary_pipeline(
    request: GenerateItineraryRequest,
) -> GenerateItineraryResponse:
    # An operator's explicit choice, or None to let the gateway decide per
    # job. Stages ask for their own job's model, so a single pipeline-wide
    # default would have flattened three separately-tuned decisions.
    model_name = (request.model_name or "").strip() or None
    graph = _build_graph()
    final_state: dict[str, Any] = await graph.ainvoke(
        {"request": request, "model_name": model_name}
    )
    return final_state["response"]
