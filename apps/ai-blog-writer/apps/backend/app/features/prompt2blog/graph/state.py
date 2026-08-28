from __future__ import annotations

from typing import Any, TypedDict

from ..models import (
    PipelineV2RuntimeRequest,
    PipelineV3RuntimeRequest,
    Prompt2BlogInputRequest,
)


class Prompt2BlogGraphState(TypedDict, total=False):
    run_id: str
    input_request: Prompt2BlogInputRequest
    request: PipelineV2RuntimeRequest
    model_name: str
    writing_model: str
    audit_model: str
    model_stack_id: str | None
    cleaned_data: str
    raw_sources: list[str]
    raw_sources_text: str
    writing_brief: dict[str, Any]
    option_context: dict[str, Any]
    narrative_focus: str
    style_directive: str
    hard_constraints: str
    compose_temperature: float
    include_debug: bool
    enable_editorial_augmentation: bool
    current_stage: str
    trace: list[dict[str, Any]]
    guideline: dict[str, Any]
    coverage: dict[str, Any]
    supplemental_content: str
    outline: dict[str, Any]
    outline_accepted: bool
    outline_text: str
    rewrite: dict[str, Any]
    groundedness: dict[str, Any]
    quality: dict[str, Any]
    quality_checks: dict[str, Any]
    repair_applied: bool
    repair_attempts: int
    best_rewrite: dict[str, Any]
    best_quality: dict[str, Any]
    best_quality_checks: dict[str, Any]
    augmentation_rolled_back: bool
    content_changed_by_augmentation: bool
    editorial_augmentation: dict[str, Any]
    editorial_augmentation_raw_response: str
    final_title: str
    final_markdown: str
    response_payload: dict[str, Any]
    completed: bool


class Prompt2BlogV3GraphState(TypedDict, total=False):
    """State for the v3 graph.

    Kept separate from the v2 state on purpose. The v3 path carries the whole
    commission, the exact evidence records, and one assembled instruction
    stack; it has no article type, no guideline pair, and no supplemental
    content, because v3 never synthesizes a missing fact.
    """

    run_id: str
    request: PipelineV3RuntimeRequest
    commission: dict[str, Any]
    evidence: dict[str, Any]
    instructions: dict[str, Any]
    instruction_text: str
    headline_instructions: str
    option_context: dict[str, Any]
    model_name: str
    outline_model: str
    writing_model: str
    groundedness_model: str
    audit_model: str
    title_model: str
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
    best_rewrite: dict[str, Any]
    best_quality: dict[str, Any]
    best_quality_checks: dict[str, Any]
    final_title: str
    final_markdown: str
    response_payload: dict[str, Any]
    completed: bool
