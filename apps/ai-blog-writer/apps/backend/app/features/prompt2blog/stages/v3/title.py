from __future__ import annotations

from typing import Any

from ...content.markdown import _clean_title
from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...observability import _append_stage_trace
from ...prompts.editorial_v3 import P2B_V3_TITLE_PROMPT
from ...quality_v3 import v3_commission_summary


# The title is the highest-leverage single string the pipeline emits, so it is
# written by the writer model rather than the cheaper analysis model.
def run_v3_title_stage(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Write the headline from the shared standard and the approved commission.

    The original title reaches this stage as author intent, so the headline can
    keep what the commission was about instead of re-deriving a subject from
    the finished prose.
    """
    stage = "stage_v3_title"
    run_id = state["run_id"]
    rewrite = state["rewrite"]
    dependencies.recorder.start_stage(run_id, stage)

    prompt = P2B_V3_TITLE_PROMPT.format(
        headline_instructions=state["headline_instructions"],
        commission_summary=v3_commission_summary(state["commission"]),
        previous_title=rewrite["improved_title"],
        rewritten_content=rewrite["improved_content"],
    )
    raw_response = dependencies.llm.invoke_text(
        prompt=prompt,
        max_tokens=512,
        temperature=0.1,
        model_name=state["writing_model"],
    )
    final_title = (
        _clean_title(raw_response)
        or rewrite["improved_title"]
        or state["commission"]["original_title"]
    )
    dependencies.recorder.record_stage(
        run_id,
        stage,
        {"final_title": final_title, "raw_response": raw_response},
    )
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        model_name=state["writing_model"],
        prompt=prompt,
        raw_response=raw_response,
        output={"final_title": final_title},
    )
    return {"current_stage": stage, "final_title": final_title}
