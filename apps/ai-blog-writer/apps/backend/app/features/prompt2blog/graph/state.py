from __future__ import annotations

from typing import Any, TypedDict

from ..models import PipelineV4RuntimeRequest


class Prompt2BlogV3GraphState(TypedDict, total=False):
    """State for the v3 graph.

    Kept separate from the v2 state on purpose. The v3 path carries the whole
    brief, the work order, the exact evidence records, and stage-specific instruction
    contexts; it has no article type, no guideline pair, and no supplemental
    content, because v3 never synthesizes a missing fact.
    """

    run_id: str
    request: PipelineV4RuntimeRequest
    # How many times this run has been resumed after a failure. Zero on a
    # first attempt; carried through every later leg so the article's own
    # record says whether it was written in one pass.
    resume_count: int
    brief: dict[str, Any]
    work_order: dict[str, Any]
    evidence: dict[str, Any]
    instructions: dict[str, Any]
    stage_contexts: dict[str, Any]
    option_context: dict[str, Any]
    model_name: str
    outline_model: str
    writing_model: str
    repair_model: str
    groundedness_model: str
    audit_model: str
    model_stack_id: str | None
    compose_temperature: float
    include_debug: bool
    enable_editorial_augmentation: bool
    current_stage: str
    trace: list[dict[str, Any]]
    readiness: dict[str, Any]
    outline: dict[str, Any]
    outline_accepted: bool
    outline_text: str
    rewrite: dict[str, Any]
    groundedness: dict[str, Any]
    quality: dict[str, Any]
    quality_checks: dict[str, Any]
    repair_applied: bool
    repair_attempts: int
    # Why the quality gate routed the way it did, and the run's spend at that
    # moment. Written by the audit stage, read by finalize and the operator UI.
    repair_decision: dict[str, Any]
    tokens_spent: int | None
    # Money billed so far, Claude's subscription calls excluded because they
    # bill nothing. The repair gate reads this rather than the tokens above.
    billed_cost_usd: float | None
    best_rewrite: dict[str, Any]
    best_quality: dict[str, Any]
    best_quality_checks: dict[str, Any]
    # The seed, set before the graph runs (ADR 0034). No stage writes it.
    final_title: str
    final_markdown: str
    response_payload: dict[str, Any]
    completed: bool
