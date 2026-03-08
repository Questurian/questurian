"""Location documents LangGraph runners."""

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


class LocationDocumentsGraphState(TypedDict, total=False):
    thread_id: str
    completed: bool


def _run_location_documents_graph(
    *,
    node_name: str,
    step_runner: Callable[[], T],
) -> T:
    from langgraph.graph import END, START, StateGraph

    thread_id = str(uuid4())
    result_holder: dict[str, T | None] = {"result": None}

    def step_node(_state: LocationDocumentsGraphState) -> LocationDocumentsGraphState:
        result_holder["result"] = step_runner()
        return {"completed": True}

    builder = StateGraph(LocationDocumentsGraphState)
    builder.add_node(node_name, step_node)
    builder.add_edge(START, node_name)
    builder.add_edge(node_name, END)

    try:
        with langgraph_trace(
            trace_name=f"location_documents.{node_name}",
            feature="location_documents",
            thread_id=thread_id,
            tags=[node_name],
            metadata={"entrypoint": f"location_documents/{node_name}"},
            inputs={"thread_id": thread_id},
        ) as (trace_run, trace_metadata):
            with langgraph_checkpoint() as checkpointer:
                graph = builder.compile(checkpointer=checkpointer)
                graph.invoke(
                    {"thread_id": thread_id, "completed": False},
                    config={
                        "configurable": {"thread_id": thread_id},
                        "tags": ["langgraph", "location_documents", node_name],
                        "metadata": {
                            "feature": "location_documents",
                            "thread_id": thread_id,
                        },
                        "run_name": f"location_documents_{node_name}_graph",
                    },
                )
            trace_payload = langsmith_trace_payload(
                finalize_langsmith_trace(trace_run, trace_metadata)
            )
            if trace_payload.get("langsmith_trace_url"):
                logger.info(
                    "Location Documents LangSmith trace available: %s",
                    trace_payload["langsmith_trace_url"],
                )
    except Exception:
        logger.exception("Location Documents LangGraph runner failed")
        raise

    result = result_holder.get("result")
    if result is None:
        raise RuntimeError("Location Documents LangGraph returned no result")
    return result


def run_location_documents_fill_document_graph(*, step_runner: Callable[[], T]) -> T:
    return _run_location_documents_graph(
        node_name="location_documents_fill_document",
        step_runner=step_runner,
    )


def run_location_documents_fill_section_graph(*, step_runner: Callable[[], T]) -> T:
    return _run_location_documents_graph(
        node_name="location_documents_fill_section",
        step_runner=step_runner,
    )


def run_location_documents_fill_field_graph(*, step_runner: Callable[[], T]) -> T:
    return _run_location_documents_graph(
        node_name="location_documents_fill_field",
        step_runner=step_runner,
    )
