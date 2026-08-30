"""The hard per-run token ceiling, and what a run costs before writing starts.

v3 needed neither. Its first model call was the outline; everything before it
happened in the operator's browser, on their own chatbot subscription, and was
invisible to the system that billed for the rest. v4 moves the grill, the work
order and both research passes in-app (ADR 0030), so a run's spend now starts
at the seed and the receipt has to cover all of it.

That also removes the thing that used to bound a run: a person got bored of
pasting. The grill stops at agreement rather than at a question count, and
research is grounded web search. Neither has an upper bound by construction,
so one exists here instead.

This is not the repair budget. `P2B_RUN_TOKEN_BUDGET` asks whether one more
rescue attempt is affordable and settles for the best draft when it is not --
a run that hits it still finishes and still produces an article. Hitting the
ceiling means the run stops.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .config import P2B_RUN_TOKEN_CEILING
from .support import _safe_int


# The intake stages, in the order a run passes through them. They are recorded
# on the run exactly like graph nodes are, because a run now begins at the seed
# (ADR 0031) and the four stages before the graph are real work with real cost.
INTAKE_STAGE_NAMES = (
    "stage_v4_grill",
    "stage_v4_brief",
    "stage_v4_work_order",
    "stage_v4_research",
)


@dataclass(frozen=True)
class RunBudgetStatus:
    """Whether this run may continue, and what it has spent getting here."""

    within_ceiling: bool
    tokens_spent: int | None
    ceiling: int
    stage: str

    @property
    def reason(self) -> str:
        if self.within_ceiling:
            return "within_ceiling"
        return "run_token_ceiling_reached"

    def as_record(self) -> dict[str, Any]:
        """The shape the run records, so the number is visible on the receipt."""
        return {
            "within_ceiling": self.within_ceiling,
            "reason": self.reason,
            "tokens_spent": self.tokens_spent,
            "ceiling": self.ceiling,
            "stage": self.stage,
        }


class RunTokenCeilingReached(RuntimeError):
    """Raised to stop a run that has spent past its ceiling."""

    def __init__(self, status: RunBudgetStatus) -> None:
        super().__init__(
            f"Prompt2Blog run stopped at {status.stage}: spent "
            f"{status.tokens_spent} tokens against a ceiling of {status.ceiling}."
        )
        self.status = status


def check_run_budget(
    tokens_spent: Any,
    *,
    stage: str,
    ceiling: int = P2B_RUN_TOKEN_CEILING,
) -> RunBudgetStatus:
    """Ask whether a run may continue into ``stage``.

    ``tokens_spent`` of None means nothing is counting, which is not the same
    as zero: an unmetered run is not a free one, and treating it as zero would
    make the ceiling silently unenforceable. It is reported as unknown and the
    run is allowed to continue, matching how the repair budget already treats
    an absent count.
    """
    if tokens_spent is None:
        return RunBudgetStatus(True, None, ceiling, stage)
    spent = _safe_int(tokens_spent, default=0)
    return RunBudgetStatus(spent <= ceiling, spent, ceiling, stage)


def enforce_run_budget(
    tokens_spent: Any,
    *,
    stage: str,
    ceiling: int = P2B_RUN_TOKEN_CEILING,
) -> RunBudgetStatus:
    """Check the ceiling and stop the run when it has been passed."""
    status = check_run_budget(tokens_spent, stage=stage, ceiling=ceiling)
    if not status.within_ceiling:
        raise RunTokenCeilingReached(status)
    return status
