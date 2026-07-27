from __future__ import annotations

from typing import Any

from app.shared.prompts import ANTI_AI_TELLS_FULL

from ..dependencies import PipelineDependencies
from ..graph.state import Prompt2BlogGraphState
from ..observability import _append_stage_trace
from ..prompts.generation import SEO_SAFE_CONTENT_GENERATION_GUIDELINES
from ..prompts.quality import P2B_QUALITY_AUDIT_PROMPT, P2B_REPAIR_PROMPT
from ..policies import is_better_quality
from ..quality import (
    _build_constraint_checks,
    _sanitize_quality,
    _sanitize_rewrite,
    unchecked_groundedness,
)
from ..support import _json


def _audit_rewrite(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
    rewrite: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], str, str, dict[str, Any]]:
    guideline = state["guideline"]
    prompt = P2B_QUALITY_AUDIT_PROMPT.format(
        raw_sources=state["raw_sources_text"],
        cleaned_data=state["cleaned_data"],
        rewritten_title=rewrite["improved_title"],
        rewritten_content=rewrite["improved_content"],
        article_type_name=guideline["name"],
        guideline=guideline["guideline"] or "No guideline provided.",
        title_guideline=guideline["title_guideline"] or "No title guideline provided.",
        writing_brief_json=_json(state["writing_brief"]),
        seo_guideline=SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
        hard_constraints=state["hard_constraints"],
        style_directive=state["style_directive"],
    )
    parsed, raw_response = dependencies.llm.invoke_json(
        prompt=prompt,
        max_tokens=1536,
        temperature=0.05,
        model_name=state["audit_model"],
    )
    quality = _sanitize_quality(parsed)
    computed_checks = _build_constraint_checks(
        rewrite["improved_title"],
        rewrite["improved_content"],
        state["writing_brief"],
    )
    # The auditor supplies the semantic checks; everything measurable is
    # computed here and wins. Non-boolean measurements are reported alongside
    # the checks rather than inside them.
    measurements = {
        "word_count_estimate",
        "secondary_keyword_coverage",
        "must_include_coverage",
    }
    groundedness = state.get("groundedness") or unchecked_groundedness()
    quality_checks = {
        **quality.get("constraint_checks", {}),
        **{
            key: value
            for key, value in computed_checks.items()
            if key not in measurements
        },
        "claims_grounded": groundedness["grounded"],
    }
    quality["constraint_checks"] = quality_checks
    quality["word_count_estimate"] = computed_checks["word_count_estimate"]
    quality["secondary_keyword_coverage"] = computed_checks[
        "secondary_keyword_coverage"
    ]
    quality["groundedness"] = groundedness
    return quality, quality_checks, prompt, raw_response, parsed


def run_quality_audit_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_quality_audit"
    run_id = state["run_id"]
    attempt = state.get("repair_attempts", 0)
    dependencies.recorder.start_stage(run_id, stage)

    rewrite = state["rewrite"]
    quality, checks, prompt, raw_response, parsed = _audit_rewrite(
        state,
        dependencies,
        rewrite,
    )

    # Track the best draft seen across the repair loop so a repair pass that
    # scores worse than the draft it replaced cannot ship.
    updates: dict[str, Any] = {
        "current_stage": stage,
        "quality": quality,
        "quality_checks": checks,
    }
    if is_better_quality(quality, state.get("best_quality")):
        updates["best_rewrite"] = rewrite
        updates["best_quality"] = quality
        updates["best_quality_checks"] = checks

    dependencies.recorder.record_stage(
        run_id,
        stage,
        {"quality": quality, "raw_response": raw_response, "attempt": attempt},
    )
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        model_name=state["audit_model"],
        input_payload={"attempt": attempt},
        prompt=prompt,
        raw_response=raw_response,
        parsed=parsed,
        output=quality,
    )
    return updates


