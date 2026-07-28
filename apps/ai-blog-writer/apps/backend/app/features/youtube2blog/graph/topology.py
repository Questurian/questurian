from __future__ import annotations

from typing import Any

from .routing import (
    route_editorial_gate,
    route_stage_1_gate,
    route_stage_2_gate,
    route_stage_3_coverage,
    route_stage_3_quality_gate,
    route_stage_5_gate,
    route_stage_seo_gate,
)
from .state import GraphNode, YouTube2BlogGraphState


REQUIRED_NODES = {
    "stage_1",
    "stage_1_quality_gate",
    "stage_1_repair",
    "stage_2",
    "stage_2_quality_gate",
    "stage_2_retry",
    "stage_3_guideline",
    "stage_3_coverage",
    "stage_3_supplement",
    "stage_3",
    "stage_3_quality_gate",
    "stage_3_improve",
    "stage_seo_brief",
    "stage_seo_enrich",
    "stage_seo_quality_gate",
    "stage_seo_retry",
    "stage_seo_rollback",
    "stage_editorial_gate",
    "stage_editorial_augmentation",
    "stage_editorial_skip",
    "stage_4",
    "stage_5_quality_gate",
    "stage_5_retry",
    "finalize",
}


def build_youtube2blog_graph(nodes: dict[str, GraphNode]) -> Any:
    """Declare graph topology independently from node implementations."""
    from langgraph.graph import END, START, StateGraph

    missing = REQUIRED_NODES - nodes.keys()
    unexpected = nodes.keys() - REQUIRED_NODES
    if missing or unexpected:
        raise ValueError(
            f"Invalid YouTube2Blog node registry; "
            f"missing={sorted(missing)}, unexpected={sorted(unexpected)}"
        )

    builder = StateGraph(YouTube2BlogGraphState)
    for name, node in nodes.items():
        builder.add_node(name, node)

    builder.add_edge(START, "stage_1")
    builder.add_edge("stage_1", "stage_1_quality_gate")
    builder.add_conditional_edges(
        "stage_1_quality_gate",
        route_stage_1_gate,
        {
            "classify": "stage_2",
            "skip_classification": "stage_3_guideline",
            "retry": "stage_1_repair",
        },
    )
    builder.add_edge("stage_1_repair", "stage_1_quality_gate")

    builder.add_edge("stage_2", "stage_2_quality_gate")
    builder.add_conditional_edges(
        "stage_2_quality_gate",
        route_stage_2_gate,
        {"pass": "stage_3_guideline", "retry": "stage_2_retry"},
    )
    builder.add_edge("stage_2_retry", "stage_2_quality_gate")

    builder.add_edge("stage_3_guideline", "stage_3_coverage")
    builder.add_conditional_edges(
        "stage_3_coverage",
        route_stage_3_coverage,
        {"compose": "stage_3", "supplement": "stage_3_supplement"},
    )
    builder.add_edge("stage_3_supplement", "stage_3")

    builder.add_edge("stage_3", "stage_3_quality_gate")
    builder.add_conditional_edges(
        "stage_3_quality_gate",
        route_stage_3_quality_gate,
        {"pass": "stage_seo_brief", "retry": "stage_3_improve"},
    )
    builder.add_edge("stage_3_improve", "stage_3_quality_gate")

    builder.add_edge("stage_seo_brief", "stage_seo_enrich")
    builder.add_edge("stage_seo_enrich", "stage_seo_quality_gate")
    builder.add_conditional_edges(
        "stage_seo_quality_gate",
        route_stage_seo_gate,
        {
            "pass": "stage_editorial_gate",
            "retry": "stage_seo_retry",
            "rollback": "stage_seo_rollback",
        },
    )
    builder.add_edge("stage_seo_retry", "stage_seo_quality_gate")
    builder.add_edge("stage_seo_rollback", "stage_editorial_gate")

    builder.add_conditional_edges(
        "stage_editorial_gate",
        route_editorial_gate,
        {
            "augment": "stage_editorial_augmentation",
            "skip": "stage_editorial_skip",
        },
    )
    builder.add_edge("stage_editorial_augmentation", "stage_4")
    builder.add_edge("stage_editorial_skip", "stage_4")

    builder.add_edge("stage_4", "stage_5_quality_gate")
    builder.add_conditional_edges(
        "stage_5_quality_gate",
        route_stage_5_gate,
        {"pass": "finalize", "retry": "stage_5_retry"},
    )
    builder.add_edge("stage_5_retry", "stage_5_quality_gate")
    builder.add_edge("finalize", END)
    return builder
