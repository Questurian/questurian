from __future__ import annotations

from typing import Any

from ..content.markdown import _clean_title
from ..dependencies import PipelineDependencies
from ..graph.state import Prompt2BlogGraphState
from ..observability import _append_stage_trace
from ..prompts.editorial import P2B_TITLE_PROMPT
from ..support import _json


# The title is the highest-leverage single string the pipeline emits, so it is
# written by the writer model rather than the cheaper analysis model.
def run_title_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    stage = "stage_title"
    run_id = state["run_id"]
    rewrite = state["rewrite"]
    guideline = state["guideline"]
    dependencies.recorder.start_stage(run_id, stage)

    prompt = P2B_TITLE_PROMPT.format(
        previous_title=rewrite["improved_title"],
        rewritten_content=rewrite["improved_content"],
        title_guideline=guideline["title_guideline"] or "No title guideline provided.",
        writing_brief_json=_json(state["writing_brief"]),
    )
    raw_response = dependencies.llm.invoke_text(
        prompt=prompt,
        max_tokens=512,
        temperature=0.1,
        model_name=state["writing_model"],
    )
    final_title = _clean_title(raw_response) or rewrite["improved_title"]
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
