from __future__ import annotations

from shared import Stage3Output, StageEditorialAugmentationOutput

from app.features.youtube2blog.stages import stage_editorial_augmentation
from ...content.markdown import count_paragraphs, count_words
from ...quality.policies import evaluate_editorial_gate
from ..context import YouTube2BlogNodeContext
from ..state import GraphNode, YouTube2BlogGraphState


def build_editorial_nodes(context: YouTube2BlogNodeContext) -> dict[str, GraphNode]:
    run_id = context.run_id
    _active_model = context.active_model
    _writing_model = context.writing_model
    _tone_guidance = context.tone_guidance
    _write_running_status = context.start_stage
    _record_stage_result = context.record_stage
    _stage_ref = context.stage_ref
    _count_words = count_words
    _count_paragraphs = count_paragraphs

    def stage_editorial_gate_node(
        state: YouTube2BlogGraphState,
    ) -> YouTube2BlogGraphState:
        _write_running_status("stage_editorial_gate")
        stage3 = Stage3Output.model_validate(state["stage3_for_editorial"])
        seo_source_stage = "stage_seo_enrich"
        if str(state.get("stage_seo_gate_decision") or "") == "rollback":
            seo_source_stage = "stage_seo_rollback"
        words = _count_words(stage3.final_article)
        paragraphs = _count_paragraphs(stage3.final_article)
        decision, gate_data = evaluate_editorial_gate(
            words=words,
            paragraphs=paragraphs,
        )
        gate_data["seo_source_stage"] = seo_source_stage
        stage_results = _record_stage_result(
            state,
            stage_name="stage_editorial_gate",
            input_refs={seo_source_stage: _stage_ref(run_id, seo_source_stage)},
            data=gate_data,
        )
        return {
            "stage_editorial_gate": gate_data,
            "stage_editorial_decision": decision,
            "stage_results": stage_results,
        }

    def stage_editorial_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_editorial_augmentation")
        stage3 = Stage3Output.model_validate(state["stage3_for_editorial"])
        # Augmentation is additive decoration on a finished article. It already
        # degrades to the un-augmented draft with `error` set; fail_fast turned
        # that off and let a malformed callout response destroy the run.
        stage_editorial = stage_editorial_augmentation(
            stage3,
            fail_fast=False,
            model_name=_active_model,
            writing_model=_writing_model,
            tone_guidance=_tone_guidance,
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_editorial_augmentation",
            input_refs={
                "stage_editorial_gate": _stage_ref(run_id, "stage_editorial_gate")
            },
            data=stage_editorial.model_dump(),
        )
        stage3_for_title = stage3.model_copy(
            update={"final_article": stage_editorial.augmented_content}
        )
        return {
            "stage_editorial": stage_editorial.model_dump(),
            "stage3_for_title": stage3_for_title.model_dump(),
            "stage_results": stage_results,
        }

    def stage_editorial_skip_node(
        state: YouTube2BlogGraphState,
    ) -> YouTube2BlogGraphState:
        _write_running_status("stage_editorial_skip")
        stage3 = Stage3Output.model_validate(state["stage3_for_editorial"])
        stage_editorial = StageEditorialAugmentationOutput(
            video_id=stage3.video_id,
            title=stage3.title,
            article_type=stage3.article_type,
            augmented_content=stage3.final_article,
            components_added=[],
            diagnostic={
                "cognitive_load": "strong",
                "narrative_density": "strong",
                "emphasis_clarity": "strong",
                "reading_behavior_risk": "strong",
            },
            augmentation_summary=(
                "Editorial augmentation skipped by gate "
                "(content was below augmentation thresholds)."
            ),
            augmentation_applied=False,
            debug_prompt="",
            debug_raw_response="",
            error=None,
        )
        gate_data = dict(state.get("stage_editorial_gate") or {})
        stage_results = _record_stage_result(
            state,
            stage_name="stage_editorial_skip",
            input_refs={
                "stage_editorial_gate": _stage_ref(run_id, "stage_editorial_gate")
            },
            data={
                "decision": "skip",
                "gate": gate_data,
            },
        )
        stage_results = _record_stage_result(
            {"stage_results": stage_results},
            stage_name="stage_editorial_augmentation",
            input_refs={
                "stage_editorial_skip": _stage_ref(run_id, "stage_editorial_skip")
            },
            data=stage_editorial.model_dump(),
        )
        return {
            "stage_editorial": stage_editorial.model_dump(),
            "stage3_for_title": stage3.model_dump(),
            "stage_results": stage_results,
        }

    return {
        "stage_editorial_gate": stage_editorial_gate_node,
        "stage_editorial_augmentation": stage_editorial_node,
        "stage_editorial_skip": stage_editorial_skip_node,
    }
