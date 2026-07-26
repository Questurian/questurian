from __future__ import annotations

from shared import Stage3Output

from app.features.youtube2blog.stages import (
    stage_seo_enrich_article,
    stage_seo_evaluate_quality,
    stage_seo_generate_brief,
)
from ...content.markdown import count_words
from ...quality.policies import evaluate_seo_gate
from ..context import YouTube2BlogNodeContext
from ..state import GraphNode, YouTube2BlogGraphState


def build_seo_nodes(context: YouTube2BlogNodeContext) -> dict[str, GraphNode]:
    run_id = context.run_id
    _active_model = context.active_model
    _tone_guidance = context.tone_guidance
    _write_running_status = context.start_stage
    _record_stage_result = context.record_stage
    _stage_ref = context.stage_ref
    _count_words = count_words

    def stage_seo_brief_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_seo_brief")
        stage3 = Stage3Output.model_validate(state["stage3"])
        seo_brief = stage_seo_generate_brief(stage3=stage3, model_name=_active_model)
        stage_results = _record_stage_result(
            state,
            stage_name="stage_seo_brief",
            input_refs={"stage_3": _stage_ref(run_id, "stage_3")},
            data=seo_brief,
        )
        return {
            "stage_seo_brief": seo_brief,
            "stage_results": stage_results,
        }

    def stage_seo_enrich_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_seo_enrich")
        stage3 = Stage3Output.model_validate(state["stage3"])
        seo_brief = dict(state.get("stage_seo_brief") or {})
        seo_output = stage_seo_enrich_article(
            stage3=stage3,
            seo_brief=seo_brief,
            mode="primary",
            model_name=_active_model,
            tone_guidance=_tone_guidance,
        )

        seo_article = str(seo_output.get("seo_article") or stage3.final_article)
        existing_comp_prompt = stage3.debug_composition_prompt or ""
        existing_comp_response = stage3.debug_composition_response or ""
        seo_prompt = str(seo_output.get("debug_seo_prompt") or "")
        seo_response = str(seo_output.get("debug_seo_response") or "")
        stage3_for_editorial = stage3.model_copy(
            update={
                "final_article": seo_article,
                "debug_composition_prompt": (
                    f"{existing_comp_prompt}\n\n---\n\n[stage_seo_enrich]\n{seo_prompt}"
                ).strip(),
                "debug_composition_response": (
                    f"{existing_comp_response}\n\n---\n\n[stage_seo_enrich]\n{seo_response}"
                ).strip(),
            }
        )

        stage_results = _record_stage_result(
            state,
            stage_name="stage_seo_enrich",
            input_refs={"stage_seo_brief": _stage_ref(run_id, "stage_seo_brief")},
            data=seo_output,
        )
        return {
            "stage_seo": seo_output,
            "stage3_for_editorial": stage3_for_editorial.model_dump(),
            "stage_results": stage_results,
        }

    def stage_seo_quality_gate_node(
        state: YouTube2BlogGraphState,
    ) -> YouTube2BlogGraphState:
        _write_running_status("stage_seo_quality_gate")
        stage3 = Stage3Output.model_validate(state["stage3"])
        stage3_for_editorial = Stage3Output.model_validate(
            state["stage3_for_editorial"]
        )
        seo_brief = dict(state.get("stage_seo_brief") or {})
        evaluation = stage_seo_evaluate_quality(
            article=stage3_for_editorial.final_article,
            seo_brief=seo_brief,
            baseline_article=stage3.final_article,
        )
        retry_count = int(state.get("stage_seo_retry_count", 0))
        decision, gate_data = evaluate_seo_gate(
            evaluation,
            retry_count=retry_count,
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_seo_quality_gate",
            input_refs={"stage_seo_enrich": _stage_ref(run_id, "stage_seo_enrich")},
            data=gate_data,
        )
        return {
            "stage_seo_gate": gate_data,
            "stage_seo_feedback": str(evaluation.get("feedback") or ""),
            "stage_seo_gate_decision": decision,
            "stage_results": stage_results,
        }

    def stage_seo_retry_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_seo_retry")
        stage3_for_editorial = Stage3Output.model_validate(
            state["stage3_for_editorial"]
        )
        seo_brief = dict(state.get("stage_seo_brief") or {})
        feedback = str(
            state.get("stage_seo_feedback")
            or "Improve SEO placement naturally without keyword stuffing."
        )
        retry_count = int(state.get("stage_seo_retry_count", 0)) + 1
        seo_output = stage_seo_enrich_article(
            stage3=stage3_for_editorial,
            seo_brief=seo_brief,
            mode="retry",
            feedback=feedback,
            model_name=_active_model,
            tone_guidance=_tone_guidance,
        )
        seo_article = str(
            seo_output.get("seo_article") or stage3_for_editorial.final_article
        )

        existing_comp_prompt = stage3_for_editorial.debug_composition_prompt or ""
        existing_comp_response = stage3_for_editorial.debug_composition_response or ""
        seo_prompt = str(seo_output.get("debug_seo_prompt") or "")
        seo_response = str(seo_output.get("debug_seo_response") or "")
        updated_stage3_for_editorial = stage3_for_editorial.model_copy(
            update={
                "final_article": seo_article,
                "debug_composition_prompt": (
                    f"{existing_comp_prompt}\n\n---\n\n[stage_seo_retry]\n{seo_prompt}"
                ).strip(),
                "debug_composition_response": (
                    f"{existing_comp_response}\n\n---\n\n[stage_seo_retry]\n{seo_response}"
                ).strip(),
            }
        )

        stage_results = _record_stage_result(
            state,
            stage_name="stage_seo_retry",
            input_refs={
                "stage_seo_quality_gate": _stage_ref(run_id, "stage_seo_quality_gate")
            },
            data={
                "retry_count": retry_count,
                "feedback": feedback,
                **seo_output,
            },
        )
        stage_results = _record_stage_result(
            {"stage_results": stage_results},
            stage_name="stage_seo_enrich",
            input_refs={"stage_seo_retry": _stage_ref(run_id, "stage_seo_retry")},
            data=seo_output,
        )
        return {
            "stage_seo": seo_output,
            "stage3_for_editorial": updated_stage3_for_editorial.model_dump(),
            "stage_seo_retry_count": retry_count,
            "stage_results": stage_results,
        }

    def stage_seo_rollback_node(
        state: YouTube2BlogGraphState,
    ) -> YouTube2BlogGraphState:
        _write_running_status("stage_seo_rollback")
        stage3 = Stage3Output.model_validate(state["stage3"])
        gate_data = dict(state.get("stage_seo_gate") or {})
        rollback_data = {
            "reason": "seo_gate_failed_after_retries",
            "gate_decision": str(gate_data.get("decision") or "rollback"),
            "score": gate_data.get("score"),
            "feedback": str(gate_data.get("feedback") or ""),
            "restored_word_count": _count_words(stage3.final_article),
            "restored_article_source": "stage_3",
        }
        stage_results = _record_stage_result(
            state,
            stage_name="stage_seo_rollback",
            input_refs={
                "stage_seo_quality_gate": _stage_ref(run_id, "stage_seo_quality_gate")
            },
            data=rollback_data,
        )
        return {
            "stage3_for_editorial": stage3.model_dump(),
            "stage_seo_rollback": rollback_data,
            "stage_results": stage_results,
        }

    return {
        "stage_seo_brief": stage_seo_brief_node,
        "stage_seo_enrich": stage_seo_enrich_node,
        "stage_seo_quality_gate": stage_seo_quality_gate_node,
        "stage_seo_retry": stage_seo_retry_node,
        "stage_seo_rollback": stage_seo_rollback_node,
    }
