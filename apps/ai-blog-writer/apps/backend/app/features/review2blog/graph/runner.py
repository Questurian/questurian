"""Review2Blog LangGraph runner."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable, TypedDict

from app.ai_graph.runtime import (
    finalize_langsmith_trace,
    langgraph_checkpoint,
    langgraph_trace,
    langsmith_trace_payload,
)
from app.core import write_stage_result

logger = logging.getLogger(__name__)


class Review2BlogGraphState(TypedDict, total=False):
    mode: str
    run_id: str
    review_payload: dict[str, Any]
    reviews: list[dict[str, Any]]
    category: str
    location_context: dict[str, Any]
    editorial_intent: dict[str, Any]
    restaurant_context: dict[str, Any]
    listicle: dict[str, Any]
    resolved_max_tokens: int
    phase1_mode: str
    phase1_batch_size: int
    phase1_batches: list[list[dict[str, Any]]]
    phase1_batch_count: int
    phase1_claims: list[dict[str, Any]]
    phase1_parsed: list[dict[str, Any]]
    phase1_summary: dict[str, Any]
    phase2_profile: dict[str, Any]
    phase2_parsed: dict[str, Any]
    writer_brief: dict[str, Any]
    phase3_raw: str
    blurb: str
    phase3_quality_meta: dict[str, Any]
    gate_decision: str
    completed: bool


def run_review2blog_graph(
    *,
    run_id: str,
    entrypoint: str,
    initial_state: Review2BlogGraphState,
    validate_input_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    route_phase1_mode_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    phase1_single_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    phase1_batch_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    phase1_merge_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    phase2_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    await_listicle_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    phase3_generate_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    phase3_validate_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    finalize_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
) -> None:
    from langgraph.graph import END, START, StateGraph

    def route_after_validate(state: Review2BlogGraphState) -> str:
        return "resume" if str(state.get("mode") or "initial") == "resume" else "initial"

    def route_phase1_mode(state: Review2BlogGraphState) -> str:
        return str(state.get("phase1_mode") or "single")

    def route_after_await_gate(state: Review2BlogGraphState) -> str:
        return str(state.get("gate_decision") or "pause")

    builder = StateGraph(Review2BlogGraphState)
    builder.add_node("validate_input", validate_input_runner)
    builder.add_node("route_phase1_mode", route_phase1_mode_runner)
    builder.add_node("phase1_single", phase1_single_runner)
    builder.add_node("phase1_batch_fanout", phase1_batch_runner)
    builder.add_node("phase1_merge", phase1_merge_runner)
    builder.add_node("phase2_generate", phase2_runner)
    builder.add_node("await_listicle_gate", await_listicle_runner)
    builder.add_node("phase3_generate", phase3_generate_runner)
    builder.add_node("phase3_validate", phase3_validate_runner)
    builder.add_node("finalize", finalize_runner)

    builder.add_edge(START, "validate_input")
    builder.add_conditional_edges(
        "validate_input",
        route_after_validate,
        {
            "initial": "route_phase1_mode",
            "resume": "await_listicle_gate",
        },
    )
    builder.add_conditional_edges(
        "route_phase1_mode",
        route_phase1_mode,
        {
            "single": "phase1_single",
            "batch": "phase1_batch_fanout",
        },
    )
    builder.add_edge("phase1_single", "phase2_generate")
    builder.add_edge("phase1_batch_fanout", "phase1_merge")
    builder.add_edge("phase1_merge", "phase2_generate")
    builder.add_edge("phase2_generate", "await_listicle_gate")
    builder.add_conditional_edges(
        "await_listicle_gate",
        route_after_await_gate,
        {
            "pause": END,
            "continue": "phase3_generate",
        },
    )
    builder.add_edge("phase3_generate", "phase3_validate")
    builder.add_edge("phase3_validate", "finalize")
    builder.add_edge("finalize", END)

    checkpoint_thread_id = f"{run_id}:{initial_state.get('mode', 'initial')}"
    trace_payload: dict[str, str] = {}
    try:
        with langgraph_trace(
            trace_name="review2blog.pipeline",
            feature="review2blog",
            thread_id=run_id,
            app_run_id=run_id,
            tags=["pipeline"],
            metadata={"entrypoint": entrypoint},
            inputs={"run_id": run_id, "mode": initial_state.get("mode", "initial")},
        ) as (trace_run, trace_metadata):
            with langgraph_checkpoint() as checkpointer:
                graph = builder.compile(checkpointer=checkpointer)
                graph.invoke(
                    {
                        "run_id": run_id,
                        **initial_state,
                        "completed": False,
                    },
                    config={
                        "configurable": {"thread_id": checkpoint_thread_id},
                        "tags": ["langgraph", "review2blog"],
                        "metadata": {
                            "feature": "review2blog",
                            "run_id": run_id,
                            "entrypoint": entrypoint,
                        },
                        "run_name": "review2blog_pipeline_graph",
                    },
                )
            trace_payload = langsmith_trace_payload(
                finalize_langsmith_trace(trace_run, trace_metadata)
            )
    except Exception:
        logger.exception("Review2Blog LangGraph runner failed")
        raise

    if trace_payload:
        write_stage_result(
            run_id,
            "langgraph_trace",
            {
                "created_at": datetime.now(timezone.utc).isoformat(),
                "data": trace_payload,
            },
        )
