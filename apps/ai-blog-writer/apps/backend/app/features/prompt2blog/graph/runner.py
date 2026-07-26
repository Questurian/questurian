"""Prompt2Blog LangGraph runner with first-class pipeline stages."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from app.ai_graph.runtime import (
    finalize_langsmith_trace,
    langgraph_checkpoint,
    langgraph_trace,
    langsmith_trace_payload,
)

from ..run_recorder import RunRecorder
from .state import Prompt2BlogGraphState

logger = logging.getLogger(__name__)

GraphNode = Callable[[Prompt2BlogGraphState], dict[str, Any]]


def run_prompt2blog_stage_graph(
    *,
    run_id: str,
    trace_name: str,
    initial_state: Prompt2BlogGraphState,
    nodes: list[tuple[str, GraphNode]],
    recorder: RunRecorder,
) -> Prompt2BlogGraphState:
    """Compile and invoke a graph whose nodes are the real pipeline stages."""
    from langgraph.graph import END, START, StateGraph

    builder = StateGraph(Prompt2BlogGraphState)
    previous_node_name: str | None = None
    for node_name, node_fn in nodes:
        builder.add_node(node_name, node_fn)
        builder.add_edge(
            START if previous_node_name is None else previous_node_name, node_name
        )
        previous_node_name = node_name
    if previous_node_name is not None:
        builder.add_edge(previous_node_name, END)

    trace_payload: dict[str, str] = {}
    try:
        with langgraph_trace(
            trace_name=trace_name,
            feature="prompt2blog",
            thread_id=run_id,
            app_run_id=run_id,
            tags=["pipeline"],
            metadata={"entrypoint": trace_name},
            inputs={"run_id": run_id},
        ) as (trace_run, trace_metadata):
            with langgraph_checkpoint() as checkpointer:
                graph = builder.compile(checkpointer=checkpointer)
                result = graph.invoke(
                    {
                        "run_id": run_id,
                        **initial_state,
                        "completed": False,
                    },
                    config={
                        "configurable": {"thread_id": run_id},
                        "tags": ["langgraph", "prompt2blog"],
                        "metadata": {"feature": "prompt2blog", "run_id": run_id},
                        "run_name": trace_name,
                    },
                )
            trace_payload = langsmith_trace_payload(
                finalize_langsmith_trace(trace_run, trace_metadata)
            )
    except Exception:
        logger.exception("Prompt2Blog LangGraph runner failed")
        raise

    if trace_payload:
        recorder.record_stage(run_id, "langgraph_trace", trace_payload)
    return Prompt2BlogGraphState(result)
