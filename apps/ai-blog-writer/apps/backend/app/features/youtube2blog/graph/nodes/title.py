from __future__ import annotations

from shared import Stage3Output, Stage4Output

from app.features.youtube2blog.stages import (
    stage_4_generate_title,
    stage_5_evaluate_title_quality,
    stage_5_generate_title_retry,
)
from ..context import YouTube2BlogNodeContext
from ..state import GraphNode, YouTube2BlogGraphState
from ...quality.policies import evaluate_title_gate, is_better_title


def build_title_nodes(context: YouTube2BlogNodeContext) -> dict[str, GraphNode]:
    run_id = context.run_id
    _active_model = context.active_model
    _write_running_status = context.start_stage
    _record_stage_result = context.record_stage
    _stage_ref = context.stage_ref

    def stage_4_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_4")
        stage3_for_title = Stage3Output.model_validate(state["stage3_for_title"])
        gate_data = dict(state.get("stage_editorial_gate") or {})
        seo_source_stage = str(gate_data.get("seo_source_stage") or "stage_seo_enrich")
        stage4 = stage_4_generate_title(stage3_for_title, model_name=_active_model)
        input_refs = {
            "stage_editorial_augmentation": _stage_ref(
                run_id,
                "stage_editorial_augmentation",
            ),
        }
        if seo_source_stage in {"stage_seo_enrich", "stage_seo_rollback"}:
            input_refs[seo_source_stage] = _stage_ref(run_id, seo_source_stage)
        stage_results = _record_stage_result(
            state,
            stage_name="stage_4",
            input_refs=input_refs,
            data=stage4.model_dump(),
        )
        return {
            "stage4": stage4.model_dump(),
            "stage_results": stage_results,
        }

    def stage_5_quality_gate_node(
        state: YouTube2BlogGraphState,
    ) -> YouTube2BlogGraphState:
        _write_running_status("stage_5_quality_gate")
        stage4 = Stage4Output.model_validate(state["stage4"])
        stage3_for_title = Stage3Output.model_validate(state["stage3_for_title"])
        evaluation = stage_5_evaluate_title_quality(
            title=stage4.title,
            article=stage3_for_title.final_article,
            guideline=stage4.title_guideline_used,
            baseline_title=stage3_for_title.title,
        )
        retry_count = int(state.get("stage5_retry_count", 0))

        # Keep the best title the loop has produced, not the most recent one.
        best_evaluation = dict(state.get("stage5_best_evaluation") or {})
        best_stage4 = dict(state.get("stage4_best") or {})
        candidate_improved = is_better_title(evaluation, best_evaluation or None)
        if candidate_improved:
            best_evaluation = evaluation
            best_stage4 = stage4.model_dump()

        best_title = str(best_stage4.get("title") or stage4.title)
        decision, gate_data = evaluate_title_gate(
            best_evaluation,
            retry_count=retry_count,
            title=best_title,
        )
        gate_data["kept_earlier_title"] = not candidate_improved
        gate_data["candidate_title"] = stage4.title

        stage_results = _record_stage_result(
            state,
            stage_name="stage_5_quality_gate",
            input_refs={"stage_4": _stage_ref(run_id, "stage_4")},
            data=gate_data,
        )
        updates: YouTube2BlogGraphState = {
            "stage4_best": best_stage4,
            "stage5_best_evaluation": best_evaluation,
            "stage5_gate": gate_data,
            "stage5_gate_decision": decision,
            "stage5_feedback": str(best_evaluation.get("feedback") or ""),
            "stage_results": stage_results,
        }
        if decision == "pass":
            # Settle on the winner, which may be an earlier title.
            updates["stage4"] = best_stage4
        return updates

    def stage_5_retry_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_5_retry")
        stage3_for_title = Stage3Output.model_validate(state["stage3_for_title"])
        feedback = str(
            state.get("stage5_feedback")
            or "Improve title quality while preserving article intent and guideline fit."
        )
        retry_count = int(state.get("stage5_retry_count", 0)) + 1
        retried_stage4 = stage_5_generate_title_retry(
            stage3_for_title,
            feedback=feedback,
            model_name=_active_model,
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_5_retry",
            input_refs={
                "stage_5_quality_gate": _stage_ref(run_id, "stage_5_quality_gate")
            },
            data={
                "retry_count": retry_count,
                "feedback": feedback,
                "title": retried_stage4.title,
                "title_guideline_used": retried_stage4.title_guideline_used,
                "debug_prompt": retried_stage4.debug_prompt,
                "debug_raw_response": retried_stage4.debug_raw_response,
            },
        )
        stage_results = _record_stage_result(
            {"stage_results": stage_results},
            stage_name="stage_4",
            input_refs={"stage_5_retry": _stage_ref(run_id, "stage_5_retry")},
            data=retried_stage4.model_dump(),
        )
        return {
            "stage4": retried_stage4.model_dump(),
            "stage5_retry_count": retry_count,
            "stage_results": stage_results,
        }

    return {
        "stage_4": stage_4_node,
        "stage_5_quality_gate": stage_5_quality_gate_node,
        "stage_5_retry": stage_5_retry_node,
    }
