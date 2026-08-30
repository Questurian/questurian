"""The hard ceiling, and the intake stages a run now passes through.

v3 could not overspend without a person noticing, because the expensive part
before the outline happened in their browser. v4 moves the grill and both
research passes in-app, and neither has an upper bound by construction: the
grill stops at agreement rather than at a question count, and research is
grounded web search.
"""

from __future__ import annotations

import pytest

from app.features.prompt2blog.config import (
    P2B_RUN_TOKEN_BUDGET,
    P2B_RUN_TOKEN_CEILING,
)
from app.features.prompt2blog.run_budget import (
    INTAKE_STAGE_NAMES,
    RunTokenCeilingReached,
    check_run_budget,
    enforce_run_budget,
)


def test_a_run_inside_the_ceiling_continues():
    status = check_run_budget(120_000, stage="stage_v4_research")

    assert status.within_ceiling is True
    assert status.reason == "within_ceiling"


def test_a_run_past_the_ceiling_is_stopped_and_says_what_it_spent():
    with pytest.raises(RunTokenCeilingReached) as error:
        enforce_run_budget(P2B_RUN_TOKEN_CEILING + 1, stage="stage_v4_grill")

    status = error.value.status
    assert status.within_ceiling is False
    assert status.reason == "run_token_ceiling_reached"
    assert status.stage == "stage_v4_grill"
    # The number has to reach the operator, or a ceiling set wrong is a mystery
    # rather than a setting.
    assert status.ceiling == P2B_RUN_TOKEN_CEILING
    assert str(P2B_RUN_TOKEN_CEILING) in str(error.value)


def test_the_ceiling_is_inclusive_of_its_own_value():
    assert check_run_budget(P2B_RUN_TOKEN_CEILING, stage="s").within_ceiling is True


def test_an_unmetered_run_is_unknown_rather_than_free():
    """None is not zero.

    A run nothing is counting has not spent nothing; it has spent an unknown
    amount. Treating that as zero would make the ceiling silently
    unenforceable on exactly the runs where it matters most.
    """
    status = check_run_budget(None, stage="stage_v4_research")

    assert status.tokens_spent is None
    assert status.within_ceiling is True


def test_the_ceiling_is_not_the_repair_budget():
    """Two different questions, and they must not collapse into one.

    The repair budget asks whether one more rescue is affordable and settles
    for the best draft when it is not -- that run still finishes and still
    produces an article. The ceiling asks whether the run may continue at all.
    """
    assert P2B_RUN_TOKEN_CEILING > P2B_RUN_TOKEN_BUDGET


def test_the_status_record_carries_everything_the_receipt_needs():
    record = check_run_budget(90_000, stage="stage_v4_work_order").as_record()

    assert record == {
        "within_ceiling": True,
        "reason": "within_ceiling",
        "tokens_spent": 90_000,
        "ceiling": P2B_RUN_TOKEN_CEILING,
        "stage": "stage_v4_work_order",
    }


def test_the_four_intake_stages_are_named_and_ordered():
    # A run begins at the seed (ADR 0031), so the work before the graph is
    # recorded on the run like any other stage -- which is what makes intake
    # resumable and what puts research on the receipt.
    assert INTAKE_STAGE_NAMES == (
        "stage_v4_grill",
        "stage_v4_brief",
        "stage_v4_work_order",
        "stage_v4_research",
    )


def test_intake_stage_names_cannot_collide_with_graph_stage_names():
    from app.features.prompt2blog.graph.topology_v3 import V3_NODE_STAGE_NAMES

    assert not set(INTAKE_STAGE_NAMES) & set(V3_NODE_STAGE_NAMES.values())


def test_the_ceiling_stops_a_graph_node_before_it_spends():
    """Checked on entry, not after the fact.

    A ceiling that reports overspend once the stage has already paid for it is
    a post-mortem. This one refuses to start the stage.
    """
    from app.features.prompt2blog.orchestrator_v3 import _node

    spent: list[str] = []

    def _stage(_state, _dependencies):
        spent.append("ran")
        return {}

    node = _node("compose", _stage, dependencies=None)

    with pytest.raises(RunTokenCeilingReached):
        node({"tokens_spent": P2B_RUN_TOKEN_CEILING + 1, "trace": []})

    assert spent == [], "the stage ran despite the run being over its ceiling"