def run_repair_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Rewrite the draft against the auditor's required revisions.

    The graph decides whether this node runs and re-gates the result, so the
    stage no longer owns the decision and no longer re-audits its own output.
    """
    stage = "stage_repair"
    run_id = state["run_id"]
    guideline = state["guideline"]
    rewrite = state["rewrite"]
    quality = state["quality"]
    attempt = state.get("repair_attempts", 0) + 1
    dependencies.recorder.start_stage(run_id, stage)

    # Unsupported claims are revisions in their own right. Without this the
    # grounding check could fail the gate but never tell repair what to fix.
    groundedness = state.get("groundedness") or unchecked_groundedness()
    required_revisions = list(quality.get("required_revisions", []))
    required_revisions.extend(
        f"Remove or explicitly mark as unconfirmed: {claim['claim']} "
        f"({claim['reason']})"
        for claim in groundedness["unsupported_claims"]
    )

    prompt = P2B_REPAIR_PROMPT.format(
        raw_sources=state["raw_sources_text"],
        cleaned_data=state["cleaned_data"],
        previous_title=rewrite["improved_title"],
        previous_content=rewrite["improved_content"],
        required_revisions=_json(required_revisions),
        article_type_name=guideline["name"],
        guideline=guideline["guideline"] or "No guideline provided.",
        title_guideline=guideline["title_guideline"] or "No title guideline provided.",
        writing_brief_json=_json(state["writing_brief"]),
        seo_guideline=SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
        narrative_focus=state["narrative_focus"],
        style_directive=state["style_directive"],
        hard_constraints=state["hard_constraints"],
    )
    prompt = f"{prompt}\n\n{ANTI_AI_TELLS_FULL}"
    # Repair rewrites the whole article, so it runs on the writer model.
    # Routing it to the analysis model downgraded every repaired run.
    parsed, raw_response = dependencies.llm.invoke_json(
        prompt=prompt,
        max_tokens=6144,
        temperature=0.1,
        model_name=state["writing_model"],
    )
    repaired = _sanitize_rewrite(
        parsed,
        fallback_title=rewrite["improved_title"],
        fallback_content=rewrite["improved_content"],
    )
    repaired["improved_content"] = dependencies.llm.enforce_anti_ai(
        repaired["improved_content"],
        model_name=state["writing_model"],
        max_tokens=6144,
        context="prompt2blog repair",
    )
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        model_name=state["writing_model"],
        input_payload={"attempt": attempt},
        prompt=prompt,
        raw_response=raw_response,
        parsed=parsed,
        output={"rewrite": repaired},
    )

    dependencies.recorder.record_stage(
        run_id,
        stage,
        {
            "repair_applied": True,
            "attempt": attempt,
            "rewrite": repaired,
            "required_revisions": required_revisions,
            "raw_response": raw_response,
        },
    )
    return {
        "current_stage": stage,
        "repair_applied": True,
        "repair_attempts": attempt,
        "rewrite": repaired,
    }


def run_quality_settle_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Settle on the best-scoring draft produced during the repair loop.

    Repair previously replaced the draft unconditionally, so a repair pass that
    scored worse than the draft it replaced still shipped.
    """
    stage = "stage_quality_settle"
    run_id = state["run_id"]
    dependencies.recorder.start_stage(run_id, stage)

    best_rewrite = state.get("best_rewrite") or state["rewrite"]
    best_quality = state.get("best_quality") or state["quality"]
    best_checks = state.get("best_quality_checks") or state["quality_checks"]
    rolled_back = best_rewrite is not state["rewrite"]

    settlement = {
        "repair_attempts": state.get("repair_attempts", 0),
        "repair_applied": state.get("repair_applied", False),
        "reverted_to_earlier_draft": rolled_back,
        "final_overall_score": best_quality.get("overall_score"),
        "last_overall_score": state["quality"].get("overall_score"),
    }
    dependencies.recorder.record_stage(run_id, stage, settlement)
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        output=settlement,
    )
    return {
        "current_stage": stage,
        "rewrite": best_rewrite,
        "quality": best_quality,
        "quality_checks": best_checks,
    }
