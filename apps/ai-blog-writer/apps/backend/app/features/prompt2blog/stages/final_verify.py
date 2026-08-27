from __future__ import annotations

import logging
from typing import Any

from ..dependencies import PipelineDependencies
from ..graph.state import Prompt2BlogGraphState
from ..observability import _append_stage_trace
from ..quality import CONSTRAINT_MEASUREMENT_KEYS, _build_constraint_checks
from .groundedness import check_groundedness

logger = logging.getLogger(__name__)


def run_final_verify_stage(
    state: Prompt2BlogGraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Re-check the article the run is actually going to ship.

    The quality audit and the grounding check both ran before editorial
    augmentation. Augmentation is additive by contract, but it is a full-article
    generation call: it returns rewritten prose, and the only thing standing
    between its output and the reader was a word-count ratio and a heading
    count. Everything downstream then reported pre-augmentation groundedness
    for post-augmentation text.

    So when augmentation actually changed the prose, the grounding check runs
    again over the changed text and its verdict replaces the stale one. When
    augmentation was skipped, rolled back, or returned the draft unchanged, the
    text still matches what the auditor saw, the earlier verdict still
    describes it, and no second call is bought.
    """
    stage = "stage_final_verify"
    run_id = state["run_id"]
    rewrite = state["rewrite"]
    quality = state["quality"]
    dependencies.recorder.start_stage(run_id, stage)

    content_changed = bool(state.get("content_changed_by_augmentation", False))

    groundedness = state["groundedness"]
    if content_changed:
        groundedness = check_groundedness(
            state,
            dependencies,
            stage=stage,
            rewrite=rewrite,
        )

    # Recomputed on the shipping text so the settled checks describe it rather
    # than the draft the auditor saw.
    final_checks = _build_constraint_checks(
        rewrite["improved_title"],
        rewrite["improved_content"],
        state["writing_brief"],
    )
    quality_checks = {
        **state["quality_checks"],
        **{
            key: value
            for key, value in final_checks.items()
            if key not in CONSTRAINT_MEASUREMENT_KEYS
        },
        "claims_grounded": groundedness["grounded"],
    }
    quality = {
        **quality,
        "constraint_checks": quality_checks,
        "groundedness": groundedness,
    }

    verification = {
        "content_changed_after_audit": content_changed,
        "regrounded": content_changed,
        "claims_grounded": groundedness["grounded"],
        "groundedness_checked": groundedness["checked"],
        "high_severity_count": groundedness["high_severity_count"],
    }
    if content_changed and not groundedness["grounded"]:
        logger.warning(
            "Prompt2Blog run %s lost grounding during editorial augmentation "
            "(%d high-severity claims)",
            run_id,
            groundedness["high_severity_count"],
        )

    dependencies.recorder.record_stage(run_id, stage, verification)
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        output=verification,
    )
    return {
        "current_stage": stage,
        "groundedness": groundedness,
        "quality": quality,
        "quality_checks": quality_checks,
    }
