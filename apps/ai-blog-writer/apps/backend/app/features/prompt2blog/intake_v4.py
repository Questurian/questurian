"""Driving the four intake stages, and keeping them on the run.

A run is created when the seed is typed, not when writing starts (ADR 0031).
Everything before the graph -- the grill, the brief, the work order, and later
the research -- is recorded on that run like any other stage.

Three things follow from that, and they are the reason it works this way. The
token ledger already follows runs, so moving intake in-app does not need
separate accounting to stay visible on the receipt. The resume machinery
already restores a run from its last completed stage, so an abandoned grill is
resumable by machinery that exists. And the brief has a durable home from the
first keystroke rather than living in a browser tab.

Each function here does one turn's work: load what the run knows, advance it,
write it back. Nothing is held in memory between calls.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from app.core import read_stage_result

from .brief_v4 import BRIEF_STAGE, brief_stage_record, build_brief
from .config import FEATURE_NAME
from .contracts_v4 import ArticleBrief, GrillState, Prompt2BlogWorkOrder
from .grill_v4 import (
    GRILL_STAGE,
    GrillDependencies,
    GrillUnusableResponse,
    answer_grill,
    grill_stage_record,
    reopen_grill,
    start_grill,
)
from .coverage_v4 import CoverageVerdict, assess_coverage
from .contracts_v4 import (
    EvidencePackage,
    Prompt2BlogV4Request,
    Prompt2BlogWritingProfiles,
)
from .research_v4 import (
    RESEARCH_STAGE,
    ResearchDependencies,
    research_stage_record,
    run_research,
)
from .run_budget import enforce_run_budget
from .run_recorder import RunRecorder
from .support import _safe_dict, _safe_str
from .work_order_v4 import (
    WORK_ORDER_STAGE,
    CutOutcome,
    build_work_order,
    cut_work_order,
    work_order_stage_record,
)

logger = logging.getLogger(__name__)

# The state each intake stage keeps for the next one, stored beside the
# human-readable record. The record is what a person reads; this is what the
# next turn loads.
STATE_KEY = "state"


@dataclass
class IntakeServices:
    """What a turn needs. Every half is replaceable in tests."""

    dependencies: GrillDependencies
    recorder: RunRecorder
    # Only the research turn needs these, so a test that never researches does
    # not have to invent them.
    research: ResearchDependencies | None = None


def _stage_data(run_id: str, stage: str) -> dict[str, Any]:
    """The payload half of one stage row, or an empty dict.

    The recorder wraps what it is given under `data` alongside a timestamp, so
    every read here has to unwrap before it looks for anything.
    """
    return _safe_dict(_safe_dict(read_stage_result(run_id, stage)).get("data"))


def _run_tokens_spent(run_id: str) -> int | None:
    """What this run has spent so far, or None when nothing is counting.

    None is not zero: an unmetered run is not a free one, and the ceiling has
    to be able to tell the difference.
    """
    ledger = _stage_data(run_id, "usage_ledger")
    total = _safe_dict(ledger.get("totals")).get("total_tokens")
    return total if isinstance(total, int) else None


def _record(services: IntakeServices, run_id: str, stage: str, payload: dict[str, Any]) -> None:
    # start_stage opens a fresh usage attempt, which is what keeps a repeated
    # stage -- and the grill repeats by design -- from overwriting its own
    # receipt in the ledger.
    services.recorder.start_stage(run_id, stage)
    services.recorder.record_stage(run_id, stage, payload)


def _load_grill(run_id: str) -> GrillState:
    stored = _stage_data(run_id, GRILL_STAGE).get(STATE_KEY)
    if not isinstance(stored, dict):
        raise LookupError(f"No grill in progress for run {run_id}.")
    return GrillState.model_validate(stored)


def load_brief(run_id: str) -> ArticleBrief:
    stored = _stage_data(run_id, BRIEF_STAGE).get(STATE_KEY)
    if not isinstance(stored, dict):
        raise LookupError(f"No brief approved for run {run_id}.")
    return ArticleBrief.model_validate(stored)


def load_work_order(run_id: str) -> Prompt2BlogWorkOrder:
    stored = _stage_data(run_id, WORK_ORDER_STAGE).get(STATE_KEY)
    if not isinstance(stored, dict):
        raise LookupError(f"No work order for run {run_id}.")
    return Prompt2BlogWorkOrder.model_validate(stored)


def _write_grill(services: IntakeServices, state: GrillState) -> GrillState:
    _record(
        services,
        state.run_id,
        GRILL_STAGE,
        {**grill_stage_record(state), STATE_KEY: json.loads(state.model_dump_json())},
    )
    return state


def begin_intake(
    seed: str,
    services: IntakeServices,
    *,
    owner_staff_id: str | None = None,
) -> GrillState:
    """One typed line becomes a run and its first question."""
    cleaned = _safe_str(seed)
    if not cleaned:
        raise ValueError("Say what you want to write about.")

    run_id = str(uuid4())
    services.recorder.queue(run_id, owner_staff_id)
    logger.info("Prompt2Blog intake opened", extra={"run_id": run_id, "feature": FEATURE_NAME})
    try:
        return _write_grill(
            services, start_grill(run_id, cleaned, services.dependencies)
        )
    except GrillUnusableResponse as error:
        # The run already exists, so it must be able to say why it is empty. A
        # run with no stages and no explanation is the worst thing to hand
        # someone who is trying to work out what happened.
        _record(
            services,
            run_id,
            GRILL_STAGE,
            {"status": "failed", "seed": cleaned, "unusable_response": error.raw[:4000]},
        )
        raise


def answer_intake(run_id: str, answer: str, services: IntakeServices) -> GrillState:
    """Record what the operator typed and take the next turn."""
    enforce_run_budget(_run_tokens_spent(run_id), stage=GRILL_STAGE)
    state = _load_grill(run_id)
    return _write_grill(services, answer_grill(state, answer, services.dependencies))


def reopen_intake(run_id: str, services: IntakeServices) -> GrillState:
    """Go back into the grill.

    The single exit from every dead end: a refuted premise, a thin dossier, or
    a brief the operator no longer wants. Anything downstream that depended on
    what changes is discarded rather than left to look current -- research that
    answered the old spine is not research for the new one.
    """
    enforce_run_budget(_run_tokens_spent(run_id), stage=GRILL_STAGE)
    state = _load_grill(run_id)
    reopened = reopen_grill(state, services.dependencies)

    for stage in (BRIEF_STAGE, WORK_ORDER_STAGE, RESEARCH_STAGE):
        if read_stage_result(run_id, stage) is not None:
            services.recorder.discard_stage(run_id, stage)

    return _write_grill(services, reopened)


def approve_brief(run_id: str, services: IntakeServices) -> ArticleBrief:
    """Turn an agreed grill into the brief the run answers to."""
    enforce_run_budget(_run_tokens_spent(run_id), stage=BRIEF_STAGE)
    brief = build_brief(_load_grill(run_id), services.dependencies)
    _record(
        services,
        run_id,
        BRIEF_STAGE,
        {**brief_stage_record(brief), STATE_KEY: json.loads(brief.model_dump_json())},
    )
    return brief


def plan_research(run_id: str, services: IntakeServices) -> Prompt2BlogWorkOrder:
    """Translate the approved brief into checkable questions."""
    enforce_run_budget(_run_tokens_spent(run_id), stage=WORK_ORDER_STAGE)
    work_order = build_work_order(load_brief(run_id), services.dependencies)
    _record(
        services,
        run_id,
        WORK_ORDER_STAGE,
        {
            **work_order_stage_record(work_order),
            STATE_KEY: json.loads(work_order.model_dump_json()),
        },
    )
    return work_order


def apply_cut(
    run_id: str,
    services: IntakeServices,
    *,
    struck_ids: list[str],
    added_questions: list[str] | None = None,
) -> CutOutcome:
    """Apply the operator's cut. No model call; this is their decision, not one."""
    if read_stage_result(run_id, RESEARCH_STAGE) is not None:
        # Research answered the questions that were there before the cut.
        services.recorder.discard_stage(run_id, RESEARCH_STAGE)
    outcome = cut_work_order(
        load_work_order(run_id),
        load_brief(run_id),
        struck_ids=struck_ids,
        added_questions=added_questions,
    )
    _record(
        services,
        run_id,
        WORK_ORDER_STAGE,
        {
            **work_order_stage_record(outcome.work_order, outcome.warnings),
            STATE_KEY: json.loads(outcome.work_order.model_dump_json()),
        },
    )
    return outcome


