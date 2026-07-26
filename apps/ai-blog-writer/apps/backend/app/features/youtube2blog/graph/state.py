from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypedDict


class YouTube2BlogGraphState(TypedDict, total=False):
    run_id: str
    forced_article_type: str | None
    stage1: dict[str, Any]
    stage1_retry_count: int
    stage1_gate_decision: str
    stage2: dict[str, Any]
    stage2_retry_count: int
    stage2_gate_decision: str
    stage3_guideline: str
    stage3_coverage: dict[str, Any]
    stage3_supplement: dict[str, str]
    stage3: dict[str, Any]
    stage3_quality_retry_count: int
    stage3_quality_gate: dict[str, Any]
    stage3_quality_feedback: dict[str, Any]
    stage3_quality_gate_decision: str
    stage3_for_editorial: dict[str, Any]
    stage_seo_brief: dict[str, Any]
    stage_seo: dict[str, Any]
    stage_seo_retry_count: int
    stage_seo_gate: dict[str, Any]
    stage_seo_feedback: str
    stage_seo_gate_decision: str
    stage_seo_rollback: dict[str, Any]
    stage_editorial_gate: dict[str, Any]
    stage_editorial_decision: str
    stage_editorial: dict[str, Any]
    stage3_for_title: dict[str, Any]
    stage4: dict[str, Any]
    stage5_retry_count: int
    stage5_gate: dict[str, Any]
    stage5_gate_decision: str
    stage5_feedback: str
    stage_results: dict[str, dict[str, Any]]
    markdown: str


GraphNode = Callable[[YouTube2BlogGraphState], YouTube2BlogGraphState]
