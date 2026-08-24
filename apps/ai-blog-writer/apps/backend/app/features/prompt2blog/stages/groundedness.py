from __future__ import annotations

import logging
from typing import Any

from ..dependencies import PipelineDependencies
from ..graph.state import Prompt2BlogGraphState
from ..observability import _append_stage_trace
from ..prompts.quality import P2B_GROUNDEDNESS_PROMPT
from ..quality import _sanitize_groundedness, unchecked_groundedness

logger = logging.getLogger(__name__)


def check_groundedness(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
    *,
    stage: str,
    rewrite: dict[str, Any],
) -> dict[str, Any]:
    """Run the grounding check over one draft and return the sanitised result.

    Shared by the in-loop check and the post-augmentation re-check so both ask
    the same question of the same sources.
    """
    run_id = state["run_id"]
    prompt = P2B_GROUNDEDNESS_PROMPT.format(
        raw_sources=state["raw_sources_text"],
        cleaned_data=state["cleaned_data"],
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
        logger.warning("Prompt2Blog groundedness check failed: %s", exc)
        groundedness = unchecked_groundedness()
        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=state["audit_model"],
            prompt=prompt,
            error=str(exc),
        )

    if groundedness["unsupported_claims"]:
        logger.info(
            "Prompt2Blog run %s has %d unsupported claims (%d high severity)",
            run_id,
            len(groundedness["unsupported_claims"]),
            groundedness["high_severity_count"],
        )

    dependencies.recorder.record_stage(
        run_id,
        stage,
        {"groundedness": groundedness, "raw_response": raw_response},
    )
    return groundedness


def run_groundedness_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Check the draft's claims against the source material.

    The quality audit scored `too_close_to_source` -- the plagiarism direction.
    Nothing checked the opposite direction, so a draft that invented a visa
    rule, a price or an opening time passed every gate. The supplement stage
    can generate content the sources never contained, and that content flows
    straight into compose, so the risk is structural rather than incidental.

    Runs inside the repair loop, so a repaired draft is re-checked.
    """
    stage = "stage_groundedness"
    dependencies.recorder.start_stage(state["run_id"], stage)
    groundedness = check_groundedness(
        state,
        dependencies,
        stage=stage,
        rewrite=state["rewrite"],
    )
    return {
        "current_stage": stage,
        "groundedness": groundedness,
    }
