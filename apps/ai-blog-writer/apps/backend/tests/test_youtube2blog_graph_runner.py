import pytest

from app.features.youtube2blog.config import Y2B_STAGE1_REPAIR_MAX_RETRIES
from app.features.youtube2blog.graph.topology import (
    REQUIRED_NODES,
    build_youtube2blog_graph,
)
from app.features.youtube2blog.quality.policies import (
    evaluate_article_quality_gate,
    evaluate_classification_gate,
    evaluate_editorial_gate,
    evaluate_seo_gate,
    evaluate_title_gate,
    evaluate_transcript_gate,
)


def test_transcript_gate_uses_standard_retention_ratio_for_short_transcripts():
    decision, gate = evaluate_transcript_gate(
        cleaned_chars=1200,
        original_chars=10_000,
        retry_count=0,
    )
    assert decision == "retry"
    assert gate["checks"]["minimum_retention_ratio"] is False
    assert gate["metrics"]["minimum_retention_ratio_threshold"] == 0.2
    assert gate["metrics"]["maximum_retention_ratio_threshold"] == 1.05
    assert gate["metrics"]["transcript_length_profile"] == "standard"


def test_transcript_gate_allows_long_form_retention_profile():
    decision, gate = evaluate_transcript_gate(
        cleaned_chars=3_751,
        original_chars=40_000,
        retry_count=0,
    )
    assert decision == "pass"
    assert gate["metrics"]["retention_ratio"] == 0.0938
    assert gate["metrics"]["minimum_retention_ratio_threshold"] == 0.08
    assert gate["metrics"]["maximum_retention_ratio_threshold"] == 0.98


@pytest.mark.parametrize("cleaned_chars", [1_500, 39_600])
def test_transcript_gate_fails_after_long_form_retries(cleaned_chars):
    with pytest.raises(RuntimeError, match="maximum_retention_ratio=0.980"):
        evaluate_transcript_gate(
            cleaned_chars=cleaned_chars,
            original_chars=40_000,
            retry_count=Y2B_STAGE1_REPAIR_MAX_RETRIES,
        )


def test_classification_gate_retries_then_fails():
    decision, gate = evaluate_classification_gate(
        confidence=0.5,
        classification="guide",
        reasoning="uncertain",
        retry_count=0,
    )
    assert decision == "retry"
    assert gate["passed"] is False
    with pytest.raises(RuntimeError, match="Stage 2 quality gate failed"):
        evaluate_classification_gate(
            confidence=0.5,
            classification="guide",
            reasoning="uncertain",
            retry_count=1,
        )


def test_article_quality_gate_preserves_near_pass_and_best_effort_modes():
    near_decision, near_gate = evaluate_article_quality_gate(
        {
            "overall_quality_score": 7.3,
            "dimension_scores": {
                "clarity": 7,
                "structure_coherence": 7,
                "usefulness_actionability": 7,
            },
        },
        retry_count=2,
    )
    assert near_decision == "pass"
    assert near_gate["pass_mode"] == "near_pass"

    best_decision, best_gate = evaluate_article_quality_gate(
        {
            "overall_quality_score": 5,
            "dimension_scores": {
                "clarity": 6,
                "structure_coherence": 6,
                "usefulness_actionability": 6,
            },
        },
        retry_count=2,
    )
    assert best_decision == "pass"
    assert best_gate["pass_mode"] == "best_effort"


def test_seo_gate_rolls_back_after_retry_exhaustion():
    decision, gate = evaluate_seo_gate(
        {
            "score": 4,
            "checks": {
                "no_keyword_stuffing": False,
                "article_length_retained": True,
            },
        },
        retry_count=1,
    )
    assert decision == "rollback"
    assert gate["pass_mode"] == "rollback_after_failed_gate"


def test_editorial_and_title_policies_keep_existing_decisions():
    assert evaluate_editorial_gate(words=279, paragraphs=10)[0] == "skip"
    assert evaluate_editorial_gate(words=280, paragraphs=4)[0] == "augment"
    assert evaluate_title_gate(
        {"score": 8, "checks": {"length_range": True}},
        retry_count=0,
        title="A valid generated title",
    )[0] == "pass"


