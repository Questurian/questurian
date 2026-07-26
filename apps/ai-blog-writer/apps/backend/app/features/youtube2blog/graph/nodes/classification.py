from __future__ import annotations

from shared import Stage1Output, Stage2Output

from app.features.youtube2blog.stages import (
    stage_2_classify_article_type,
    stage_3_retrieve_guideline,
)
from ..context import YouTube2BlogNodeContext
from ..state import GraphNode, YouTube2BlogGraphState
from ...quality.policies import evaluate_classification_gate


def build_classification_nodes(context: YouTube2BlogNodeContext) -> dict[str, GraphNode]:
    run_id = context.run_id
    _active_model = context.active_model
    _write_running_status = context.start_stage
    _record_stage_result = context.record_stage
    _stage_ref = context.stage_ref
    read_article_type_names = context.dependencies.article_type_names_reader

    def stage_2_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_2")
        stage1 = Stage1Output.model_validate(state["stage1"])
        allowed_types = read_article_type_names()
        if not allowed_types:
            raise RuntimeError("No article types available for classification")

        stage2 = stage_2_classify_article_type(
            stage1,
            allowed_types,
            classification_mode="primary",
            model_name=_active_model,
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_2",
            input_refs={"stage_1": _stage_ref(run_id, "stage_1")},
            data=stage2.model_dump(),
        )
        return {
            "stage2": stage2.model_dump(),
            "stage2_retry_count": int(state.get("stage2_retry_count", 0)),
            "stage_results": stage_results,
        }

    def stage_2_quality_gate_node(
        state: YouTube2BlogGraphState,
    ) -> YouTube2BlogGraphState:
        _write_running_status("stage_2_quality_gate")
        stage2 = Stage2Output.model_validate(state["stage2"])
        retry_count = int(state.get("stage2_retry_count", 0))
        confidence = float(stage2.confidence)
        decision, gate_data = evaluate_classification_gate(
            confidence=confidence,
            classification=stage2.classification,
            reasoning=stage2.reasoning,
            retry_count=retry_count,
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_2_quality_gate",
            input_refs={"stage_2": _stage_ref(run_id, "stage_2")},
            data=gate_data,
        )
        return {
            "stage2_gate_decision": decision,
            "stage_results": stage_results,
        }

    def stage_2_retry_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_2_retry")
        stage1 = Stage1Output.model_validate(state["stage1"])
        allowed_types = read_article_type_names()
        if not allowed_types:
            raise RuntimeError("No article types available for classification retry")

        retry_count = int(state.get("stage2_retry_count", 0)) + 1
        stage2 = stage_2_classify_article_type(
            stage1,
            allowed_types,
            classification_mode="retry",
            model_name=_active_model,
        )

        stage_results = _record_stage_result(
            state,
            stage_name="stage_2_retry",
            input_refs={
                "stage_1": _stage_ref(run_id, "stage_1"),
                "stage_2_quality_gate": _stage_ref(run_id, "stage_2_quality_gate"),
            },
            data={
                "retry_count": retry_count,
                "classification": stage2.classification,
                "confidence": stage2.confidence,
                "reasoning": stage2.reasoning,
            },
        )
        stage_results = _record_stage_result(
            {"stage_results": stage_results},
            stage_name="stage_2",
            input_refs={"stage_2_retry": _stage_ref(run_id, "stage_2_retry")},
            data=stage2.model_dump(),
        )
        return {
            "stage2": stage2.model_dump(),
            "stage2_retry_count": retry_count,
            "stage_results": stage_results,
        }

    def stage_3_guideline_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_3_guideline")
        forced_type = (state.get("forced_article_type") or "").strip()
        if forced_type:
            # User pre-selected an article type — fetch its guideline from DB directly,
            # bypassing stage_2 classification
            guideline = stage_3_retrieve_guideline(forced_type)
            article_type = forced_type
            source = "user_selected"
        else:
            stage2 = Stage2Output.model_validate(state["stage2"])
            guideline = stage_3_retrieve_guideline(stage2.classification)
            article_type = stage2.classification
            source = "auto_classified"
        stage_results = _record_stage_result(
            state,
            stage_name="stage_3_guideline",
            input_refs={"stage_2": _stage_ref(run_id, "stage_2")},
            data={
                "article_type": article_type,
                "guideline": guideline,
                "guideline_length": len(guideline),
                "source": source,
            },
        )
        return {
            "stage3_guideline": guideline,
            "stage_results": stage_results,
        }

    return {
        "stage_2": stage_2_node,
        "stage_2_quality_gate": stage_2_quality_gate_node,
        "stage_2_retry": stage_2_retry_node,
        "stage_3_guideline": stage_3_guideline_node,
    }
