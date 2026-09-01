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
    "finalize",
)

# The persisted stage name each node writes, and the node each stage name
# belongs to. A resume reads a stage name off the run's own records and has to
# turn it back into a node, so the mapping lives beside the topology it has to
# agree with rather than in the resume code.
V3_NODE_STAGE_NAMES = {node: f"stage_v3_{node}" for node in V3_GENERATION_NODES}
V3_STAGE_NAME_NODES = {stage: node for node, stage in V3_NODE_STAGE_NAMES.items()}

# The unconditional half of the topology below. `quality_audit` is absent on
# purpose: its successor is a decision, not an edge, and asking
# `route_quality_gate` is the only correct way to make it.
V3_NODE_SUCCESSORS = {
    "outline": "compose",
    "compose": "groundedness",
    "groundedness": "quality_audit",
    "repair": "groundedness",
    # The seed is the title (ADR 0034), so nothing writes a headline and
    # settle runs straight into finalize.
    "quality_settle": "finalize",
    "finalize": None,
}


def next_v3_node(completed_node: str, state: dict[str, Any]) -> str | None:
    """The node that runs after ``completed_node``, or None at the end.

    This is how a resume picks its entry point, so it must answer exactly what
    the compiled graph would. The quality gate is therefore re-decided by
    `route_quality_gate` on the restored state rather than guessed: a run that
    died after the audit resumes into repair or settle for the same reason the
    original run would have.
    """
    if completed_node == "quality_audit":
        return {"repair": "repair", "settle": "quality_settle"}[
            route_quality_gate(state)
        ]
    if completed_node not in V3_NODE_SUCCESSORS:
        raise ValueError(f"Unknown Prompt2Blog v3 node '{completed_node}'")
    return V3_NODE_SUCCESSORS[completed_node]


def build_prompt2blog_v3_graph(
    nodes: dict[str, Any],
    *,
    entry_node: str = "outline",
) -> Any:
    """Compile the v3 generation topology.

    ``entry_node`` moves the one edge out of START. Every node stays
    registered, so the topology a resumed run executes is the same object the
    original ran; only where it is entered changes. Nodes ahead of the entry
    point simply have nothing pointing at them and never fire.
    """
    from langgraph.graph import END, START, StateGraph

    if entry_node not in V3_GENERATION_NODES:
        raise ValueError(
            f"Invalid Prompt2Blog v3 entry node '{entry_node}'; "
            f"expected one of {sorted(V3_GENERATION_NODES)}"
        )
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

    builder.add_edge(START, entry_node)
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
    builder.add_edge("quality_settle", "finalize")
    builder.add_edge("finalize", END)
    return builder
