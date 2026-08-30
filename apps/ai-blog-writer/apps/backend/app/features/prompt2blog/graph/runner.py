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
from .state import Prompt2BlogV3GraphState

logger = logging.getLogger(__name__)

GraphNode = Callable[[Prompt2BlogV3GraphState], dict[str, Any]]


def run_prompt2blog_stage_graph(
    *,
    run_id: str,
    trace_name: str,
    initial_state: Prompt2BlogV3GraphState,
    nodes: list[tuple[str, GraphNode]],
    recorder: RunRecorder,
    build_graph: Callable[[dict[str, GraphNode]], Any] | None = None,
    thread_id: str | None = None,
) -> Prompt2BlogV3GraphState:
    """Compile and invoke a graph whose nodes are the real pipeline stages.

    ``build_graph`` declares the topology. Without one the nodes are chained in
    the order given, which remains useful for narrow tests.

    ``thread_id`` names the LangGraph checkpoint thread, defaulting to the run.
    A resumed leg passes its own, because the failed leg's checkpoints are only
    discarded when its process lived long enough to run the cleanup: after a
    crash they are still on disk, and re-entering under the same thread id
    would replay that stale snapshot instead of the state we restored.
    """
    from langgraph.graph import END, START, StateGraph

    if build_graph is not None:
        builder = build_graph(dict(nodes))
    else:
        builder = StateGraph(Prompt2BlogV3GraphState)
        previous_node_name: str | None = None
        for node_name, node_fn in nodes:
            builder.add_node(node_name, node_fn)
            builder.add_edge(
                START if previous_node_name is None else previous_node_name, node_name
            )
            previous_node_name = node_name
        if previous_node_name is not None:
            builder.add_edge(previous_node_name, END)

    thread_id = thread_id or run_id
    trace_payload: dict[str, str] = {}
    try:
        with langgraph_trace(
            trace_name=trace_name,
            feature="prompt2blog",
            thread_id=thread_id,
            # LangSmith pins a trace to this id when it parses as a UUID, so a
            # resumed leg must not offer the run id again: two traces claiming
            # one id is a collision, not a continuation. A resume gets its own
            # trace, tied back to the run by `metadata.run_id`.
            app_run_id=run_id if thread_id == run_id else None,
            tags=["pipeline"],
            metadata={"entrypoint": trace_name},
            inputs={"run_id": run_id},
        ) as (trace_run, trace_metadata):
            # Dropped when the leg ends rather than accumulating in the
            # shared database. Resume does not read these: it restores from the
            # run's own `resume_snapshot` stage row, which survives a crash and
            # can be inspected, so the checkpoints stay disposable.
            with langgraph_checkpoint(discard_thread=thread_id) as checkpointer:
                graph = builder.compile(checkpointer=checkpointer)
                result = graph.invoke(
                    {
                        "run_id": run_id,
                        **initial_state,
                        "completed": False,
                    },
                    config={
                        "configurable": {"thread_id": thread_id},
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
    return Prompt2BlogV3GraphState(result)
