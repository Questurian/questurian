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
    "groundedness",
    "quality_audit",
    "repair",
    "quality_settle",
    "editorial_augmentation",
    "final_verify",
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
    # Grounding is checked before the audit and inside the loop, so a repaired
    # draft is re-checked rather than trusted.
    builder.add_edge("compose", "groundedness")
    builder.add_edge("groundedness", "quality_audit")

    # The audit either accepts the draft, spends another repair attempt, or
    # runs out of budget. Repair loops back through the audit so a repaired
    # draft is re-gated instead of shipping unexamined.
    builder.add_conditional_edges(
        "quality_audit",
        route_quality_gate,
        {"repair": "repair", "settle": "quality_settle"},
    )
    builder.add_edge("repair", "groundedness")

    builder.add_edge("quality_settle", "editorial_augmentation")
    # Augmentation is a full-article generation call, so the text that
    # ships is not the text the audit saw. final_verify re-grounds it
    # before anything reports on it.
    builder.add_edge("editorial_augmentation", "final_verify")
    builder.add_edge("final_verify", "title")
    builder.add_edge("title", "finalize")
    builder.add_edge("finalize", END)
    return builder