def _topology_nodes(*, supplement=False, rollback=False, augment=False):
    visited: list[str] = []

    def node(name, updates=None):
        def run(_state):
            visited.append(name)
            return dict(updates or {})

        return run

    nodes = {name: node(name) for name in REQUIRED_NODES}
    nodes["stage_1_quality_gate"] = node(
        "stage_1_quality_gate", {"stage1_gate_decision": "pass"}
    )
    nodes["stage_2_quality_gate"] = node(
        "stage_2_quality_gate", {"stage2_gate_decision": "pass"}
    )
    nodes["stage_3_coverage"] = node(
        "stage_3_coverage",
        {
            "stage3_coverage": {
                "coverage_sufficient": not supplement,
                "missing_sections": ["missing"] if supplement else [],
            }
        },
    )
    nodes["stage_3_quality_gate"] = node(
        "stage_3_quality_gate", {"stage3_quality_gate_decision": "pass"}
    )
    nodes["stage_seo_quality_gate"] = node(
        "stage_seo_quality_gate",
        {"stage_seo_gate_decision": "rollback" if rollback else "pass"},
    )
    nodes["stage_editorial_gate"] = node(
        "stage_editorial_gate",
        {"stage_editorial_decision": "augment" if augment else "skip"},
    )
    nodes["stage_5_quality_gate"] = node(
        "stage_5_quality_gate", {"stage5_gate_decision": "pass"}
    )
    nodes["finalize"] = node("finalize", {"markdown": "# Complete"})
    return nodes, visited


@pytest.mark.parametrize(
    ("supplement", "rollback", "augment", "expected"),
    [
        (False, False, False, {"stage_editorial_skip"}),
        (
            True,
            True,
            True,
            {
                "stage_3_supplement",
                "stage_seo_rollback",
                "stage_editorial_augmentation",
            },
        ),
    ],
)
def test_graph_topology_executes_expected_branches(
    supplement,
    rollback,
    augment,
    expected,
):
    nodes, visited = _topology_nodes(
        supplement=supplement,
        rollback=rollback,
        augment=augment,
    )
    result = build_youtube2blog_graph(nodes).compile().invoke({})
    assert result["markdown"] == "# Complete"
    assert expected <= set(visited)
    assert ("stage_3_supplement" in visited) is supplement
    assert ("stage_seo_rollback" in visited) is rollback


def test_graph_topology_rejects_incomplete_node_registry():
    with pytest.raises(ValueError, match="missing="):
        build_youtube2blog_graph({})


def test_forced_article_type_routes_around_classification():
    """A forced type makes stage_2 dead work: stage_3_guideline discards its
    verdict, but the run still paid for a full-transcript classification call
    and could still be killed by its confidence gate."""
    nodes, visited = _topology_nodes(
        supplement=False,
        rollback=False,
        augment=False,
    )
    result = (
        build_youtube2blog_graph(nodes)
        .compile()
        .invoke({"forced_article_type": "Listicle"})
    )

    assert result["markdown"] == "# Complete"
    assert "stage_3_guideline" in visited
    assert "stage_2" not in visited
    assert "stage_2_quality_gate" not in visited
    assert "stage_2_retry" not in visited


def test_auto_classification_still_runs_without_a_forced_type():
    nodes, visited = _topology_nodes(
        supplement=False,
        rollback=False,
        augment=False,
    )
    build_youtube2blog_graph(nodes).compile().invoke({"forced_article_type": "   "})

    assert "stage_2" in visited
    assert "stage_2_quality_gate" in visited


def test_transcript_repair_still_wins_over_a_forced_type():
    """A forced type must not let a failed transcript skip its repair loop."""
    from app.features.youtube2blog.graph.routing import route_stage_1_gate

    assert (
        route_stage_1_gate(
            {"stage1_gate_decision": "retry", "forced_article_type": "Listicle"}
        )
        == "retry"
    )
    assert (
        route_stage_1_gate(
            {"stage1_gate_decision": "pass", "forced_article_type": "Listicle"}
        )
        == "skip_classification"
    )
    assert route_stage_1_gate({"stage1_gate_decision": "pass"}) == "classify"
