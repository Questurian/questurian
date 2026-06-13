"""Editor Assist LangGraph runners."""

from __future__ import annotations

import logging
from typing import Callable, TypedDict, TypeVar
from uuid import uuid4

from app.ai_graph.runtime import (
    finalize_langsmith_trace,
    langgraph_checkpoint,
    langgraph_trace,
    langsmith_trace_payload,
)

logger = logging.getLogger(__name__)

T = TypeVar("T")


class EditorAssistGraphState(TypedDict, total=False):
    thread_id: str
    completed: bool


def _run_editor_assist_graph(
    *,
    node_name: str,
    step_runner: Callable[[], T],
) -> T:
    from langgraph.graph import END, START, StateGraph

    thread_id = str(uuid4())
    result_holder: dict[str, T | None] = {"result": None}

    def step_node(_state: EditorAssistGraphState) -> EditorAssistGraphState:
        result_holder["result"] = step_runner()
        return {"completed": True}

    builder = StateGraph(EditorAssistGraphState)
    builder.add_node(node_name, step_node)
    builder.add_edge(START, node_name)
    builder.add_edge(node_name, END)

    try:
        with langgraph_trace(
            trace_name=f"editor_assist.{node_name}",
            feature="editor_assist",
            thread_id=thread_id,
            tags=[node_name],
            metadata={"entrypoint": f"editor_assist/{node_name}"},
            inputs={"thread_id": thread_id},
        ) as (trace_run, trace_metadata):
            with langgraph_checkpoint() as checkpointer:
                graph = builder.compile(checkpointer=checkpointer)
                graph.invoke(
                    {"thread_id": thread_id, "completed": False},
                    config={
                        "configurable": {"thread_id": thread_id},
                        "tags": ["langgraph", "editor_assist", node_name],
                        "metadata": {"feature": "editor_assist", "thread_id": thread_id},
                        "run_name": f"editor_assist_{node_name}_graph",
                    },
                )
            trace_payload = langsmith_trace_payload(
                finalize_langsmith_trace(trace_run, trace_metadata)
            )
            if trace_payload.get("langsmith_trace_url"):
                logger.info(
                    "Editor Assist LangSmith trace available: %s",
                    trace_payload["langsmith_trace_url"],
                )
    except Exception:
        logger.exception("Editor Assist LangGraph runner failed")
        raise

    result = result_holder.get("result")
    if result is None:
        raise RuntimeError("Editor Assist LangGraph returned no result")
    return result


def run_editor_assist_generate_title_graph(
    *,
    step_runner: Callable[[], T],
) -> T:
    return _run_editor_assist_graph(
        node_name="editor_assist_generate_title",
        step_runner=step_runner,
    )


def run_editor_assist_compose_brief_graph(
    *,
    step_runner: Callable[[], T],
) -> T:
    return _run_editor_assist_graph(
        node_name="editor_assist_compose_itinerary_brief",
        step_runner=step_runner,
    )


def run_editor_assist_rewrite_graph(
    *,
    step_runner: Callable[[], T],
) -> T:
    return _run_editor_assist_graph(
        node_name="editor_assist_rewrite_block",
        step_runner=step_runner,
    )


def run_editor_assist_listicle_generation_graph(
    *,
    step_runner: Callable[[], T],
) -> T:
    return _run_editor_assist_graph(
        node_name="editor_assist_generate_listicle_content",
        step_runner=step_runner,
    )
