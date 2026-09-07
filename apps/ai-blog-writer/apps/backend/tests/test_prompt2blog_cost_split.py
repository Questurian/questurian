"""Money that left an account, kept apart from money that did not.

Claude runs on the flat Claude Code subscription. The CLI reports what each
call would have cost at API rates, and that figure was being added straight
into the run's headline cost beside real per-token Vertex spend. On the two
runs already measured in this repo -- chifa 3750891f at $0.36 billed beside
$2.29 notional, ceviche 8a7e9aa4 at $0.38 beside $1.97 -- the receipt reported
roughly seven times the money that actually moved.

The budget breaker (`run_billed_cost_usd`) always read the two apart. Nothing
that reported a figure to a person did.
"""

from __future__ import annotations

from app.features.prompt2blog.editor_spend import EditorAttempt, EditorSpend
from app.features.prompt2blog.pricing import (
    COST_BASIS_MEASURED,
    COST_BASIS_RATE_TABLE,
    Prompt2BlogTokenUsageTracker,
    run_billed_cost_usd,
)

VERTEX_USAGE = {"input_tokens": 1000, "output_tokens": 500, "total_tokens": 1500}


class _Llm:
    def __init__(self, tracker):
        self.usage_tracker = tracker


def _run_with_both_kinds() -> Prompt2BlogTokenUsageTracker:
    tracker = Prompt2BlogTokenUsageTracker(run_id="run-1")
    tracker.begin_stage("p2b.audit")
    tracker.record("gemini-2.5-flash", VERTEX_USAGE)
    tracker.begin_stage("p2b.compose")
    # What a subscription call looks like: the CLI reports its own price, and
    # the tracker files it as `measured`.
    tracker.record(
        "claude-sonnet-5-medium",
        {**VERTEX_USAGE, "measured_cost_usd": 2.29},
    )
    return tracker


def test_a_subscription_call_is_not_added_to_billed_spend():
    split = _run_with_both_kinds().cost_split()

    assert split["subscription_cost_usd"] == 2.29
    assert 0 < split["billed_cost_usd"] < 0.01
    assert split["billed_cost_usd"] != split["subscription_cost_usd"]


def test_the_split_agrees_with_the_budget_breaker():
    """One rule, not two. The breaker was already right; this is the same
    answer, exposed where a person reads it."""
    tracker = _run_with_both_kinds()

    assert tracker.cost_split()["billed_cost_usd"] == round(
        run_billed_cost_usd(_Llm(tracker)), 6
    )


def test_the_run_summary_publishes_both_figures():
    summary = _run_with_both_kinds().summary(
        stack_id=None, worker_model=None, writing_model=None, audit_model=None
    )

    assert summary["subscription_cost_usd"] == 2.29
    assert summary["billed_cost_usd"] < 0.01
    # The old mixed field survives for runs recorded before the split, and is
    # visibly the sum of two things that should not be summed.
    assert summary["estimated_cost_usd"] > summary["billed_cost_usd"]


def test_the_ledger_carries_the_split_too():
    ledger = _run_with_both_kinds().ledger()

    assert ledger["cost"]["subscription_cost_usd"] == 2.29
    assert ledger["cost"]["unpriced_calls"] == 0


def test_a_call_nobody_priced_is_counted_not_costed():
    tracker = Prompt2BlogTokenUsageTracker(run_id="run-1")
    tracker.begin_stage("p2b.compose")
    tracker.record("some-unknown-model", VERTEX_USAGE)

    split = tracker.cost_split()
    assert split["billed_cost_usd"] == 0.0
    assert split["subscription_cost_usd"] == 0.0
    assert split["unpriced_calls"] == 1


def test_editor_spend_splits_the_same_way():
    """The section edit runs on Claude and its review on Gemini, so a single
    editor total would make the same mistake on a smaller number."""
    spend = EditorSpend(
        attempts=[
            EditorAttempt(
                attempt_id="a1",
                kind="propose",
                cost_usd=0.08,
                cost_basis=COST_BASIS_MEASURED,
            ),
            EditorAttempt(
                attempt_id="a2",
                kind="review",
                cost_usd=0.002,
                cost_basis=COST_BASIS_RATE_TABLE,
            ),
            EditorAttempt(attempt_id="a3", kind="propose"),
        ]
    )

    totals = spend.totals()
    assert totals["subscription_cost_usd"] == 0.08
    assert totals["billed_cost_usd"] == 0.002
    assert totals["priced_attempts"] == 2
    assert totals["unmeasured_attempts"] == 1
