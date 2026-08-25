from __future__ import annotations

from typing import Any

from ...content.markdown import _build_markdown
from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...policies import evaluate_readiness
from ...pricing import Prompt2BlogTokenUsageTracker
from ...quality import _build_constraint_checks
from ...quality_v3 import v3_constraint_brief
from ...support import _safe_dict, _safe_str


def run_v3_finalize_stage(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Persist the finished article with the commission it answers.

    The artifact keeps the commission, the form and modules, the audience, the
    evidence receipt, and the readiness outcome, so a finished run can be
    audited later without replaying it or trusting the prose.
    """
    stage = "stage_v3_finalize"
    run_id = state["run_id"]
    rewrite = state["rewrite"]
    quality = state["quality"]
    quality_checks = state["quality_checks"]
    commission = state["commission"]
    instructions = state["instructions"]
    evidence = state["evidence"]
    dependencies.recorder.start_stage(run_id, stage)

    final_title = dependencies.normalize_dashes(state["final_title"])
    final_content = rewrite["improved_content"]
    final_markdown = _build_markdown(final_title, final_content)
    final_checks = _build_constraint_checks(
        final_title,
        final_content,
        v3_constraint_brief(commission, state["option_context"]),
    )
    settled_checks = {
        **quality_checks,
        **{
            key: value
            for key, value in final_checks.items()
            if not key.endswith("_coverage") and key != "word_count_estimate"
        },
    }
    verdict = evaluate_readiness(
        quality=quality,
        checks=settled_checks,
        groundedness=state["groundedness"],
    )
    pipeline_status = "ready_for_staging" if verdict.ready else "needs_revision"

    dependencies.recorder.record_stage(
        run_id,
        stage,
        {
            "pipeline_status": pipeline_status,
            "readiness_blockers": list(verdict.blockers),
            "final_title": final_title,
            "word_count_estimate": final_checks["word_count_estimate"],
            "constraint_checks": final_checks,
        },
    )

    usage_summary = getattr(dependencies.llm, "usage_summary", None)
    usage_kwargs = {
        "stack_id": state.get("model_stack_id"),
        "worker_model": state["model_name"],
        "writing_model": state["writing_model"],
        "audit_model": state["audit_model"],
    }
    run_cost = (
        usage_summary(**usage_kwargs)
        if callable(usage_summary)
        else Prompt2BlogTokenUsageTracker().summary(**usage_kwargs)
    )
    instruction_meta = _safe_dict(instructions.get("instruction_meta"))

    response_payload: dict[str, Any] = {
        "message": "Prompt2Blog pipeline v3 completed",
        "run_id": run_id,
        "schema_version": 3,
        "status": "completed",
        "pipeline_status": pipeline_status,
        "readiness_blockers": list(verdict.blockers),
        "commission": commission,
        "form": {
            "id": instruction_meta.get("form_id"),
            "label": instruction_meta.get("form_label"),
        },
        "instruction_meta": instruction_meta,
        "evidence_receipt": instruction_meta.get("evidence_receipt", {}),
        "improved_article": {"title": final_title, "content": final_content},
        "final_markdown": final_markdown,
        "run_cost": run_cost,
        "input_profiles": {
            "tone": _safe_dict(state["option_context"].get("tone")),
            "length": _safe_dict(state["option_context"].get("length")),
            "brand_voice": _safe_dict(state["option_context"].get("brand_voice")),
            "creativity_level": _safe_str(
                state["option_context"].get("creativity_level")
            ),
        },
        "quality_review": {
            "alignment_summary": rewrite["guideline_alignment_summary"],
            "improvements_applied": rewrite["improvements_applied"],
            "remaining_gaps": rewrite["remaining_gaps"],
            "quality_summary": quality["quality_summary"],
            "quality_scores": {
                "overall": quality["overall_score"],
                "commission_fidelity": quality["guideline_coverage_score"],
                "informativeness": quality["informativeness_score"],
                "originality": quality["originality_score"],
                "brief_adherence": quality["brief_adherence_score"],
                "seo": quality["seo_score"],
            },
            "constraint_checks": settled_checks,
            "readiness_blockers": list(verdict.blockers),
            "word_count_estimate": final_checks["word_count_estimate"],
            "repair_applied": state.get("repair_applied", False),
            "repair_attempts": state.get("repair_attempts", 0),
            "groundedness": state["groundedness"],
            "outline_accepted": state.get("outline_accepted", False),
            "outline_section_count": len(
                _safe_dict(state.get("outline")).get("sections") or []
            ),
            "outline_unsupported_requirements": _safe_dict(state.get("outline")).get(
                "unsupported_requirements", []
            ),
            "model_used": state["model_name"],
            "stage_model_overrides": {
                "stage_v3_outline": state["writing_model"],
                "stage_v3_compose": state["writing_model"],
                "stage_v3_repair": state["writing_model"],
                "stage_v3_title": state["writing_model"],
                "stage_v3_quality_audit": state["audit_model"],
                "stage_v3_groundedness": state["audit_model"],
            },
        },
    }
    if state["include_debug"]:
        response_payload["debug"] = {
            "pipeline_input": {
                "commission_fingerprint": commission["commission_fingerprint"],
                "form_id": commission["form_id"],
                "topic_module_ids": list(commission["topic_module_ids"]),
                "model_name": state["model_name"],
                "writing_model": state["writing_model"],
                "audit_model": state["audit_model"],
                "model_stack_id": state.get("model_stack_id"),
                "include_debug": state["include_debug"],
                "input_profiles": state["option_context"],
            },
            "instruction_text": instructions.get("instruction_text", ""),
            "evidence_records": evidence.get("records_text", ""),
            "pipeline_trace": state["trace"],
        }

    dependencies.recorder.record_stage(run_id, "pipeline_v3", response_payload)
    dependencies.recorder.record_artifact(
        run_id,
        {
            "markdown": final_markdown,
            "pipeline_v3": response_payload,
            "stages": {
                "stage_v3_outline": state.get("outline", {}),
                "stage_v3_compose": rewrite,
                "stage_v3_groundedness": state["groundedness"],
                "stage_v3_quality_audit": quality,
                "stage_v3_title": {"final_title": final_title},
            },
        },
    )
    dependencies.recorder.complete(run_id)
    return {
        "current_stage": stage,
        "rewrite": rewrite,
        "final_title": final_title,
        "final_markdown": final_markdown,
        "response_payload": response_payload,
        "completed": True,
    }
