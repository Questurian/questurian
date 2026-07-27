"""Prompt2Blog graph topology, declared independently of node implementations.

The generation path is no longer a straight line. The quality audit routes
either to a bounded repair loop or to the settle node that restores the
best-scoring draft seen during that loop.
"""

from __future__ import annotations

from typing import Any

from ..policies import route_quality_gate
from .state import Prompt2BlogGraphState

GENERATION_NODES = (
    "guideline",
    "coverage",
    "supplement",
    "outline",
    "compose",
    "quality_audit",
    "repair",
    "quality_settle",
    "editorial_augmentation",
    "title",
    "finalize",
)


def build_prompt2blog_graph(nodes: dict[str, Any]) -> Any:
    """Compile the generation topology, optionally fronted by a prepare node."""
    from langgraph.graph import END, START, StateGraph

    expected = set(GENERATION_NODES) | {"prepare"}
    missing = set(GENERATION_NODES) - nodes.keys()
    unexpected = nodes.keys() - expected
    if missing or unexpected:
        raise ValueError(
            "Invalid Prompt2Blog node registry; "
            f"missing={sorted(missing)}, unexpected={sorted(unexpected)}"
        )

    builder = StateGraph(Prompt2BlogGraphState)
    for name, node in nodes.items():
        builder.add_node(name, node)

    if "prepare" in nodes:
        builder.add_edge(START, "prepare")
        builder.add_edge("prepare", "guideline")
    else:
        builder.add_edge(START, "guideline")

    builder.add_edge("guideline", "coverage")
    builder.add_edge("coverage", "supplement")
    builder.add_edge("supplement", "outline")
    builder.add_edge("outline", "compose")
    builder.add_edge("compose", "quality_audit")

    # The audit either accepts the draft, spends another repair attempt, or
    # runs out of budget. Repair loops back through the audit so a repaired
    # draft is re-gated instead of shipping unexamined.
    builder.add_conditional_edges(
        "quality_audit",
        route_quality_gate,
        {"repair": "repair", "settle": "quality_settle"},
    )
    builder.add_edge("repair", "quality_audit")

    builder.add_edge("quality_settle", "editorial_augmentation")
    builder.add_edge("editorial_augmentation", "title")
    builder.add_edge("title", "finalize")
    builder.add_edge("finalize", END)
    return builder
