from __future__ import annotations

import logging
from typing import Any

from app.shared.provider_faults import is_fatal_provider_fault

from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...instructions_v3 import EVIDENCE_DISPOSITION_POLICY
from ...observability import _append_stage_trace
from ...packet_v4 import supplied_material_text
from ...prompts.editorial_v3 import P2B_V3_GROUNDEDNESS_PROMPT
from ...quality import (
    GroundednessMalformed,
    _sanitize_groundedness,
    unchecked_groundedness,
)
from ...schemas import GROUNDEDNESS_SCHEMA

logger = logging.getLogger(__name__)

# One retry, not a loop. A malformed verdict is usually a formatting slip the
# same call gets right the second time; a checker that cannot answer the
# contract twice is not going to answer it on the fifth attempt, and every
# further attempt spends the repair budget on the stage that is not writing.
GROUNDEDNESS_MALFORMED_ATTEMPTS = 2

# Appended for the retry only. The first call is asked in the ordinary way; a
# response that failed validation gets told which contract it missed, because
# "return JSON" is what it already did.
_MALFORMED_RETRY_NOTE = """
YOUR PREVIOUS RESPONSE WAS REJECTED:
{reason}

Return the object exactly as specified above. `grounded` must be a boolean,
`assessment` must be a non-empty sentence, and every entry in
`unsupported_claims` must carry `claim`, `reason`, and a `severity` of
exactly "high" or "low". If nothing is unsupported, return an empty list and
`grounded: true` -- never `grounded: false` with no claim explaining it."""


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
    """
    run_id = state["run_id"]
    base_prompt = P2B_V3_GROUNDEDNESS_PROMPT.format(
        evidence_disposition_policy=EVIDENCE_DISPOSITION_POLICY,
        evidence_records=state["evidence"]["records_text"],
        supplied_material=supplied_material_text(state.get("packet")),
        rewritten_title=rewrite["improved_title"],
        rewritten_content=rewrite["improved_content"],
    )

    groundedness_model = state.get("groundedness_model")
    prompt = base_prompt
    raw_response = ""
    rejected: list[str] = []

    for attempt in range(1, GROUNDEDNESS_MALFORMED_ATTEMPTS + 1):
        try:
            parsed, raw_response = dependencies.llm.invoke_json(
                job_id="p2b.groundedness",
                prompt=prompt,
                max_tokens=2048,
                temperature=0.0,
                model_name=groundedness_model,
                schema=GROUNDEDNESS_SCHEMA,
            )
        except Exception as exc:  # noqa: BLE001
            # A dead account is not a checker outage. Degrading here would
            # record "the check did not run" -- which reads as a checker
            # problem -- and then spend the next stage's call on the same
            # exhausted credential.
            if is_fatal_provider_fault(exc):
                raise
            logger.warning("Prompt2Blog v3 groundedness check failed: %s", exc)
            groundedness = unchecked_groundedness(f"provider call failed: {exc}")
            _append_stage_trace(
                state["trace"],
                state["include_debug"],
                stage=stage,
                model_name=groundedness_model,
                prompt=prompt,
                error=str(exc),
                output=groundedness,
            )
            break

        try:
            groundedness = _sanitize_groundedness(parsed)
        except GroundednessMalformed as exc:
            # Recorded, not swallowed. A run whose checker never produced a
            # readable verdict should say so on its own receipt rather than
            # arrive at finalize looking like a run nobody checked for no
            # reason.
            reason = str(exc)
            rejected.append(reason)
            logger.warning(
                "Prompt2Blog v3 groundedness response rejected (attempt %d): %s",
                attempt,
                reason,
            )
            _append_stage_trace(
                state["trace"],
                state["include_debug"],
                stage=stage,
                model_name=groundedness_model,
                input_payload={"attempt": attempt},
                prompt=prompt,
                raw_response=raw_response,
                parsed=parsed,
                error=f"malformed groundedness response: {reason}",
            )
            if attempt < GROUNDEDNESS_MALFORMED_ATTEMPTS:
                prompt = base_prompt + _MALFORMED_RETRY_NOTE.format(reason=reason)
                continue
            groundedness = unchecked_groundedness(
                f"checker returned an unreadable verdict ({'; '.join(rejected)})"
            )
            break

        _append_stage_trace(
            state["trace"],
            state["include_debug"],
            stage=stage,
            model_name=groundedness_model,
            input_payload={"attempt": attempt},
            prompt=prompt,
            raw_response=raw_response,
            parsed=parsed,
            output=groundedness,
        )
        break

    if rejected:
        groundedness = {**groundedness, "rejected_responses": rejected}

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
