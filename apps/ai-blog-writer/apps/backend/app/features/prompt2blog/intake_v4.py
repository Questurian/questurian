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

from pydantic import ValidationError

from app.core import get_all_runs, read_stage_result, read_status

from .graph.topology_v3 import V3_NODE_STAGE_NAMES

from .brief_v4 import (
    BRIEF_STAGE,
    BriefIncomplete,
    BriefUnusable,
    brief_stage_record,
    build_brief,
)
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
from .notes_v4 import PUNCH_LIST_STAGE, build_punch_list
from .gate_v4 import (
    GateAnswerRefused,
    answer_requirement,
    dismiss_venue,
    drop_venue,
    mark_nonexistent,
    mark_unpublished,
    note_venue,
    omit_requirement,
    reask_requirement,
    suggested_move,
    venues_to_check,
)
from .contracts_v4 import (
    EvidencePackage,
    Prompt2BlogV4Request,
    Prompt2BlogWritingProfiles,
)
from .research_v4 import (
    NOTES_STAGE,
    PROGRESS_STAGE,
    RESEARCH_STAGE,
    ResearchDependencies,
    ResearchUnusable,
    gather_one_requirement,
    gather_research,
    notes_from_record,
    notes_stage_record,
    research_stage_record,
    structure_research,
)
from .polish_v4 import build_polish_prompt
from .run_budget import enforce_run_budget
from .run_recorder import RunRecorder
from .support import _safe_dict, _safe_str
from .work_order_v4 import (
    WORK_ORDER_STAGE,
    CutOutcome,
    WorkOrderUnusable,
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


def _open(services: IntakeServices, run_id: str, stage: str) -> None:
    """Open the stage before the model call it is going to pay for.

    Usage is attributed to whichever stage was open when the call was made.
    Every intake stage used to call the model first and open the stage after,
    so the call landed under `unattributed` and the stage row reported zero.
    Run cac73671 recorded exactly that: one call, 2,196 tokens, stage
    `unattributed`, beside a `stage_v4_grill` row claiming nothing was spent.
    """
    services.recorder.start_stage(run_id, stage)


def _record(services: IntakeServices, run_id: str, stage: str, payload: dict[str, Any]) -> None:
    # start_stage opens a fresh usage attempt, which is what keeps a repeated
    # stage -- and the grill repeats by design -- from overwriting its own
    # receipt in the ledger. `_once` because `_open` has usually opened it
    # already; opening again here would file the row under an attempt the
    # call was not recorded against.
    services.recorder.start_stage_once(run_id, stage)
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
    _open(services, run_id, GRILL_STAGE)
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
    _open(services, run_id, GRILL_STAGE)
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
    _open(services, run_id, GRILL_STAGE)
    reopened = reopen_grill(state, services.dependencies)

    for stage in (BRIEF_STAGE, WORK_ORDER_STAGE, RESEARCH_STAGE, NOTES_STAGE):
        if read_stage_result(run_id, stage) is not None:
            services.recorder.discard_stage(run_id, stage)

    return _write_grill(services, reopened)


def approve_brief(run_id: str, services: IntakeServices) -> ArticleBrief:
    """Turn an agreed grill into the brief the run answers to."""
    enforce_run_budget(_run_tokens_spent(run_id), stage=BRIEF_STAGE)
    try:
        _open(services, run_id, BRIEF_STAGE)
        brief = build_brief(_load_grill(run_id), services.dependencies)
    except BriefUnusable as error:
        _record(
            services,
            run_id,
            BRIEF_STAGE,
            {
                "status": "failed",
                "reason": error.reason,
                "unusable_response": error.raw[:4000],
            },
        )
        raise
    except BriefIncomplete as error:
        # The grill has already been paid for by this point, so a failure here
        # has to leave something to read. Run 90b3f9bc (2026-08-30 20:01Z)
        # failed with three fields empty and wrote no stage row at all, so the
        # only record of what came back was a log line nobody was watching.
        _record(
            services,
            run_id,
            BRIEF_STAGE,
            {
                "status": "failed",
                "missing": list(error.missing),
                "unusable_response": error.raw[:4000],
            },
        )
        raise
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
    try:
        _open(services, run_id, WORK_ORDER_STAGE)
        work_order = build_work_order(load_brief(run_id), services.dependencies)
    except WorkOrderUnusable as error:
        _record(
            services,
            run_id,
            WORK_ORDER_STAGE,
            {
                "status": "failed",
                "reason": error.reason,
                "unusable_response": error.raw[:4000],
            },
        )
        raise
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
    for stage in (RESEARCH_STAGE, NOTES_STAGE):
        # Research answered the questions that were there before the cut.
        if read_stage_result(run_id, stage) is not None:
            services.recorder.discard_stage(run_id, stage)
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

    # Ten sequential web searches, then one structuring call. Every structuring
    # failure used to buy the searches again -- run 90b3f9bc paid for them
    # twice in one evening. The notes are kept the moment they exist and are
    # reused only when they answer this exact plan.
    def record_progress(progress: dict[str, Any]) -> None:
        # Written straight, not through `_record`: that opens a fresh usage
        # attempt each time, and ten empty attempts would bury the stage's real
        # receipt in the ledger.
        services.recorder.record_stage(run_id, PROGRESS_STAGE, progress)

    notes = notes_from_record(_stage_data(run_id, NOTES_STAGE), work_order)
    if notes is None:
        _open(services, run_id, NOTES_STAGE)
        notes = gather_research(
            brief, work_order, services.research, record_progress
        )
        _record(
            services, run_id, NOTES_STAGE, notes_stage_record(work_order, notes)
        )
    else:
        logger.info(
            "Reusing kept research notes",
            extra={"run_id": run_id, "feature": FEATURE_NAME},
        )

    record_progress({"phase": "structuring", "done": len(notes), "total": len(notes),
                     "last_question_back": ""})
    try:
        _open(services, run_id, RESEARCH_STAGE)
        evidence = structure_research(work_order, notes, services.research)
    except ResearchUnusable as error:
        # The most expensive step in intake. A failure here that leaves nothing
        # behind means the next attempt is another guess.
        _record(
            services,
            run_id,
            RESEARCH_STAGE,
            {
                "status": "failed",
                "reason": error.reason,
                "unusable_response": error.raw[:40000],
            },
        )
        raise
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


def settle_gate(
    run_id: str,
    services: IntakeServices,
    *,
    requirement_id: str,
    answer: str | None = None,
    source_url: str | None = None,
    unpublished_note: str | None = None,
    nonexistent_note: str | None = None,
    omit: bool = False,
) -> CoverageVerdict:
    """Settle one blocking question without re-buying the research.

    A blocked run had one exit, the grill, which discards everything the
    research pass paid for. Run 76b36468 was stopped by a single co-op that
    does not publish its price, with six of seven questions answered and ten
    web searches already spent.

    No model call. This is the operator's decision, recorded, and the coverage
    verdict is then re-derived by the same function that blocked -- not a
    second opinion, the same one asked again.
    """
    work_order = load_work_order(run_id)
    evidence = load_evidence(run_id)
    notes = _stage_data(run_id, RESEARCH_STAGE).get("notes") or {}

    if omit:
        evidence, work_order, cost = omit_requirement(
            evidence, work_order, requirement_id=requirement_id
        )
        # The work order changes too, or the coverage check would go on asking
        # about a question that no longer exists.
        _record(
            services,
            run_id,
            WORK_ORDER_STAGE,
            {
                **work_order_stage_record(work_order, [cost]),
                STATE_KEY: json.loads(work_order.model_dump_json()),
            },
        )
    elif unpublished_note is not None:
        evidence = mark_unpublished(
            evidence, requirement_id=requirement_id, note=unpublished_note
        )
    elif nonexistent_note is not None:
        evidence = mark_nonexistent(
            evidence, requirement_id=requirement_id, note=nonexistent_note
        )
    else:
        evidence = answer_requirement(
            evidence,
            requirement_id=requirement_id,
            answer=answer or "",
            source_url=source_url,
        )

    verdict = assess_coverage(work_order, evidence)
    _record(
        services,
        run_id,
        RESEARCH_STAGE,
        {
            **research_stage_record(evidence, notes),
            "coverage": verdict.as_record(),
            # What the operator settled by hand, kept so a wrong fact in the
            # article can be traced to a person rather than blamed on the
            # research that never claimed it.
            "operator_settled": sorted(
                {
                    *(_stage_data(run_id, RESEARCH_STAGE).get("operator_settled") or []),
                    requirement_id,
                }
            ),
            STATE_KEY: json.loads(evidence.model_dump_json()),
        },
    )
    return verdict


def reask_question(
    run_id: str,
    services: IntakeServices,
    *,
    requirement_id: str,
    question: str,
) -> CoverageVerdict:
    """Rewrite one research question and buy one search, not a whole pass.

    Run 76b36468 asked for a community-led project "in Buenos Aires" and got a
    garden collective in Argentina; the article is about Medellín, whose Buenos
    Aires is a neighbourhood. The answer came back `supported`, so nothing
    downstream would have caught it, and the only moves available were to drop
    a perfectly good question or research it by hand.

    One search, then one structuring call. The other questions keep the notes
    they already paid for -- which is the whole reason the notes are stored per
    requirement rather than as one blob.

    The structuring call is not free and is the longest single wait in a run.
    It is re-run rather than patched because deduplication and conflict
    detection are cross-question by construction: splicing one requirement's
    records into a finished dossier would leave the new answer unchecked
    against everything already in it.
    """
    if services.research is None:
        raise RuntimeError("Research dependencies are not configured.")

    enforce_run_budget(_run_tokens_spent(run_id), stage=NOTES_STAGE)

    brief = load_brief(run_id)
    work_order = load_work_order(run_id)
    evidence = load_evidence(run_id)

    evidence, work_order, note = reask_requirement(
        evidence, work_order, requirement_id=requirement_id, question=question
    )

    # The work order first: if the search or the structuring fails, the run is
    # left holding the rewritten question rather than the wording the operator
    # already rejected.
    _record(
        services,
        run_id,
        WORK_ORDER_STAGE,
        {
            **work_order_stage_record(work_order, [note]),
            STATE_KEY: json.loads(work_order.model_dump_json()),
        },
    )

    requirement = next(
        item for item in work_order.requirements if item.requirement_id == requirement_id
    )
    notes = notes_from_record(_stage_data(run_id, NOTES_STAGE), work_order) or {}
    _open(services, run_id, NOTES_STAGE)
    notes = {
        **notes,
        requirement_id: gather_one_requirement(brief, requirement, services.research),
    }
    _record(services, run_id, NOTES_STAGE, notes_stage_record(work_order, notes))

    _open(services, run_id, RESEARCH_STAGE)
    try:
        evidence = structure_research(work_order, notes, services.research)
    except ResearchUnusable as error:
        _record(
            services,
            run_id,
            RESEARCH_STAGE,
            {
                "status": "failed",
                "reason": error.reason,
                "unusable_response": error.raw[:40000],
            },
        )
        raise

    verdict = assess_coverage(work_order, evidence)
    _record(
        services,
        run_id,
        RESEARCH_STAGE,
        {
            **research_stage_record(evidence, notes),
            "coverage": verdict.as_record(),
            # Every rewrite, in order. A question the article rests on that was
            # asked three ways before it answered is worth seeing later.
            "reasked": [
                *(_stage_data(run_id, RESEARCH_STAGE).get("reasked") or []),
                note,
            ],
            STATE_KEY: json.loads(evidence.model_dump_json()),
        },
    )
    return verdict


def review_venues(run_id: str) -> list[dict[str, Any]]:
    """The places this run would send a reader, for a person to look at."""
    return venues_to_check(load_evidence(run_id))


def settle_venue(
    run_id: str,
    services: IntakeServices,
    *,
    claim_id: str,
    drop: bool = False,
    dismiss: bool = False,
    note: str | None = None,
) -> CoverageVerdict:
    """Record what the operator saw when they looked at a place.

    No model call. Dropping one can put the run back behind the gate, when the
    dropped place was a question's only support -- which is correct: an article
    must not rest on a claim its operator looked at and rejected. The screen
    says so before the click, rather than after it.

    Dismissing costs nothing by design: it is the move for a place that should
    never have been on the list, and it leaves the dossier exactly as it was.
    """
    work_order = load_work_order(run_id)
    evidence = load_evidence(run_id)
    notes = _stage_data(run_id, RESEARCH_STAGE).get("notes") or {}

    if drop:
        evidence = drop_venue(evidence, claim_id=claim_id)
    elif dismiss:
        evidence = dismiss_venue(evidence, claim_id=claim_id)
    else:
        evidence = note_venue(evidence, claim_id=claim_id, note=note or "")

    verdict = assess_coverage(work_order, evidence)
    _record(
        services,
        run_id,
        RESEARCH_STAGE,
        {
            **research_stage_record(evidence, notes),
            "coverage": verdict.as_record(),
            "operator_settled": _stage_data(run_id, RESEARCH_STAGE).get(
                "operator_settled"
            )
            or [],
            STATE_KEY: json.loads(evidence.model_dump_json()),
        },
    )
    return verdict


def blocking_questions(run_id: str) -> list[dict[str, Any]]:
    """The questions holding this run up, with what research did find.

    The screen needs the question itself, which lives on the work order, next
    to the gap, which lives on the evidence. Neither is much use alone.
    """
    work_order = load_work_order(run_id)
    evidence = load_evidence(run_id)
    verdict = assess_coverage(work_order, evidence)
    if verdict.can_write:
        return []

    questions = {
        item.requirement_id: item for item in work_order.requirements
    }
    found = {item.requirement_id: item for item in evidence.requirements}
    claims = {claim.claim_id: claim for claim in evidence.claims}

    blocking: list[dict[str, Any]] = []
    for requirement_id in verdict.unsupported_load_bearing:
        question = questions.get(requirement_id)
        record = found.get(requirement_id)
        blocking.append(
            {
                "requirement_id": requirement_id,
                "question": question.question if question else requirement_id,
                "kind": question.kind if question else "load_bearing",
                "status": record.status if record else "missing",
                "gap": record.gap if record else "",
                # Why research fell short, and what that implies. A run
                # recorded before causes existed says nothing here, and the
                # screen then shows what it always showed.
                "cause": record.cause if record else "unknown",
                "suggestion": suggested_move(
                    record.status if record else "missing",
                    record.cause if record else "unknown",
                ),
                # What it did find. A question is rarely a blank: run 76b36468
                # was stopped holding a name, a URL and two founders, missing
                # only a price nobody publishes.
                "found": [
                    claims[claim_id].text
                    for claim_id in (record.claim_ids if record else [])
                    if claim_id in claims
                ],
            }
        )
    return blocking


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


# What the graph's stage names mean to somebody watching. The run row already
# carries the current one; it was simply never shown, so a write looked dead
# for twenty minutes and then a finished article sat unseen for twenty more.
WRITING_STAGE_LABELS = {
    "queued": "Getting ready",
    "stage_v3_outline": "Planning the sections",
    "stage_v3_compose": "Writing the article",
    "stage_v3_groundedness": "Checking every claim against the research",
    "stage_v3_quality_audit": "Reading it back",
    "stage_v3_repair": "Fixing what the audit named",
    "stage_v3_quality_settle": "Settling on the best draft",
    "stage_v3_title": "Writing the headline",
    "stage_v3_finalize": "Finishing up",
    "complete": "Done",
}

# The same, for the stages the operator owns. A run begins at the seed
# (ADR 0031), so a run that never reached the graph is an ordinary run and has
# to be nameable in a list beside the ones that did.
INTAKE_STAGE_LABELS = {
    "queued": "Getting ready",
    GRILL_STAGE: "In the grill",
    BRIEF_STAGE: "Brief written",
    WORK_ORDER_STAGE: "Research planned",
    NOTES_STAGE: "Searching the web",
    RESEARCH_STAGE: "Research done",
}

RUN_STAGE_LABELS = {**INTAKE_STAGE_LABELS, **WRITING_STAGE_LABELS}


# The stages that mean the graph is running or has finished. Everything else on
# a run row -- every `stage_v4_*` intake stage, and `queued` -- belongs to the
# operator, not the writer.
#
# Derived from the topology rather than from the labels above, so a node added
# to the graph cannot be left out of this by forgetting to label it. The
# consequence of forgetting would be the page dropping back to the intake
# screens in the middle of a write, which is the same class of bug this set
# exists to fix.
GRAPH_STAGES = frozenset(V3_NODE_STAGE_NAMES.values()) | {"complete"}


def recent_runs(limit: int = 15) -> list[dict[str, Any]]:
    """The runs this operator could go back to, newest first.

    The page tracked exactly one run, in `localStorage`. Lose that pointer or
    start a second article and every earlier run became unreachable from the
    interface, even though all of it was on the server -- on 2026-08-31 the
    only way back to a live run was a `?run=<uuid>` URL produced by querying
    the database by hand.

    Every long step invites the operator to leave the page. That is only safe
    if leaving does not depend on one browser's memory surviving.

    Runs that never reached an article are listed too. A run is created when
    the seed is typed (ADR 0031), so one that stopped in the grill is an
    ordinary run rather than a failure to hide.

    The seed comes from the grill row rather than the run row, which is one
    extra read per run. Bounded by `limit` and local, and a run without a
    recognisable name is a list nobody can use.
    """
    rows = get_all_runs(FEATURE_NAME)[:max(0, limit)]
    runs: list[dict[str, Any]] = []
    for row in rows:
        run_id = _safe_str(_safe_dict(row).get("run_id"))
        if not run_id:
            continue
        stage = _safe_str(row.get("stage"))
        grill = _stage_data(run_id, GRILL_STAGE)
        runs.append(
            {
                "run_id": run_id,
                "seed": _safe_str(grill.get("seed")),
                "status": _safe_str(row.get("status")),
                "stage": stage,
                "stage_label": RUN_STAGE_LABELS.get(stage, stage),
                "updated_at": _safe_str(row.get("updated_at")),
            }
        )
    return runs


def writing_state(run_id: str) -> dict[str, Any] | None:
    """What the writer is doing, or what it produced.

    Everything here was already on the run and none of it was ever sent to the
    page. `stage` is the live one from the run row, so this answers "is it
    working" while the graph runs, and "what did it make" once it stops.
    """
    status = _safe_dict(read_status(run_id))
    if not status:
        return None
    state = _safe_str(status.get("state"))
    stage = _safe_str(status.get("stage"))
    # A run is only writing once the graph owns it, and the test has to be a
    # whitelist. Intake records its own stages on the same run row -- the run
    # is created at the seed (ADR 0031) -- so excluding only "queued" let
    # `stage_v4_grill` through, and run 76b36468 answered its first grill
    # question behind a screen saying the article was being written.
    if stage not in GRAPH_STAGES:
        return None

    finalize = _stage_data(run_id, "stage_v3_finalize")
    return {
        "state": state,
        "stage": stage,
        "stage_label": WRITING_STAGE_LABELS.get(stage, stage),
        "error": _safe_str(status.get("error")) or None,
        "updated_at": _safe_str(status.get("updated_at")),
        "final_title": _safe_str(finalize.get("final_title")) or None,
        "word_count": finalize.get("word_count_estimate"),
        "pipeline_status": _safe_str(finalize.get("pipeline_status")) or None,
        "readiness_blockers": finalize.get("readiness_blockers") or [],
        "constraint_checks": _safe_dict(finalize.get("constraint_checks")),
    }


def finished_article(run_id: str) -> dict[str, Any]:
    """The article the run produced, for reading.

    Its own call rather than part of `intake_state`, because the state is
    polled every few seconds while the graph runs and the article payload is
    several hundred kilobytes. Fetched once, when there is something to read.
    """
    payload = _stage_data(run_id, "pipeline_v3")
    if not payload:
        raise LookupError(f"No article written for run {run_id}.")
    article = _safe_dict(payload.get("improved_article"))
    finalize = _stage_data(run_id, "stage_v4_finalize") or _stage_data(
        run_id, "stage_v3_finalize"
    )
    return {
        "run_id": run_id,
        "title": _safe_str(finalize.get("final_title")) or _safe_str(article.get("title")),
        # The editorial shape, in the words staging labels drafts with. Sent
        # so the finished article can be handed to the editor without the
        # operator retyping what the brief already settled.
        "form_label": _safe_str(_safe_dict(payload.get("form")).get("label")),
        "markdown": _safe_str(payload.get("final_markdown"))
        or _safe_str(article.get("content")),
        "pipeline_status": _safe_str(finalize.get("pipeline_status")) or None,
        "readiness_blockers": finalize.get("readiness_blockers") or [],
        "constraint_checks": _safe_dict(finalize.get("constraint_checks")),
        "word_count": finalize.get("word_count_estimate"),
    }


def polish_prompt(run_id: str) -> dict[str, Any]:
    """The prompt the operator carries to a flagship model, with the article.

    Assembled from what the run already recorded about its own output. It is
    generated and never hand edited: operator influence belongs in a control
    with its own validated field, or nothing downstream can say what was
    actually asked for.
    """
    article = finished_article(run_id)
    quality = _stage_data(run_id, "stage_v3_quality_audit")
    audit_problems = [
        _safe_str(item)
        for item in (quality.get("required_revisions") or [])
        if _safe_str(item)
    ]
    return {
        "run_id": run_id,
        "prompt": build_polish_prompt(
            brief=load_brief(run_id),
            article_markdown=article["markdown"],
            title=article["title"],
            constraint_checks=article["constraint_checks"],
            readiness_blockers=article["readiness_blockers"],
            audit_problems=audit_problems,
        ),
    }


def punch_list(run_id: str, services: IntakeServices) -> dict[str, Any]:
    """What a person should fix by hand, computed once and kept.

    Read from the run after the first time, because it is a model call over a
    finished article and the answer cannot change: nothing downstream of
    `finalize` edits the piece. Re-deriving it on every page load would charge
    the run again for the same paragraph.

    Not a stage in the graph. The article is written, stamped and stored before
    this is asked for, so a failure here loses the notes and not the piece --
    which is the whole reason it is allowed to run at all (ADR 0030 keeps the
    one gate before writing, and nothing blocks after it).
    """
    stored = _stage_data(run_id, PUNCH_LIST_STAGE)
    if stored.get("items") is not None:
        return {"run_id": run_id, **{k: v for k, v in stored.items() if k != STATE_KEY}}

    article = finished_article(run_id)
    result = build_punch_list(
        brief=load_brief(run_id),
        title=article["title"],
        article_markdown=article["markdown"],
        evidence=load_evidence(run_id),
        llm=services.dependencies.llm,
        model_name=services.dependencies.model_name,
    )
    _record(services, run_id, PUNCH_LIST_STAGE, result)
    return {"run_id": run_id, **result}


def _research_view(run_id: str, research: dict[str, Any]) -> dict[str, Any]:
    """The research row as the page needs it, findings included.

    Derived from the stored evidence when the row predates the findings field,
    rather than asking the operator to re-run a pass they already paid ten web
    searches for. The evidence itself has been on the run the whole time; only
    the summary written beside it was thinner.
    """
    view = {key: value for key, value in research.items() if key != STATE_KEY}
    if not view or view.get("findings"):
        return view
    stored = research.get(STATE_KEY)
    if not isinstance(stored, dict):
        return view
    try:
        evidence = EvidencePackage.model_validate(stored)
    except ValidationError:
        # An older dossier that no longer fits the contract still deserves to
        # show its statuses rather than an empty screen.
        return view
    view["findings"] = research_stage_record(evidence, {})["findings"]
    return view


def intake_state(run_id: str) -> dict[str, Any]:
    """Where this run stands, for a page that may have been reloaded."""
    grill = _stage_data(run_id, GRILL_STAGE)
    brief = _stage_data(run_id, BRIEF_STAGE)
    work_order = _stage_data(run_id, WORK_ORDER_STAGE)
    research = _stage_data(run_id, RESEARCH_STAGE)
    grill_state = _safe_dict(grill.get(STATE_KEY))
    # A failed brief leaves a row saying so. It is evidence, not progress, so
    # the page stays on the grill with the agreement intact and one more
    # approve to try.
    if _safe_str(brief.get("status")) == "failed":
        brief = {}
    if _safe_str(work_order.get("status")) == "failed":
        work_order = {}
    if _safe_str(research.get("status")) == "failed":
        research = {}
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
            # What the brief still needs. The grill stops when this is empty
            # (ADR 0033), so it is also the honest answer to "how far along am
            # I" -- which a question count never was.
            "markers_covered": grill.get("markers_covered") or [],
            "markers_missing": grill.get("markers_missing") or [],
        }
        if grill
        else None,
        "brief": {key: value for key, value in brief.items() if key != STATE_KEY} or None,
        "work_order": {
            key: value for key, value in work_order.items() if key != STATE_KEY
        }
        or None,
        "research": _research_view(run_id, research) or None,
        # Written as the searches go, so five to ten silent minutes can say
        # which question it is on.
        "research_progress": _stage_data(run_id, PROGRESS_STAGE) or None,
        "writing": writing_state(run_id),
    }