def load_evidence(run_id: str) -> EvidencePackage:
    stored = _stage_data(run_id, RESEARCH_STAGE).get(STATE_KEY)
    if not isinstance(stored, dict):
        raise LookupError(f"No research for run {run_id}.")
    return EvidencePackage.model_validate(stored)


def do_research(run_id: str, services: IntakeServices) -> CoverageVerdict:
    """Run both research passes and decide whether this can be written.

    The verdict is recorded whether or not it passes. A run that stopped here
    should be able to say why without anyone re-running anything.
    """
    if services.research is None:
        raise ValueError("Research is not configured for this run.")
    enforce_run_budget(_run_tokens_spent(run_id), stage=RESEARCH_STAGE)

    brief = load_brief(run_id)
    work_order = load_work_order(run_id)
    evidence, notes = run_research(brief, work_order, services.research)
    verdict = assess_coverage(work_order, evidence)

    _record(
        services,
        run_id,
        RESEARCH_STAGE,
        {
            **research_stage_record(evidence, notes),
            "coverage": verdict.as_record(),
            STATE_KEY: json.loads(evidence.model_dump_json()),
        },
    )
    return verdict


def writing_request(run_id: str, *, length_id: str = "medium") -> Prompt2BlogV4Request:
    """Assemble what the graph runs from, out of what intake settled.

    Refuses if research said no. The gate is decided once, in one place; this
    is not a second opinion, it is the same one enforced at the hand-off.
    """
    brief = load_brief(run_id)
    work_order = load_work_order(run_id)
    evidence = load_evidence(run_id)

    verdict = assess_coverage(work_order, evidence)
    if not verdict.can_write:
        raise ValueError(
            f"This run cannot be written yet: {verdict.reason}. "
            + " ".join(verdict.findings)
        )

    return Prompt2BlogV4Request(
        brief=brief,
        work_order=work_order,
        evidence_package=evidence,
        profiles=Prompt2BlogWritingProfiles(length_id=length_id),
    )


def intake_state(run_id: str) -> dict[str, Any]:
    """Where this run stands, for a page that may have been reloaded."""
    grill = _stage_data(run_id, GRILL_STAGE)
    brief = _stage_data(run_id, BRIEF_STAGE)
    work_order = _stage_data(run_id, WORK_ORDER_STAGE)
    research = _stage_data(run_id, RESEARCH_STAGE)
    grill_state = _safe_dict(grill.get(STATE_KEY))
    return {
        "run_id": run_id,
        "step": (
            "research"
            if research
            else "work_order"
            if work_order
            else "brief"
            if brief
            else "grill"
            if grill
            else "seed"
        ),
        "grill": {
            "status": _safe_str(grill_state.get("status")),
            "seed": _safe_str(grill_state.get("seed")),
            "turns": grill.get("transcript") or [],
            "pending": grill.get("pending"),
            "consensus": _safe_str(grill_state.get("consensus")),
        }
        if grill
        else None,
        "brief": {key: value for key, value in brief.items() if key != STATE_KEY} or None,
        "work_order": {
            key: value for key, value in work_order.items() if key != STATE_KEY
        }
        or None,
        "research": {key: value for key, value in research.items() if key != STATE_KEY}
        or None,
    }
