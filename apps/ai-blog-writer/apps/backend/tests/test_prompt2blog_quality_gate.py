from __future__ import annotations

import pytest

from app.features.prompt2blog.config import (
    P2B_AUGMENTATION_MIN_RETENTION_RATIO,
    P2B_REPAIR_MAX_ATTEMPTS,
)
from app.features.prompt2blog.graph.topology import (
    GENERATION_NODES,
    build_prompt2blog_graph,
)
from app.features.prompt2blog.policies import (
    evaluate_augmentation,
    is_better_quality,
    route_quality_gate,
)

PASSING_CHECKS = {
    "target_word_count_met": True,
    "cta_present": True,
    "primary_keyword_present": True,
    "secondary_keywords_present": True,
    "must_include_covered": True,
}

DRAFT = (
    "## Getting Around\n\n"
    "Lima traffic is heavy, so budget extra time for airport transfers.\n\n"
    "## Where to Stay\n\n"
    "Miraflores is walkable and well connected to the rest of the city.\n"
)


def test_gate_settles_when_the_draft_passes():
    state = {
        "quality": {"audit_complete": True, "overall_score": 9},
        "quality_checks": PASSING_CHECKS,
        "repair_attempts": 0,
    }

    assert route_quality_gate(state) == "settle"


def test_gate_repairs_when_the_draft_fails():
    state = {
        "quality": {"audit_complete": True, "overall_score": 5},
        "quality_checks": PASSING_CHECKS,
        "repair_attempts": 0,
    }

    assert route_quality_gate(state) == "repair"


def test_gate_stops_spending_attempts_once_the_budget_is_gone():
    state = {
        "quality": {"audit_complete": True, "overall_score": 3},
        "quality_checks": PASSING_CHECKS,
        "repair_attempts": P2B_REPAIR_MAX_ATTEMPTS,
    }

    assert route_quality_gate(state) == "settle"


def test_keep_best_prefers_the_higher_score():
    assert is_better_quality({"overall_score": 8}, {"overall_score": 6})
    assert not is_better_quality({"overall_score": 4}, {"overall_score": 6})
    assert is_better_quality({"overall_score": 6}, None)


def test_keep_best_breaks_ties_on_guideline_coverage():
    assert is_better_quality(
        {"overall_score": 7, "guideline_coverage_score": 9},
        {"overall_score": 7, "guideline_coverage_score": 6},
    )
    assert not is_better_quality(
        {"overall_score": 7, "guideline_coverage_score": 6},
        {"overall_score": 7, "guideline_coverage_score": 6},
    )


GROUNDED = {"checked": True, "grounded": True}
UNGROUNDED = {"checked": True, "grounded": False}


def _draft_quality(score, groundedness, **checks):
    """A quality dict shaped the way stage_quality_audit emits one."""
    return {
        "audit_complete": True,
        "overall_score": score,
        "guideline_coverage_score": score,
        "too_close_to_source": False,
        "groundedness": groundedness,
        "constraint_checks": {
            **PASSING_CHECKS,
            "claims_grounded": groundedness["grounded"],
            **checks,
        },
    }


def test_keep_best_prefers_a_grounded_draft_over_a_higher_scoring_ungrounded_one():
    # The reported case: repair removes an invented visa fee and scores 8; the
    # ungrounded original scored 9 and the settle node restored it.
    safe_repair = _draft_quality(8, GROUNDED)
    ungrounded_original = _draft_quality(9, UNGROUNDED)

    assert is_better_quality(safe_repair, ungrounded_original)
    assert not is_better_quality(ungrounded_original, safe_repair)


def test_keep_best_prefers_a_draft_with_fewer_readiness_blockers():
    fewer_blockers = _draft_quality(7, GROUNDED)
    more_blockers = _draft_quality(9, GROUNDED, must_include_covered=False)

    assert is_better_quality(fewer_blockers, more_blockers)
    assert not is_better_quality(more_blockers, fewer_blockers)


def test_keep_best_still_ranks_on_score_when_validity_is_equal():
    assert is_better_quality(_draft_quality(9, GROUNDED), _draft_quality(7, GROUNDED))
    assert not is_better_quality(
        _draft_quality(7, GROUNDED), _draft_quality(9, GROUNDED)
    )


def test_keep_best_prefers_a_checked_grounding_result_over_an_unchecked_one():
    # An outage reports grounded=True; that is a degraded signal, not evidence.
    checked = _draft_quality(8, GROUNDED)
    unchecked = _draft_quality(9, {"checked": False, "grounded": True})

    assert is_better_quality(checked, unchecked)


def test_augmentation_accepted_when_it_only_adds():
    augmented = DRAFT + "\n> [!EDITORIAL-BOX|highlight_callout]\n> Budget extra time.\n"

    accepted, diagnostics = evaluate_augmentation(
        original_content=DRAFT,
        augmented_content=augmented,
    )

    assert accepted is True
    assert diagnostics["retention_ratio"] >= 1.0


def test_augmentation_rejected_when_content_is_truncated():
    accepted, diagnostics = evaluate_augmentation(
        original_content=DRAFT,
        augmented_content="## Getting Around\n\nLima traffic is heavy.\n",
    )

    assert accepted is False
    assert diagnostics["retained_length"] is False
    assert diagnostics["retention_ratio"] < P2B_AUGMENTATION_MIN_RETENTION_RATIO


def test_augmentation_rejected_when_section_headings_are_lost():
    flattened = DRAFT.replace("## ", "")

    accepted, diagnostics = evaluate_augmentation(
        original_content=DRAFT,
        augmented_content=flattened,
    )

    assert accepted is False
    assert diagnostics["retained_headings"] is False


def test_augmentation_rejected_when_empty():
    accepted, diagnostics = evaluate_augmentation(
        original_content=DRAFT,
        augmented_content="",
    )

    assert accepted is False
    assert diagnostics["content_present"] is False


def test_topology_rejects_an_incomplete_node_registry():
    nodes = {name: (lambda state: {}) for name in GENERATION_NODES if name != "repair"}

    with pytest.raises(ValueError, match="missing=\\['repair'\\]"):
        build_prompt2blog_graph(nodes)


def test_topology_rejects_unknown_nodes():
    nodes = {name: (lambda state: {}) for name in GENERATION_NODES}
    nodes["not_a_stage"] = lambda state: {}

    with pytest.raises(ValueError, match="unexpected=\\['not_a_stage'\\]"):
        build_prompt2blog_graph(nodes)
