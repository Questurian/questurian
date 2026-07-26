from __future__ import annotations

from .state import YouTube2BlogGraphState


def route_stage_1_gate(state: YouTube2BlogGraphState) -> str:
    return str(state.get("stage1_gate_decision") or "pass")


def route_stage_2_gate(state: YouTube2BlogGraphState) -> str:
    return str(state.get("stage2_gate_decision") or "pass")


def route_stage_3_coverage(state: YouTube2BlogGraphState) -> str:
    coverage = dict(state.get("stage3_coverage") or {})
    missing = coverage.get("missing_sections")
    missing_sections = list(missing) if isinstance(missing, list) else []
    if bool(coverage.get("coverage_sufficient")) or not missing_sections:
        return "compose"
    return "supplement"


def route_stage_3_quality_gate(state: YouTube2BlogGraphState) -> str:
    return str(state.get("stage3_quality_gate_decision") or "pass")


def route_stage_seo_gate(state: YouTube2BlogGraphState) -> str:
    return str(state.get("stage_seo_gate_decision") or "pass")


def route_editorial_gate(state: YouTube2BlogGraphState) -> str:
    return str(state.get("stage_editorial_decision") or "skip")


def route_stage_5_gate(state: YouTube2BlogGraphState) -> str:
    return str(state.get("stage5_gate_decision") or "pass")
