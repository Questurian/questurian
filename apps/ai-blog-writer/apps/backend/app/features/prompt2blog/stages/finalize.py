from __future__ import annotations

from typing import Any

from ..content.markdown import _build_markdown
from ..dependencies import PipelineDependencies
from ..graph.state import Prompt2BlogGraphState
from ..policies import evaluate_readiness
from ..pricing import Prompt2BlogTokenUsageTracker
from ..quality import _build_constraint_checks
from ..support import _safe_dict, _safe_str


def run_finalize_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_finalize"
    run_id = state["run_id"]
    rewrite = state["rewrite"]
    quality = state["quality"]
    quality_checks = state["quality_checks"]
    augmentation = state["editorial_augmentation"]
    guideline = state["guideline"]
    dependencies.recorder.start_stage(run_id, stage)

    final_title = dependencies.normalize_dashes(state["final_title"])
    # Compose, repair and augmentation each enforce the anti-AI rules on the
    # prose they produce. Re-enforcing here re-validated already-enforced text
    # and, because finalize runs after the quality audit, made an unaudited
    # rewrite the last thing to touch the shipped article.
    final_content = rewrite["improved_content"]
    final_markdown = _build_markdown(final_title, final_content)
    final_checks = _build_constraint_checks(
        final_title,
        final_content,
        state["writing_brief"],
    )
    # The checks the run is judged on: the auditor's semantic verdicts and the
    # grounding result carried forward, with every measurable check recomputed
    # on the text that is actually shipping.
    settled_checks = {
        **quality_checks,
        **{
            key: value
            for key, value in final_checks.items()
            if not key.endswith("_coverage") and key != "word_count_estimate"
        },
    }
    # Readiness is one shared decision (see policies.evaluate_readiness), not a
    # third opinion. Finalize used to accept any draft that hit its word count
    # and primary keyword and reported `grounded`, which passed low-scoring
    # articles and crashed grounding checks alike.
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
    # Summarised after this stage is recorded, so the `by_stage` breakdown the
    # receipt shows includes finalize itself rather than stopping one row short.
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

    response_payload: dict[str, Any] = {
        "message": "Prompt2Blog pipeline v2 completed",
        "run_id": run_id,
        "pipeline_status": pipeline_status,
        "readiness_blockers": list(verdict.blockers),
        "article_type": {
            "id": guideline["id"],
            "name": guideline["name"],
            "definition": guideline["definition"],
        },
        "guideline_meta": {
            "guideline": guideline["guideline"],
            "title_guideline": guideline["title_guideline"],
            "guideline_file": guideline.get("guideline_file"),
            "title_guideline_file": guideline.get("title_guideline_file"),
        },
        "improved_article": {
            "title": final_title,
            "content": final_content,
        },
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
                "guideline_coverage": quality["guideline_coverage_score"],
                "informativeness": quality["informativeness_score"],
                "originality": quality["originality_score"],
                "brief_adherence": quality["brief_adherence_score"],
                "seo": quality["seo_score"],
            },
            # audience_match and tone_match come from the auditor and pass
            # through; the measurable checks are recomputed on the final text.
            "constraint_checks": settled_checks,
            "readiness_blockers": list(verdict.blockers),
            "secondary_keyword_coverage": final_checks["secondary_keyword_coverage"],
            "must_include_coverage": final_checks["must_include_coverage"],
            "word_count_estimate": final_checks["word_count_estimate"],
            "repair_applied": state["repair_applied"],
            "repair_attempts": state.get("repair_attempts", 0),
            "editorial_augmentation_rolled_back": state.get(
                "augmentation_rolled_back", False
            ),
            "editorial_augmentation_applied": augmentation["augmentation_applied"],
            "editorial_components_added": augmentation["components_added"],
            "editorial_augmentation_summary": augmentation["augmentation_summary"],
            "editorial_diagnostic": augmentation["diagnostic"],
            "coverage": state["coverage"],
            "groundedness": state["groundedness"],
            "outline_accepted": state["outline_accepted"],
            "outline_section_count": len(state["outline"].get("sections") or []),
            "outline_unsupported_requests": state["outline"].get(
                "unsupported_requests", []
            ),
            "model_used": state["model_name"],
            "stage_model_overrides": {
                "stage_outline": state["writing_model"],
                "stage_compose": state["writing_model"],
                "stage_editorial_augmentation": state["writing_model"],
                "stage_repair": state["writing_model"],
                "stage_title": state["writing_model"],
                "stage_quality_audit": state["audit_model"],
                "stage_groundedness": state["audit_model"],
            },
        },
    }
    if state["include_debug"]:
        response_payload["debug"] = {
            "pipeline_input": {
                "article_type_id": state["request"].article_type_id,
                "model_name": state["model_name"],
                "writing_model": state["writing_model"],
                "audit_model": state["audit_model"],
                "model_stack_id": state.get("model_stack_id"),
                "include_debug": state["include_debug"],
                "enable_editorial_augmentation": state["enable_editorial_augmentation"],
                "raw_sources_count": len(state["raw_sources"]),
                "input_profiles": state["option_context"],
            },
            "writing_brief": state["writing_brief"],
            "pipeline_trace": state["trace"],
            "editorial_augmentation_raw_response": state[
                "editorial_augmentation_raw_response"
            ],
            "editorial_components_added": augmentation["components_added"],
            "editorial_diagnostic": augmentation["diagnostic"],
        }

    dependencies.recorder.record_stage(run_id, "pipeline_v2", response_payload)
    dependencies.recorder.record_artifact(
        run_id,
        {
            "markdown": final_markdown,
            "pipeline_v2": response_payload,
            "stages": {
                "stage_guideline_fetch": guideline,
                "stage_coverage_check": state["coverage"],
                "stage_outline": state["outline"],
                "stage_groundedness": state["groundedness"],
                "stage_compose": rewrite,
                "stage_quality_audit": quality,
                "stage_editorial_augmentation": augmentation,
                "stage_title": {"final_title": final_title},
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
