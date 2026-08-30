"""Pure gate decisions for the Prompt2Blog quality loop.

These functions decide whether a draft is good enough, whether another repair
attempt is worth spending, and whether a stage's output is an improvement on
what it replaced. They hold no I/O and no prompt construction.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .config import (
    P2B_AUGMENTATION_MIN_RETENTION_RATIO,
    P2B_REPAIR_ESTIMATED_TOKENS,
    P2B_REPAIR_MAX_ATTEMPTS,
    P2B_RUN_TOKEN_BUDGET,
)
from .quality import (
    HARD_CONSTRAINT_CHECK_KEYS,
    REPAIR_SCORE_THRESHOLD,
    _should_run_repair,
)
from .support import _safe_bool, _safe_dict, _safe_int, _safe_str, _tokenize_words


@dataclass(frozen=True)
class ReadinessVerdict:
    """Whether a finished run may be handed to staging, and why not if not."""

    ready: bool
    blockers: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {"ready": self.ready, "blockers": list(self.blockers)}


def evaluate_readiness(
    *,
    quality: dict[str, Any],
    checks: dict[str, Any],
    groundedness: dict[str, Any],
) -> ReadinessVerdict:
    """Decide whether a settled run is ready for staging.

    Finalize used to ask three questions -- word count, primary keyword,
    `groundedness["grounded"]` -- and shipped anything that answered yes. A
    4/10 article whose repair attempts had all failed still came back
    `ready_for_staging`, and so did a run whose grounding check had crashed,
    because the unchecked result reports `grounded: True` so that a checker
    outage degrades the run instead of blocking it.

    The blocker set is deliberately the repair loop's own trigger conditions
    plus the two failures repair cannot clear (an audit that produced no score,
    and a grounding check that never ran). Blocking on anything repair does not
    try to fix would mark runs `needs_revision` that the pipeline had no way of
    rescuing.
    """
    quality = _safe_dict(quality)
    checks = _safe_dict(checks)
    groundedness = _safe_dict(groundedness)
    blockers: list[str] = []

    # Absent rather than present is the safe default here. `unchecked_groundedness`
    # sets `checked: False, grounded: True`; reading `grounded` alone treats a
    # crashed checker as a pass.
    if not _safe_bool(groundedness.get("checked"), default=False):
        blockers.append("groundedness_unchecked")
    elif not _safe_bool(groundedness.get("grounded"), default=False):
        blockers.append("claims_ungrounded")

    if not _safe_bool(quality.get("audit_complete"), default=False):
        blockers.append("audit_incomplete")
    elif (
        _safe_int(quality.get("overall_score"), default=0) < REPAIR_SCORE_THRESHOLD
    ):
        blockers.append("quality_score_below_threshold")

    if _safe_bool(quality.get("too_close_to_source"), default=False):
        blockers.append("too_close_to_source")

    for key in HARD_CONSTRAINT_CHECK_KEYS:
        if not _safe_bool(checks.get(key), default=True):
            blockers.append(key)

    return ReadinessVerdict(ready=not blockers, blockers=tuple(blockers))


def _length_distance(quality: dict[str, Any]) -> int:
    """How far outside its band a draft is, in words. Zero when inside.

    Keep-best used to compare pass/fail and nothing else, so a repaired draft
    four words over its ceiling and the original forty-one over looked
    identical -- the comparison called it a tie and the settle node restored
    the worse one. A tie on everything measurable is broken by which draft is
    actually closer.
    """
    checks = _safe_dict(_safe_dict(quality).get("constraint_checks"))
    return abs(_safe_int(checks.get("word_count_delta"), default=0))


def _quality_rank(quality: dict[str, Any]) -> tuple[int, int, int, int, int]:
    """Rank a draft for keep-best comparison, validity before quality.

    Ranking on score alone let an unsafe draft win. A repair pass that fixed
    an invented visa fee but scored 8 lost to the ungrounded original scoring
    9, and the settle node restored the ungrounded one.

    So the ordering is: grounded first, then how many readiness blockers the
    draft carries, then the auditor's scores, and last -- only as a tie-break
    -- how far the draft is from its length band. The blocker count is read
    from `evaluate_readiness`, the same function finalize ships on, so a draft
    cannot rank first and then be refused at the gate for a reason ranking
    never looked at.

    Length is last on purpose. It is no longer a gate (#432, A16), and
    promoting it above the auditor's judgement would let a draft win for being
    the right size while being worse to read.
    """
    quality = _safe_dict(quality)
    groundedness = _safe_dict(quality.get("groundedness"))
    verdict = evaluate_readiness(
        quality=quality,
        checks=_safe_dict(quality.get("constraint_checks")),
        groundedness=groundedness,
    )
    grounded = _safe_bool(groundedness.get("checked"), default=False) and _safe_bool(
        groundedness.get("grounded"), default=False
    )
    return (
        1 if grounded else 0,
        -len(verdict.blockers),
        _safe_int(quality.get("overall_score"), default=0),
        _safe_int(quality.get("guideline_coverage_score"), default=0),
        -_length_distance(quality),
    )


def is_better_quality(
    candidate: dict[str, Any],
    incumbent: dict[str, Any] | None,
) -> bool:
    """True when ``candidate`` should replace ``incumbent`` as the best draft.

    Repair used to overwrite the draft unconditionally, so a repair pass that
    scored worse than the draft it replaced still shipped. Ranking then ran on
    scores alone, so a safer draft could still lose to a higher-scoring unsafe
    one; see `_quality_rank`.
    """
    if not incumbent:
        return True
    return _quality_rank(candidate) > _quality_rank(incumbent)


@dataclass(frozen=True)
class RepairDecision:
    """Whether to spend a repair attempt, and everything that decided it.

    The gate used to answer with a bare "repair"/"settle" string, so a run that
    stopped short left no record of why: an operator reading a `needs_revision`
    article could not tell a draft the auditor had passed on from one the
    pipeline refused to keep paying for. The reason, the problems found, and
    the spend at the moment of the decision all travel together.
    """

    route: str
    reason: str
    problems: tuple[str, ...]
    attempts_used: int
    attempts_allowed: int
    tokens_spent: int | None
    tokens_per_attempt: int
    token_budget: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "route": self.route,
            "reason": self.reason,
            "problems": list(self.problems),
            "attempts_used": self.attempts_used,
            "attempts_allowed": self.attempts_allowed,
            "tokens_spent": self.tokens_spent,
            "tokens_per_attempt": self.tokens_per_attempt,
            "token_budget": self.token_budget,
        }


def decide_repair(state: dict[str, Any]) -> RepairDecision:
    """Decide whether another repair attempt is worth spending.

    Three refusals, in the order they are cheapest to establish:

    1. The draft is good enough -- nothing to repair.
    2. The attempt allowance is used up. One automatic attempt, not two: the
       second was buying score points at a whole extra repair chain's price.
    3. The run has spent so much already that the next attempt would carry it
       past `P2B_RUN_TOKEN_BUDGET`. Refusing here is what makes a bad run's
       cost predictable instead of open-ended.

    A run with no token tracker (every test double) skips only the third
    check; it behaves exactly as it did before the budget existed.
    """
    quality = _safe_dict(state.get("quality"))
    checks = _safe_dict(state.get("quality_checks"))
    attempts = _safe_int(state.get("repair_attempts"), default=0)
    tokens_spent = state.get("tokens_spent")
    tokens_spent = (
        _safe_int(tokens_spent, default=0) if isinstance(tokens_spent, int) else None
    )
    problems = evaluate_readiness(
        quality=quality,
        checks=checks,
        groundedness=_safe_dict(quality.get("groundedness")),
    ).blockers

    def verdict(route: str, reason: str) -> RepairDecision:
        return RepairDecision(
            route=route,
            reason=reason,
            problems=problems,
            attempts_used=attempts,
            attempts_allowed=P2B_REPAIR_MAX_ATTEMPTS,
            tokens_spent=tokens_spent,
            tokens_per_attempt=P2B_REPAIR_ESTIMATED_TOKENS,
            token_budget=P2B_RUN_TOKEN_BUDGET,
        )

    if not _should_run_repair(quality, checks):
        return verdict("settle", "draft_passed_audit")
    if attempts >= P2B_REPAIR_MAX_ATTEMPTS:
        return verdict("settle", "attempt_limit_reached")
    if (
        tokens_spent is not None
        and tokens_spent + P2B_REPAIR_ESTIMATED_TOKENS > P2B_RUN_TOKEN_BUDGET
    ):
        return verdict("settle", "token_budget_reached")
    return verdict("repair", "repairable_problems_found")


def route_quality_gate(state: dict[str, Any]) -> str:
    """Decide whether to spend another repair attempt or settle on the best
    draft seen so far."""
    return decide_repair(state).route


def _count_section_headings(content: str) -> int:
    return len(re.findall(r"(?m)^\s{0,3}#{2,6}\s+\S", _safe_str(content)))


def evaluate_augmentation(
    *,
    original_content: str,
    augmented_content: str,
) -> tuple[bool, dict[str, Any]]:
    """Decide whether augmented content may replace the draft it augmented.

    Editorial augmentation is additive by contract: it inserts callouts and
    boxes into an existing article. Content that comes back materially shorter,
    or that has lost the article's section structure, is a regression rather
    than an augmentation and is rolled back.
    """
    original_words = len(_tokenize_words(original_content))
    augmented_words = len(_tokenize_words(augmented_content))
    original_headings = _count_section_headings(original_content)
    augmented_headings = _count_section_headings(augmented_content)

    retention_ratio = 1.0
    if original_words:
        retention_ratio = augmented_words / original_words

    checks = {
        "content_present": bool(_safe_str(augmented_content)),
        "retained_length": retention_ratio >= P2B_AUGMENTATION_MIN_RETENTION_RATIO,
        "retained_headings": augmented_headings >= original_headings,
    }
    diagnostics = {
        **checks,
        "retention_ratio": round(retention_ratio, 3),
        "original_word_count": original_words,
        "augmented_word_count": augmented_words,
        "original_heading_count": original_headings,
        "augmented_heading_count": augmented_headings,
    }
    return all(checks.values()), diagnostics
