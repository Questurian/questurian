"""Keyword-intel LangGraph runner with explicit staged nodes."""

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


class KeywordIntelGraphState(TypedDict, total=False):
    run_id: str
    request: dict[str, Any]
    market_context: dict[str, Any]
    autocomplete_records: list[dict[str, Any]]
    autocomplete_debug: dict[str, Any]
    related_search_records: list[dict[str, Any]]
    related_debug: dict[str, Any]
    raw_phrase_records: list[dict[str, Any]]
    raw_phrases: list[str]
    normalized_phrase_records: list[dict[str, Any]]
    normalization_debug: dict[str, Any]
    seed_intent_profile: dict[str, Any]
    classified_phrase_records: list[dict[str, Any]]
    intent_debug: dict[str, Any]
    retained_phrase_records: list[dict[str, Any]]
    filtered_out_phrase_records: list[dict[str, Any]]
    filter_debug: dict[str, Any]
    groups: list[dict[str, Any]]
    pattern_summary: dict[str, list[str]]
    scored_groups: list[dict[str, Any]]
    artifact: dict[str, Any]
    artifact_ref: str
    completed: bool


def run_keyword_intel_graph(
    *,
    run_id: str,
    initial_state: KeywordIntelGraphState,
    node_builders: list[
        tuple[str, Callable[[KeywordIntelGraphState], KeywordIntelGraphState]]
    ],
) -> None:
    from langgraph.graph import END, START, StateGraph

    builder = StateGraph(KeywordIntelGraphState)
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
            trace_name="keyword_intel.run",
            feature="keyword_intel",
            thread_id=run_id,
            app_run_id=run_id,
            tags=["pipeline"],
            metadata={"entrypoint": "keyword_intel/run"},
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
                        "tags": ["langgraph", "keyword_intel"],
                        "metadata": {"feature": "keyword_intel", "run_id": run_id},
                        "run_name": "keyword_intel_run_graph",
                    },
                )
            trace_payload = langsmith_trace_payload(
                finalize_langsmith_trace(trace_run, trace_metadata)
            )
    except Exception:
        logger.exception("Keyword-intel LangGraph runner failed")
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
