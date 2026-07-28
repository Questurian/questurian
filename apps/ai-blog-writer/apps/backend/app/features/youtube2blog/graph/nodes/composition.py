from __future__ import annotations

from shared import Stage1Output, Stage3Output

from app.features.youtube2blog.stages import (
    stage_3_assess_article_quality,
    stage_3_build_targeted_feedback,
    stage_3_compose_from_parts,
    stage_3_coverage_check,
    stage_3_generate_supplement,
    stage_3_improve_article,
    stage_3_pick_improvement_mode,
)
from ..context import YouTube2BlogNodeContext
from ..state import GraphNode, YouTube2BlogGraphState
from ...quality.policies import evaluate_article_quality_gate, is_better_article


def build_composition_nodes(context: YouTube2BlogNodeContext) -> dict[str, GraphNode]:
    run_id = context.run_id
    _active_model = context.active_model
    _writing_model = context.writing_model
    _tone_guidance = context.tone_guidance
    _write_running_status = context.start_stage
    _record_stage_result = context.record_stage
    _stage_ref = context.stage_ref

    def stage_3_coverage_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_3_coverage")
        stage1 = Stage1Output.model_validate(state["stage1"])
        guideline = str(state.get("stage3_guideline") or "")
        coverage = stage_3_coverage_check(
            transcript=stage1.cleaned_transcript,
            guideline=guideline,
            model_name=_active_model,
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_3_coverage",
            input_refs={
                "stage_1": _stage_ref(run_id, "stage_1"),
                "stage_3_guideline": _stage_ref(run_id, "stage_3_guideline"),
            },
            data=coverage,
        )
        return {
            "stage3_coverage": coverage,
            "stage_results": stage_results,
        }

    def stage_3_supplement_node(
        state: YouTube2BlogGraphState,
    ) -> YouTube2BlogGraphState:
        _write_running_status("stage_3_supplement")
        stage1 = Stage1Output.model_validate(state["stage1"])
        article_type = str(state["article_type"])
        coverage = dict(state.get("stage3_coverage") or {})
        missing_sections_value = coverage.get("missing_sections")
        missing_sections = (
            list(missing_sections_value)
            if isinstance(missing_sections_value, list)
            else []
        )
        supplement = stage_3_generate_supplement(
            transcript=stage1.cleaned_transcript,
            missing_sections=missing_sections,
            article_type=article_type,
            model_name=_active_model,
            tone_guidance=_tone_guidance,
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_3_supplement",
            input_refs={"stage_3_coverage": _stage_ref(run_id, "stage_3_coverage")},
            data=supplement,
        )
        return {
            "stage3_supplement": supplement,
            "stage_results": stage_results,
        }

    def stage_3_compose_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_3")
        stage1 = Stage1Output.model_validate(state["stage1"])
        article_type = str(state["article_type"])
        guideline = str(state.get("stage3_guideline") or "")
        coverage = dict(state.get("stage3_coverage") or {})
        supplement = dict(state.get("stage3_supplement") or {})

        supplemental_content_value = supplement.get("supplemental_content")
        supplemental_content = (
            str(supplemental_content_value).strip()
            if isinstance(supplemental_content_value, str)
            else ""
        )
        supplemental_content_or_none = supplemental_content or None

        composed = stage_3_compose_from_parts(
            transcript=stage1.cleaned_transcript,
            supplemental=supplemental_content_or_none,
            guideline=guideline,
            article_type=article_type,
            title=stage1.title,
            model_name=_active_model,
            writing_model=_writing_model,
            tone_guidance=_tone_guidance,
        )

        stage3 = Stage3Output(
            video_id=stage1.video_id,
            title=stage1.title,
            article_type=article_type,
            coverage_sufficient=bool(coverage.get("coverage_sufficient", False)),
            coverage_analysis=str(coverage.get("coverage_analysis") or ""),
            missing_sections=list(coverage.get("missing_sections") or []),
            supplemental_content=supplemental_content_or_none,
            final_article=str(composed["final_article"]),
            guideline_used=guideline,
            debug_coverage_prompt=str(coverage.get("debug_coverage_prompt") or ""),
            debug_coverage_response=str(coverage.get("debug_coverage_response") or ""),
            debug_supplement_prompt=str(
                supplement.get("debug_supplement_prompt") or ""
            ),
            debug_supplement_response=str(
                supplement.get("debug_supplement_response") or ""
            ),
            debug_composition_prompt=str(
                composed.get("debug_composition_prompt") or ""
            ),
            debug_composition_response=str(
                composed.get("debug_composition_response") or ""
            ),
        )

        input_refs = {
            "stage_1": _stage_ref(run_id, "stage_1"),
            "stage_3_guideline": _stage_ref(run_id, "stage_3_guideline"),
            "stage_3_coverage": _stage_ref(run_id, "stage_3_coverage"),
        }
        if "stage2" in state:
            input_refs["stage_2"] = _stage_ref(run_id, "stage_2")
        if supplemental_content_or_none:
            input_refs["stage_3_supplement"] = _stage_ref(run_id, "stage_3_supplement")

        stage_results = _record_stage_result(
            state,
            stage_name="stage_3",
            input_refs=input_refs,
            data=stage3.model_dump(),
        )
        return {
            "stage3": stage3.model_dump(),
            "stage_results": stage_results,
        }

    def stage_3_quality_gate_node(
        state: YouTube2BlogGraphState,
    ) -> YouTube2BlogGraphState:
        _write_running_status("stage_3_quality_gate")
        stage3 = Stage3Output.model_validate(state["stage3"])
        retry_count = int(state.get("stage3_quality_retry_count", 0))
        assessment = stage_3_assess_article_quality(stage3=stage3, model_name=_active_model)

        # Keep the best draft the loop has produced, not the most recent one.
        best_quality = dict(state.get("stage3_best_quality") or {})
        best_stage3 = dict(state.get("stage3_best") or {})
        candidate_improved = is_better_article(assessment, best_quality or None)
        if candidate_improved:
            best_quality = assessment
            best_stage3 = stage3.model_dump()

        # Gate on what would actually ship. A rewrite worse than the draft it
        # replaced must not spend another attempt chasing its own regression.
        decision, gate_data = evaluate_article_quality_gate(
            best_quality,
            retry_count=retry_count,
        )
        gate_data["kept_earlier_draft"] = not candidate_improved
        gate_data["candidate_overall_quality_score"] = assessment.get(
            "overall_quality_score"
        )

        stage_results = _record_stage_result(
            state,
            stage_name="stage_3_quality_gate",
            input_refs={"stage_3": _stage_ref(run_id, "stage_3")},
            data=gate_data,
        )
        updates: YouTube2BlogGraphState = {
            "stage3_best": best_stage3,
            "stage3_best_quality": best_quality,
            "stage3_quality_gate": gate_data,
            "stage3_quality_feedback": gate_data,
            "stage3_quality_gate_decision": decision,
            "stage_results": stage_results,
        }
        if decision == "pass":
            # Settle on the winner, which may be an earlier draft.
            updates["stage3"] = best_stage3
        return updates

    def stage_3_improve_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_3_improve")
        stage3 = Stage3Output.model_validate(state["stage3"])
        feedback_raw = state.get("stage3_quality_feedback")
        feedback = dict(feedback_raw) if isinstance(feedback_raw, dict) else {}
        top_issues_raw = feedback.get("top_issues")
        rewrite_brief_raw = feedback.get("rewrite_brief")
        top_issues = (
            [str(item).strip() for item in top_issues_raw if str(item).strip()]
            if isinstance(top_issues_raw, list)
            else []
        )
        rewrite_brief = (
            [str(item).strip() for item in rewrite_brief_raw if str(item).strip()]
            if isinstance(rewrite_brief_raw, list)
            else []
        )
        dimension_scores_raw = feedback.get("dimension_scores")
        dimension_scores: dict[str, float] = {}
        if isinstance(dimension_scores_raw, dict):
            for key, value in dimension_scores_raw.items():
                if not isinstance(key, str):
                    continue
                try:
                    dimension_scores[key] = float(value)
                except (TypeError, ValueError):
                    continue
        targeted_feedback = stage_3_build_targeted_feedback(
            dimension_scores=dimension_scores,
            top_issues=top_issues,
            rewrite_brief=rewrite_brief,
        )
        retry_count = int(state.get("stage3_quality_retry_count", 0)) + 1
        overall_quality_score = float(feedback.get("overall_quality_score", 0.0))
        mode = stage_3_pick_improvement_mode(
            overall_quality_score=overall_quality_score,
            retry_count=retry_count,
        )
        improved = stage_3_improve_article(
            stage3=stage3,
            top_issues=list(targeted_feedback.get("top_issues") or top_issues),
            rewrite_brief=list(targeted_feedback.get("rewrite_brief") or rewrite_brief),
            mode=mode,
            focus_dimensions=list(targeted_feedback.get("focus_dimensions") or []),
            # A full rewrite of a draft composed on the writing model belongs on
            # the writing model. Running it on the cheaper base model handed the
            # pro composition to a weaker writer and shipped the result.
            model_name=_writing_model,
            tone_guidance=_tone_guidance,
        )

        improve_prompt = str(improved.get("debug_improve_prompt") or "")
        improve_response = str(improved.get("debug_improve_response") or "")
        existing_comp_prompt = stage3.debug_composition_prompt or ""
        existing_comp_response = stage3.debug_composition_response or ""

        updated_stage3 = stage3.model_copy(
            update={
                "final_article": str(
                    improved.get("improved_article") or stage3.final_article
                ),
                "debug_composition_prompt": (
                    f"{existing_comp_prompt}\n\n---\n\n"
                    f"[stage_3_improve mode={mode}]\n{improve_prompt}"
                ).strip(),
                "debug_composition_response": (
                    f"{existing_comp_response}\n\n---\n\n"
                    f"[stage_3_improve mode={mode}]\n{improve_response}"
                ).strip(),
            }
        )

        stage_results = _record_stage_result(
            state,
            stage_name="stage_3_improve",
            input_refs={
                "stage_3_quality_gate": _stage_ref(run_id, "stage_3_quality_gate")
            },
            data={
                "mode": mode,
                "retry_count": retry_count,
                "overall_quality_score_before": overall_quality_score,
                "focus_dimensions": targeted_feedback.get("focus_dimensions") or [],
                "top_issues": targeted_feedback.get("top_issues") or top_issues,
                "rewrite_brief": targeted_feedback.get("rewrite_brief")
                or rewrite_brief,
                "word_count_before": improved.get("word_count_before"),
                "word_count_after": improved.get("word_count_after"),
                "debug_improve_prompt": improve_prompt,
                "debug_improve_response": improve_response,
                "debug_improve_first_response": improved.get(
                    "debug_improve_first_response"
                ),
            },
        )
        stage_results = _record_stage_result(
            {"stage_results": stage_results},
            stage_name="stage_3",
            input_refs={"stage_3_improve": _stage_ref(run_id, "stage_3_improve")},
            data=updated_stage3.model_dump(),
        )
        return {
            "stage3": updated_stage3.model_dump(),
            "stage3_quality_retry_count": retry_count,
            "stage_results": stage_results,
        }

    return {
        "stage_3_coverage": stage_3_coverage_node,
        "stage_3_supplement": stage_3_supplement_node,
        "stage_3": stage_3_compose_node,
        "stage_3_quality_gate": stage_3_quality_gate_node,
        "stage_3_improve": stage_3_improve_node,
    }
