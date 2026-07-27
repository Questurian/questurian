from __future__ import annotations

import logging
from typing import Any

from ..content.outline import (
    _sanitize_outline,
    format_outline_for_prompt,
    validate_outline,
)
from ..dependencies import PipelineDependencies
from ..graph.state import Prompt2BlogGraphState
from ..observability import _append_stage_trace
from ..prompts.generation import P2B_OUTLINE_PROMPT
from ..support import _json, _safe_dict, _safe_int

logger = logging.getLogger(__name__)

EMPTY_OUTLINE: dict[str, Any] = {
    "working_title": "",
    "direct_answer_focus": "",
    "sections": [],
    "takeaway_focus": "",
    "guideline_alignment": "Guideline alignment not stated.",
    "unsupported_requests": [],
}


def _target_word_count(state: Prompt2BlogGraphState) -> int:
    formatting = _safe_dict(_safe_dict(state["writing_brief"]).get("formatting"))
    return _safe_int(formatting.get("target_word_count"), default=0)


def run_outline_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Plan the article's sections before any prose exists.

    Compose previously wrote a whole article in one shot with no structural
    plan, so nothing ever checked the intended shape against the article-type
    guideline until the prose already existed. Planning first is also what lets
    an unsupportable guideline requirement be flagged instead of invented.

    A failed or unusable plan degrades to no plan rather than failing the run.
    """
    stage = "stage_outline"
    run_id = state["run_id"]
    guideline = state["guideline"]
    dependencies.recorder.start_stage(run_id, stage)

    target_word_count = _target_word_count(state)
    outline = dict(EMPTY_OUTLINE)
    diagnostics: dict[str, Any] = {}
    accepted = False
    raw_response = ""

    prompt = P2B_OUTLINE_PROMPT.format(
        article_type_name=guideline["name"],
        article_type_definition=guideline["definition"],
        guideline=guideline["guideline"] or "No guideline provided.",
        title_guideline=guideline["title_guideline"] or "No title guideline provided.",
        target_word_count=target_word_count or "Not specified.",
        hard_constraints=state["hard_constraints"],
        cleaned_data=state["cleaned_data"],
        supplemental_content=state["supplemental_content"]
        or "No supplemental material generated.",
        writing_brief_json=_json(state["writing_brief"]),
        narrative_focus=state["narrative_focus"],
        style_directive=state["style_directive"],
    )

    try:
        parsed, raw_response = dependencies.llm.invoke_json(
            prompt=prompt,
            max_tokens=2048,
            temperature=0.1,
            model_name=state["writing_model"],
        )
        candidate = _sanitize_outline(parsed)
        accepted, diagnostics = validate_outline(
            candidate,
            target_word_count=target_word_count,
        )
        if accepted:
            outline = candidate
        else:
            logger.warning(
                "Prompt2Blog outline rejected for run %s: %s", run_id, diagnostics
            )
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=state["writing_model"],
            prompt=prompt,
            raw_response=raw_response,
            parsed=parsed,
            output={"outline": outline, "accepted": accepted, "checks": diagnostics},
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Prompt2Blog outline stage failed: %s", exc)
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=state["writing_model"],
            prompt=prompt,
            error=str(exc),
        )

    dependencies.recorder.record_stage(
        run_id,
        stage,
        {
            "outline": outline,
            "accepted": accepted,
            "checks": diagnostics,
            "raw_response": raw_response,
        },
    )
    return {
        "current_stage": stage,
        "outline": outline,
        "outline_accepted": accepted,
        "outline_text": format_outline_for_prompt(outline),
    }
