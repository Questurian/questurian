"""Prompt2Blog v3 graph topology.

Shorter than v2 by design. There is no guideline fetch, no coverage check, and
no supplement node: research readiness is settled before a run starts, and v3
never generates a fact it did not receive.
"""

from __future__ import annotations

from typing import Any

from ..policies import route_quality_gate
from .state import Prompt2BlogV3GraphState

V3_GENERATION_NODES = (
    "outline",
    "compose",
    "groundedness",
    "quality_audit",
    "repair",
    "quality_settle",
    "title",
    "finalize",
)


def build_prompt2blog_v3_graph(nodes: dict[str, Any]) -> Any:
    """Compile the v3 generation topology."""
    from langgraph.graph import END, START, StateGraph

    missing = set(V3_GENERATION_NODES) - nodes.keys()
    unexpected = nodes.keys() - set(V3_GENERATION_NODES)
    if missing or unexpected:
        raise ValueError(
            "Invalid Prompt2Blog v3 node registry; "
            f"missing={sorted(missing)}, unexpected={sorted(unexpected)}"
        )

    builder = StateGraph(Prompt2BlogV3GraphState)
    for name, node in nodes.items():
        builder.add_node(name, node)

    builder.add_edge(START, "outline")
    builder.add_edge("outline", "compose")
    # Grounding runs before the audit and inside the repair loop, so a repaired
    # draft is re-checked against the evidence rather than trusted.
    builder.add_edge("compose", "groundedness")
    builder.add_edge("groundedness", "quality_audit")
    builder.add_conditional_edges(
        "quality_audit",
        route_quality_gate,
        {"repair": "repair", "settle": "quality_settle"},
    )
    builder.add_edge("repair", "groundedness")
    builder.add_edge("quality_settle", "title")
    builder.add_edge("title", "finalize")
    builder.add_edge("finalize", END)
    return builder
