from __future__ import annotations

import logging
from typing import Any

from app.shared.provider_faults import is_fatal_provider_fault

from ...content.outline_v3 import (
    drop_context_only_sections,
    format_v3_outline_for_prompt,
    outline_focus_only,
    sanitize_v3_outline,
    validate_v3_outline,
)
from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...instructions_v3 import stage_context_text
from ...observability import _append_stage_trace
from ...prompts.editorial_v3 import P2B_V3_OUTLINE_PROMPT
from ...schemas import V3_OUTLINE_SCHEMA
from ...support import _safe_dict, _target_word_count

logger = logging.getLogger(__name__)

EMPTY_OUTLINE: dict[str, Any] = {
    "working_title": "",
    "direct_answer_focus": "",
    "sections": [],
    "takeaway_focus": "",
    "brief_alignment": "Brief alignment not stated.",
    "unsupported_requirements": [],
}


def run_v3_outline_stage(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Plan the article against the brief before any prose exists.

    A plan that drifts from the approved scope, or that cites a claim the
    evidence does not contain, is rejected here rather than turned into prose.
    A failed or unusable plan degrades to no plan; it never fails the run.
    """
    stage = "stage_v3_outline"
    run_id = state["run_id"]
    dependencies.recorder.start_stage(run_id, stage)

    evidence = state["evidence"]
    target_word_count = _target_word_count(_safe_dict(state["option_context"]))
    outline = dict(EMPTY_OUTLINE)
    diagnostics: dict[str, Any] = {}
    accepted = False
    repaired = False
    dropped_headings: list[str] = []
    raw_response = ""
    outline_model = state.get("outline_model")

    prompt = P2B_V3_OUTLINE_PROMPT.format(
        instructions=stage_context_text(state["stage_contexts"], "outline"),
        target_word_count=target_word_count or "Not specified.",
    )

    try:
        parsed, raw_response = dependencies.llm.invoke_json(
            job_id="p2b.outline",
            prompt=prompt,
            max_tokens=2048,
            temperature=0.1,
            model_name=outline_model,
            schema=V3_OUTLINE_SCHEMA,
        )
        candidate = sanitize_v3_outline(parsed)
        accepted, diagnostics = validate_v3_outline(
            candidate,
            work_order=state["work_order"],
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
            # One failed check used to delete the whole plan. Repair what can
            # be repaired first: a context-only heading is fixed by dropping
            # that section, which is what the check wanted, and leaves the
            # sections that passed intact.
            headings = diagnostics.get("context_only_headings") or []
            if headings:
                repaired_candidate = drop_context_only_sections(candidate, headings)
                repaired_accepted, repaired_diagnostics = validate_v3_outline(
                    repaired_candidate,
                    work_order=state["work_order"],
                    claim_ids={claim["claim_id"] for claim in evidence["claims"]},
                    requirement_ids={
                        requirement["requirement_id"]
                        for requirement in evidence["requirements"]
                    },
                    target_word_count=target_word_count,
                )
                if repaired_accepted:
                    logger.warning(
                        "Prompt2Blog v3 outline repaired for run %s by dropping "
                        "context-only sections %s",
                        run_id,
                        headings,
                    )
                    accepted = True
                    repaired = True
                    dropped_headings = list(headings)
                    outline = repaired_candidate
                    diagnostics = {
                        **repaired_diagnostics,
                        "repaired": True,
                        "dropped_headings": dropped_headings,
                        "original_checks": diagnostics,
                    }
            if not accepted:
                # Still unusable as a plan. The answer and the takeaway are
                # separately valid and are the most useful lines the stage
                # produces, so they travel even when the sections cannot.
                outline = outline_focus_only(candidate)
                logger.warning(
                    "Prompt2Blog v3 outline rejected for run %s: %s",
                    run_id,
                    diagnostics,
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
        if is_fatal_provider_fault(exc):
            raise
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
            # A plan that needed repair is a signal about the outline model
            # worth reading later, not something to bury in a log line.
            "repaired": repaired,
            "dropped_headings": dropped_headings,
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
