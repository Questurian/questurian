"""Prompt2Blog LangGraph runners."""

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


class Prompt2BlogGraphState(TypedDict, total=False):
    run_id: str
    pipeline_request: dict[str, Any]
    completed: bool


def _invoke_sync_graph(
    *,
    run_id: str,
    trace_name: str,
    initial_state: Prompt2BlogGraphState,
    node_builders: list[tuple[str, Callable[[Prompt2BlogGraphState], Prompt2BlogGraphState]]],
) -> None:
    from langgraph.graph import END, START, StateGraph

    builder = StateGraph(Prompt2BlogGraphState)
    previous_node_name: str | None = None
    for node_name, node_fn in node_builders:
        builder.add_node(node_name, node_fn)
        if previous_node_name is None:
            builder.add_edge(START, node_name)
        else:
            builder.add_edge(previous_node_name, node_name)
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
                graph.invoke(
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
        write_stage_result(
            run_id,
            "langgraph_trace",
            {
                "created_at": datetime.utcnow().isoformat(),
                "data": trace_payload,
            },
        )


def run_prompt2blog_pipeline_v2_graph(
    *,
    run_id: str,
    pipeline_runner: Callable[[], None],
) -> None:
    def pipeline_node(_state: Prompt2BlogGraphState) -> Prompt2BlogGraphState:
        pipeline_runner()
        return {"completed": True}

    _invoke_sync_graph(
        run_id=run_id,
        trace_name="prompt2blog.pipeline_v2",
        initial_state={},
        node_builders=[("pipeline_v2", pipeline_node)],
    )


def run_prompt2blog_full_graph(
    *,
    run_id: str,
    prepare_runner: Callable[[], dict[str, Any]],
    pipeline_runner: Callable[[dict[str, Any]], None],
) -> None:
    def prepare_node(_state: Prompt2BlogGraphState) -> Prompt2BlogGraphState:
        pipeline_request = prepare_runner()
        return {"pipeline_request": pipeline_request}

    def pipeline_node(state: Prompt2BlogGraphState) -> Prompt2BlogGraphState:
        pipeline_request = state.get("pipeline_request") or {}
        pipeline_runner(pipeline_request)
        return {"completed": True}

    _invoke_sync_graph(
        run_id=run_id,
        trace_name="prompt2blog.full_run",
        initial_state={},
        node_builders=[
            ("prepare_full_run", prepare_node),
            ("execute_pipeline_v2", pipeline_node),
        ],
    )
