from __future__ import annotations

import logging
from typing import Any

from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...observability import _append_stage_trace
from ...prompts.editorial_v3 import P2B_V3_GROUNDEDNESS_PROMPT
from ...quality import _sanitize_groundedness, unchecked_groundedness

logger = logging.getLogger(__name__)


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
    """
    run_id = state["run_id"]
    prompt = P2B_V3_GROUNDEDNESS_PROMPT.format(
        evidence_records=state["evidence"]["records_text"],
        rewritten_title=rewrite["improved_title"],
        rewritten_content=rewrite["improved_content"],
    )

    raw_response = ""
    try:
        parsed, raw_response = dependencies.llm.invoke_json(
            prompt=prompt,
            max_tokens=2048,
            temperature=0.0,
            model_name=state["audit_model"],
        )
        groundedness = _sanitize_groundedness(parsed)
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=state["audit_model"],
            prompt=prompt,
            raw_response=raw_response,
            parsed=parsed,
            output=groundedness,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Prompt2Blog v3 groundedness check failed: %s", exc)
        groundedness = unchecked_groundedness()
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=state["audit_model"],
            prompt=prompt,
            error=str(exc),
        )

    dependencies.recorder.record_stage(
        run_id,
        stage,
        {"groundedness": groundedness, "raw_response": raw_response},
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
