from __future__ import annotations

from typing import Any

from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...grounding_service import check_grounding
from ...instructions_v3 import EVIDENCE_DISPOSITION_POLICY
from ...observability import _append_stage_trace
from ...packet_v4 import supplied_material_text
from ...prompts.editorial_v3 import P2B_V3_GROUNDEDNESS_PROMPT

def check_v3_groundedness(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
    *,
    stage: str,
    rewrite: dict[str, Any],
) -> dict[str, Any]:
    """Compare one draft against the exact evidence records.

    V2 compared a draft with cleaned source prose, which had already lost
    publisher, date, and qualification. V3 compares it with the records
    themselves, so an overstated date or a widened claim is visible.

    The checker also reads the first-hand material the writer was given
    (finding 01). Without it the two halves of the run were looking at
    different desks: compose could legitimately use "I waited 45 minutes" from
    the brief, and the checker, seeing no record of it, could only call it
    invented -- after which repair is instructed to delete it.

    The call, the one retry and the refusal of an unreadable verdict now live
    in `grounding_service`, so the post-writing editor can have the same
    judgement without running this stage for its side effects. What is left
    here is the side effects: this stage's prompt, its trace rows, its stage
    row.
    """
    run_id = state["run_id"]
    prompt = P2B_V3_GROUNDEDNESS_PROMPT.format(
        evidence_disposition_policy=EVIDENCE_DISPOSITION_POLICY,
        evidence_records=state["evidence"]["records_text"],
        supplied_material=supplied_material_text(state.get("packet")),
        rewritten_title=rewrite["improved_title"],
        rewritten_content=rewrite["improved_content"],
    )
    groundedness_model = state.get("groundedness_model")

    outcome = check_grounding(
        llm=dependencies.llm,
        prompt=prompt,
        job_id="p2b.groundedness",
        model_name=groundedness_model,
    )

    for record in outcome.attempts:
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=groundedness_model,
            input_payload=(
                {"attempt": record.attempt} if record.raw_response or record.parsed
                else None
            ),
            prompt=record.prompt,
            raw_response=record.raw_response or None,
            parsed=record.parsed,
            error=record.error or None,
            output=(
                outcome.verdict
                if record is outcome.attempts[-1] and not record.error
                else None
            ),
        )

    groundedness = outcome.verdict
    if outcome.rejected:
        groundedness = {**groundedness, "rejected_responses": outcome.rejected}

    dependencies.recorder.record_stage(
        run_id,
        stage,
        {"groundedness": groundedness, "raw_response": outcome.raw_response},
    )
    return groundedness


def run_v3_groundedness_stage(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_v3_groundedness"
    dependencies.recorder.start_stage(state["run_id"], stage)
    groundedness = check_v3_groundedness(
        state,
        dependencies,
        stage=stage,
        rewrite=state["rewrite"],
    )
    return {"current_stage": stage, "groundedness": groundedness}
