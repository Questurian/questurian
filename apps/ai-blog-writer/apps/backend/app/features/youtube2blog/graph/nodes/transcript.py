from __future__ import annotations

from shared import Stage1Output

from app.features.youtube2blog.stages import (
    stage_1_clean_transcript,
    stage_1_repair_transcript,
)
from ..context import YouTube2BlogNodeContext
from ..state import GraphNode, YouTube2BlogGraphState
from ...quality.policies import evaluate_transcript_gate


def build_transcript_nodes(context: YouTube2BlogNodeContext) -> dict[str, GraphNode]:
    record = context.record
    run_id = context.run_id
    _active_model = context.active_model
    _write_running_status = context.start_stage
    _record_stage_result = context.record_stage
    _stage_ref = context.stage_ref

    def stage_1_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_1")
        stage1 = stage_1_clean_transcript(record, model_name=_active_model)
        stage_results = _record_stage_result(
            state,
            stage_name="stage_1",
            input_refs={"stage_0": _stage_ref(run_id, "stage_0")},
            data=stage1.model_dump(),
        )
        return {
            "stage1": stage1.model_dump(),
            "stage1_retry_count": int(state.get("stage1_retry_count", 0)),
            "stage_results": stage_results,
        }

    def stage_1_quality_gate_node(
        state: YouTube2BlogGraphState,
    ) -> YouTube2BlogGraphState:
        _write_running_status("stage_1_quality_gate")
        stage1 = Stage1Output.model_validate(state["stage1"])

        cleaned_chars = len(stage1.cleaned_transcript.strip())
        original_chars = len(record.transcript)
        retry_count = int(state.get("stage1_retry_count", 0))
        decision, gate_data = evaluate_transcript_gate(
            cleaned_chars=cleaned_chars,
            original_chars=original_chars,
            retry_count=retry_count,
        )
        stage_results = _record_stage_result(
            state,
            stage_name="stage_1_quality_gate",
            input_refs={"stage_1": _stage_ref(run_id, "stage_1")},
            data=gate_data,
        )
        return {
            "stage1_gate_decision": decision,
            "stage_results": stage_results,
        }

    def stage_1_repair_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        _write_running_status("stage_1_repair")
        previous_stage1 = Stage1Output.model_validate(state["stage1"])
        repaired_stage1 = stage_1_repair_transcript(
            record,
            previous_stage1.cleaned_transcript,
            model_name=_active_model,
        )
        retry_count = int(state.get("stage1_retry_count", 0)) + 1

        stage_results = _record_stage_result(
            state,
            stage_name="stage_1_repair",
            input_refs={
                "stage_1": _stage_ref(run_id, "stage_1"),
                "stage_1_quality_gate": _stage_ref(run_id, "stage_1_quality_gate"),
            },
            data={
                "retry_count": retry_count,
                "previous_cleaned_chars": len(previous_stage1.cleaned_transcript),
                "repaired_cleaned_chars": len(repaired_stage1.cleaned_transcript),
            },
        )
        stage_results = _record_stage_result(
            {"stage_results": stage_results},
            stage_name="stage_1",
            input_refs={"stage_1_repair": _stage_ref(run_id, "stage_1_repair")},
            data=repaired_stage1.model_dump(),
        )
        return {
            "stage1": repaired_stage1.model_dump(),
            "stage1_retry_count": retry_count,
            "stage_results": stage_results,
        }

    return {
        "stage_1": stage_1_node,
        "stage_1_quality_gate": stage_1_quality_gate_node,
        "stage_1_repair": stage_1_repair_node,
    }
