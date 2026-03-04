"""Review2Blog LangGraph runner."""

from __future__ import annotations

import logging
from datetime import datetime
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
    run_id: str
    reviews: list[dict[str, Any]]
    restaurant_context: dict[str, Any]
    listicle: dict[str, Any]
    resolved_max_tokens: int
    phase1_parsed: list[Any]
    phase2_parsed: dict[str, Any]
    blurb: str
    completed: bool


def run_review2blog_graph(
    *,
    run_id: str,
    initial_state: Review2BlogGraphState,
    phase1_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    phase2_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    phase3_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
    finalize_runner: Callable[[Review2BlogGraphState], Review2BlogGraphState],
) -> None:
    from langgraph.graph import END, START, StateGraph

    builder = StateGraph(Review2BlogGraphState)
    builder.add_node("phase1", phase1_runner)
    builder.add_node("phase2", phase2_runner)
    builder.add_node("phase3", phase3_runner)
    builder.add_node("finalize", finalize_runner)
    builder.add_edge(START, "phase1")
    builder.add_edge("phase1", "phase2")
    builder.add_edge("phase2", "phase3")
    builder.add_edge("phase3", "finalize")
    builder.add_edge("finalize", END)

    trace_payload: dict[str, str] = {}
    try:
        with langgraph_trace(
            trace_name="review2blog.pipeline",
            feature="review2blog",
            thread_id=run_id,
            app_run_id=run_id,
            tags=["pipeline"],
            metadata={"entrypoint": "review2blog/run"},
            inputs={"run_id": run_id},
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
                        "configurable": {"thread_id": run_id},
                        "tags": ["langgraph", "review2blog"],
                        "metadata": {"feature": "review2blog", "run_id": run_id},
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
                "created_at": datetime.utcnow().isoformat(),
                "data": trace_payload,
            },
        )
