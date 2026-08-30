from __future__ import annotations

from typing import Any

from ...config import P2B_V3_TITLE_MODEL
from ...content.markdown import _clean_title, extract_markdown_headings
from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...instructions_v3 import stage_context_text
from ...observability import _append_stage_trace
from ...prompts.editorial_v3 import P2B_V3_TITLE_PROMPT
from ...support import _json, _safe_dict, _safe_str


def _title_material(state: Prompt2BlogV3GraphState) -> dict[str, Any]:
    outline = _safe_dict(state.get("outline"))
    content = _safe_str(_safe_dict(state.get("rewrite")).get("improved_content"))
    return {
        "direct_answer_focus": _safe_str(outline.get("direct_answer_focus")),
        "takeaway_focus": _safe_str(outline.get("takeaway_focus")),
        "headings": extract_markdown_headings(content),
    }


# Title is compact and constrained by headline rules, the brief, and settled
# article. A dedicated medium-effort model avoids paying full drafting effort
# for one string while keeping it on Claude rather than the research worker.
def run_v3_title_stage(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Write the headline from the shared standard and the approved brief.

    The original title reaches this stage as author intent, so the headline can
    keep what the brief was about instead of re-deriving a subject from
    the finished prose.
    """
    stage = "stage_v3_title"
    run_id = state["run_id"]
    rewrite = state["rewrite"]
    title_model = state.get("title_model", P2B_V3_TITLE_MODEL)
    dependencies.recorder.start_stage(run_id, stage)

    prompt = P2B_V3_TITLE_PROMPT.format(
        headline_context=stage_context_text(state["stage_contexts"], "title"),
        article_signals=_json(_title_material(state)),
    )
    raw_response = dependencies.llm.invoke_text(
        prompt=prompt,
        max_tokens=512,
        temperature=0.1,
        model_name=title_model,
    )
    final_title = (
        _clean_title(raw_response)
        or rewrite["improved_title"]
        or state["brief"]["seed"]
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
        model_name=title_model,
        prompt=prompt,
        raw_response=raw_response,
        output={"final_title": final_title},
    )
    return {"current_stage": stage, "final_title": final_title}
