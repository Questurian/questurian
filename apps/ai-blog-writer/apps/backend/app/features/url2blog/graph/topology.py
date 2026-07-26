"""URL2Blog graph topology, independent of node implementations."""

from __future__ import annotations

from typing import Any

from .state import Url2BlogGraphState

REQUIRED_NODES = {
    "stage_1",
    "stage_2",
    "rewrite_quality",
    "fact_length",
    "editorial",
    "finalize",
}


def build_url2blog_graph(nodes: dict[str, Any]) -> Any:
    from langgraph.graph import END, START, StateGraph

    missing = REQUIRED_NODES - nodes.keys()
    unexpected = nodes.keys() - REQUIRED_NODES
    if missing or unexpected:
        raise ValueError(
            "Invalid URL2Blog node registry; "
            f"missing={sorted(missing)}, unexpected={sorted(unexpected)}"
        )

    builder = StateGraph(Url2BlogGraphState)
    for name, node in nodes.items():
        builder.add_node(name, node)
    builder.add_edge(START, "stage_1")
    builder.add_edge("stage_1", "stage_2")
    builder.add_edge("stage_2", "rewrite_quality")
    builder.add_edge("rewrite_quality", "fact_length")
    builder.add_edge("fact_length", "editorial")
    builder.add_edge("editorial", "finalize")
    builder.add_edge("finalize", END)
    return builder
