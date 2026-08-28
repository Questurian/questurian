from __future__ import annotations

import logging
from typing import Any

from ...config import P2B_V3_OUTLINE_MODEL
from ...content.outline_v3 import (
    format_v3_outline_for_prompt,
    sanitize_v3_outline,
    validate_v3_outline,
)
from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...observability import _append_stage_trace
from ...prompts.editorial_v3 import P2B_V3_OUTLINE_PROMPT
from ...schemas import V3_OUTLINE_SCHEMA
from ...support import _safe_dict, _safe_int

logger = logging.getLogger(__name__)

EMPTY_OUTLINE: dict[str, Any] = {
    "working_title": "",
    "direct_answer_focus": "",
    "sections": [],
    "takeaway_focus": "",
    "commission_alignment": "Commission alignment not stated.",
    "unsupported_requirements": [],
}


def _target_word_count(state: Prompt2BlogV3GraphState) -> int:
    length = _safe_dict(_safe_dict(state["option_context"]).get("length"))
    return _safe_int(length.get("target_word_count"), default=0)


def run_v3_outline_stage(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Plan the article against the commission before any prose exists.

    A plan that drifts from the approved scope, or that cites a claim the
    evidence does not contain, is rejected here rather than turned into prose.
    A failed or unusable plan degrades to no plan; it never fails the run.
    """
    stage = "stage_v3_outline"
    run_id = state["run_id"]
    dependencies.recorder.start_stage(run_id, stage)

    evidence = state["evidence"]
    target_word_count = _target_word_count(state)
    outline = dict(EMPTY_OUTLINE)
    diagnostics: dict[str, Any] = {}
    accepted = False
    raw_response = ""
    outline_model = state.get("outline_model", P2B_V3_OUTLINE_MODEL)

    prompt = P2B_V3_OUTLINE_PROMPT.format(
        instructions=state["instruction_text"],
        target_word_count=target_word_count or "Not specified.",
    )

    try:
        parsed, raw_response = dependencies.llm.invoke_json(
            prompt=prompt,
            max_tokens=2048,
            temperature=0.1,
            model_name=outline_model,
            schema=V3_OUTLINE_SCHEMA,
        )
        candidate = sanitize_v3_outline(parsed)
        accepted, diagnostics = validate_v3_outline(
            candidate,
            commission=state["commission"],
            claim_ids={claim["claim_id"] for claim in evidence["claims"]},
            requirement_ids={
                requirement["requirement_id"]
                for requirement in evidence["requirements"]
            },
            target_word_count=target_word_count,
        )
        if accepted:
            outline = candidate
        else:
            logger.warning(
                "Prompt2Blog v3 outline rejected for run %s: %s", run_id, diagnostics
            )
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=outline_model,
            prompt=prompt,
            raw_response=raw_response,
            parsed=parsed,
            output={"outline": outline, "accepted": accepted, "checks": diagnostics},
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Prompt2Blog v3 outline stage failed: %s", exc)
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=outline_model,
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
        "outline_text": format_v3_outline_for_prompt(outline),
    }
