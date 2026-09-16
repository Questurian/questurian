"""One day's workflow, from a handed-over setup to a saved proposal.

This module is the only place that knows the order of the steps. The pieces
either side of it are deliberately ignorant of each other: the grill does not
know about exports, the validator does not know about the store, and the store
does not know what a day means. That is what makes each of them testable
without a network and without a database.

The state an operator sees is DERIVED here, from the artifacts, every time it
is asked for. There is no `status` column.

Since ADR 0045 the day ends in a proposal -- places, one reason each -- which
the editor keeps, swaps or asks to revise. Days saved in the older article
format stay readable as previous versions; nothing new is built from them.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from app.core import database

from ..prompt2blog.contracts_v4 import GrillState
from . import store
from .approval import claims_approval, layout_signature
from .context import (
    context_key,
    day_brief,
    day_date_label,
    stay_context,
    stay_wanted,
    window_label,
)
from .contracts import (
    DayPromptExport,
    DirectionRevision,
    DaySummary,
    SetupSnapshot,
    StoredResult,
    ValidationReport,
    stable_hash,
)
from . import direction as direction_module
from . import grill as grill_module
from .prompt_export import _context_summary, build_export, build_repair_prompt
from . import research as research_module
from .selection_contract import DaySelection, SelectionPick
from .validation import (
    PasteRejected,
    check_structure,
    completeness_of,
    map_search_url,
    parse_paste,
    validate_answer,
)

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Stale(ValueError):
    """The thing you are acting on no longer describes this day."""


# --------------------------------------------------------------- workspace --


def handoff(*, setup: SetupSnapshot, owner_id: str) -> tuple[str, int]:
    """Take ownership of a setup the browser has been holding.

    Idempotent on the draft, so a double-tapped Start Grill and a reload two
    minutes later reach the same workspace rather than splitting one trip in
    half. Approvals are recorded here, against the server's own signature.
    """
    workspace_id, revision = store.create_workspace(
        draft_id=setup.draft_id, owner_id=owner_id, setup=setup
    )
    existing = store.load_workspace(workspace_id)
    if existing is not None:
        stored_setup, revision, _owner = existing
        _record_approvals(workspace_id, stored_setup)
        return workspace_id, revision
    _record_approvals(workspace_id, setup)
    return workspace_id, revision


def _record_approvals(workspace_id: str, setup: SetupSnapshot) -> None:
    store.record_approvals(
        workspace_id,
        {
            day.id: (
                f"{day.trip_revision}\n{day.layout_revision}",
                layout_signature(setup, day),
            )
            for day in setup.days
            if claims_approval(day)
        },
    )


def update_setup(
    workspace_id: str, setup: SetupSnapshot, *, expected_revision: int | None
) -> int:
    revision = store.update_setup(
        workspace_id, setup, expected_revision=expected_revision
    )
    _record_approvals(workspace_id, setup)
    return revision


def require_workspace(workspace_id: str, owner_id: str) -> tuple[SetupSnapshot, int]:
    found = store.load_workspace(workspace_id)
    if found is None:
        raise LookupError(f"No itinerary workspace {workspace_id}")
    setup, revision, owner = found
    # Ownership is enforced only when both sides have an identity. With staff
    # auth off -- the local default -- there is no caller to compare against.
    if owner and owner_id and owner != owner_id:
        raise store.NotOwned("This itinerary workspace belongs to someone else.")
    return setup, revision


# ------------------------------------------------------- assembling a day --


def _accepted_direction(workspace_id: str, day_id: str) -> DirectionRevision | None:
    accepted = [
        revision
        for revision in store.list_directions(workspace_id, day_id)
        if revision.status == "accepted"
    ]
    return accepted[-1] if accepted else None


def _candidate_direction(workspace_id: str, day_id: str) -> DirectionRevision | None:
    revisions = store.list_directions(workspace_id, day_id)
    if not revisions:
        return None
    newest = revisions[-1]
    return newest if newest.status == "candidate" else None


def _results_by_day(workspace_id: str, setup: SetupSnapshot) -> dict[str, StoredResult]:
    """Each day's newest saved PROPOSAL.

    A day saved only in the older article format has no proposal: its places
    were chosen under the old assignment, and the new one does not build on it.
    """
    found: dict[str, StoredResult] = {}
    for day in setup.days:
        latest = latest_proposal(workspace_id, day.id)
        if latest is not None:
            found[day.id] = latest
    return found


def latest_proposal(workspace_id: str, day_id: str) -> StoredResult | None:
    proposals = [stored for stored in store.load_results(workspace_id, day_id) if stored.is_selection]
    return proposals[-1] if proposals else None


def _directions_by_day(workspace_id: str, setup: SetupSnapshot) -> dict[str, Any]:
    found: dict[str, Any] = {}
    for day in setup.days:
        accepted = _accepted_direction(workspace_id, day.id)
        if accepted is not None:
            found[day.id] = accepted.direction
    return found


def current_context_key(workspace_id: str, setup: SetupSnapshot, day_id: str) -> str:
    """What a selection depends on: the day, the other days' places, the stay
    and the accepted summary."""
    accepted = _accepted_direction(workspace_id, day_id)
    return context_key(
        setup,
        day_id,
        _results_by_day(workspace_id, setup),
        accepted.direction if accepted else None,
        include_stay=True,
    )


def conversation_key(workspace_id: str, setup: SetupSnapshot, day_id: str) -> str:
    """What the INTERVIEW depends on: the same minus the summary and the stay.

    The summary is written from the conversation, and the hotel does not change
    what a day is for. Including either would tell the operator their
    conversation was out of date when it is not.
    """
    return context_key(setup, day_id, _results_by_day(workspace_id, setup), None)


def brief_for(workspace_id: str, setup: SetupSnapshot, day_id: str) -> str:
    return day_brief(
        setup,
        day_id,
        _results_by_day(workspace_id, setup),
        _directions_by_day(workspace_id, setup),
    )


def approval_current(workspace_id: str, setup: SetupSnapshot, day_id: str) -> bool:
    day = setup.day(day_id)
    if day is None:
        return False
    stored = store.approved_signatures(workspace_id).get(day_id)
    return bool(stored) and stored == layout_signature(setup, day)


def seed_for(setup: SetupSnapshot, day_id: str) -> str:
    """The one line the interview opens on."""
    day = setup.day(day_id)
    if day is None:
        raise LookupError(f"No day {day_id}")
    number = setup.day_number(day_id)
    date = day_date_label(setup.trip, number - 1)
    city = setup.trip.base_city.strip() or "this trip"
    label = day.label.strip()
    named = f" ({label})" if label and label != f"Day {number}" else ""
    return (
        f"Day {number} of {len(setup.days)} in {city}{named}"
        + (f", {date}" if date else "")
        + f" — {day.source_template_name or 'custom layout'}, "
        + f"{len(day.slots)} stops, {window_label(day)}."
    )


def _day_labels(setup: SetupSnapshot) -> dict[str, str]:
    return {
        day.id: f"Day {index}" + (f" ({day.label.strip()})" if day.label.strip() and day.label.strip() != f"Day {index}" else "")
        for index, day in enumerate(setup.days, start=1)
    }


def _other_day_places(
    setup: SetupSnapshot, day_id: str, results: dict[str, StoredResult]
) -> dict[str, list[str]]:
    labels = _day_labels(setup)
    return {
        labels[other_id]: stored.chosen_names()
        for other_id, stored in results.items()
        if other_id != day_id and other_id in labels
    }


# ------------------------------------------------------------------- grill --


def _with_attempt(
    *, attempt_key: str, workspace_id: str, day_id: str, kind: str, job_id: str, work
):
    """Reserve, run, record. The reservation is what makes a retry safe.

    A key that has been used returns what that attempt became instead of buying
    a second call. A key that is new is written as pending BEFORE dispatch, so
    a process that dies mid-call leaves evidence that a provider may have been
    paid -- which is the one thing a screen must not hide behind a fresh Start
    button.
    """
    reserved, existing = store.reserve_attempt(
        attempt_key=attempt_key,
        workspace_id=workspace_id,
        day_id=day_id,
        kind=kind,
        job_id=job_id,
    )
    if not reserved:
        raise DuplicateAttempt(existing.get("state", "pending"))
    try:
        outcome = work()
    except Exception as error:
        store.finish_attempt(attempt_key, state="failed", detail=repr(error))
        raise
    store.finish_attempt(attempt_key, state="completed")
    return outcome


class DuplicateAttempt(RuntimeError):
    """This exact request was already dispatched."""

    def __init__(self, state: str) -> None:
        super().__init__(
            "That request was already sent."
            if state == "pending"
            else "That request has already been handled."
        )
        self.state = state


def start_grill(
    *, workspace_id: str, setup: SetupSnapshot, day_id: str, attempt_key: str, llm
) -> GrillState:
    if not approval_current(workspace_id, setup, day_id):
        raise Stale(
            "This day's layout is not approved as it currently stands. Review "
            "and approve it before starting the interview."
        )
    brief = brief_for(workspace_id, setup, day_id)
    key = conversation_key(workspace_id, setup, day_id)

    def work() -> GrillState:
        # Inside the reservation, not before it. A double-tapped Start would
        # otherwise reach this line the second time, find the interview the
        # first click created, and be reported as "this day already has an
        # interview" -- which is true and is not what happened.
        if store.load_day_work(workspace_id, day_id)["grill"] is not None:
            raise ValueError("This day already has an interview. Open it instead.")
        state = grill_module.start(
            run_id=uuid.uuid4().hex[:12],
            seed=seed_for(setup, day_id),
            brief=brief,
            llm=llm,
        )
        store.save_grill(workspace_id, day_id, state, key)
        return state

    return _with_attempt(
        attempt_key=attempt_key,
        workspace_id=workspace_id,
        day_id=day_id,
        kind="grill_start",
        job_id=grill_module.ITINERARY_GRILL_JOB,
        work=work,
    )


def answer_grill(
    *,
    workspace_id: str,
    setup: SetupSnapshot,
    day_id: str,
    answer: str,
    attempt_key: str,
    llm,
) -> GrillState:
    work_row = store.load_day_work(workspace_id, day_id)
    state = work_row["grill"]
    if state is None:
        raise LookupError("This day has no interview yet.")
    brief = brief_for(workspace_id, setup, day_id)
    key = conversation_key(workspace_id, setup, day_id)

    def work() -> GrillState:
        advanced = grill_module.answer(state, answer, brief=brief, llm=llm)
        store.save_grill(workspace_id, day_id, advanced, key)
        return advanced

    return _with_attempt(
        attempt_key=attempt_key,
        workspace_id=workspace_id,
        day_id=day_id,
        kind="grill_answer",
        job_id=grill_module.ITINERARY_GRILL_JOB,
        work=work,
    )


def reopen_grill(
    *, workspace_id: str, setup: SetupSnapshot, day_id: str, attempt_key: str, llm
) -> GrillState:
    state = store.load_day_work(workspace_id, day_id)["grill"]
    if state is None:
        raise LookupError("This day has no interview yet.")
    brief = brief_for(workspace_id, setup, day_id)
    key = conversation_key(workspace_id, setup, day_id)

    def work() -> GrillState:
        reopened = grill_module.reopen(state, brief=brief, llm=llm)
        store.save_grill(workspace_id, day_id, reopened, key)
        return reopened

    return _with_attempt(
        attempt_key=attempt_key,
        workspace_id=workspace_id,
        day_id=day_id,
        kind="grill_reopen",
        job_id=grill_module.ITINERARY_GRILL_JOB,
        work=work,
    )


# --------------------------------------------------------------- direction --


def prepare_direction(
    *, workspace_id: str, setup: SetupSnapshot, day_id: str, attempt_key: str, llm
) -> DirectionRevision:
    """Write the agreed conversation down as a short summary.

    Also the way an older, long direction is replaced: the conversation it was
    extracted from is intact, so the summary is one call away.
    """
    day = setup.day(day_id)
    if day is None:
        raise LookupError(f"No day {day_id}")
    state = store.load_day_work(workspace_id, day_id)["grill"]
    if state is None or state.status != "agreed":
        raise ValueError("This day's interview has not agreed anything yet.")
    brief = brief_for(workspace_id, setup, day_id)
    key = conversation_key(workspace_id, setup, day_id)

    def work() -> DirectionRevision:
        extracted = direction_module.extract(
            state=state, brief=brief, day=day, llm=llm
        )
        revision = DirectionRevision(
            revision=store.next_direction_revision(workspace_id, day_id),
            status="candidate",
            direction=extracted,
            context_key=key,
            created_at=_now(),
        )
        store.save_direction(workspace_id, day_id, revision)
        return revision

    return _with_attempt(
        attempt_key=attempt_key,
        workspace_id=workspace_id,
        day_id=day_id,
        kind="direction",
        job_id=direction_module.DIRECTION_JOB,
        work=work,
    )


def accept_direction(
    *, workspace_id: str, setup: SetupSnapshot, day_id: str, revision: int
) -> DirectionRevision:
    """Accept the candidate that was on screen, by number.

    Checked against the context it was extracted from: a candidate written
    against a day that has since changed describes the old day.
    """
    candidates = {
        found.revision: found for found in store.list_directions(workspace_id, day_id)
    }
    found = candidates.get(revision)
    if found is None:
        raise LookupError("That summary revision does not exist.")
    if found.status == "accepted":
        return found
    live = conversation_key(workspace_id, setup, day_id)
    if found.context_key and found.context_key != live:
        raise Stale(
            "This day changed while that summary was on screen. Read it again "
            "before accepting it."
        )
    return store.accept_direction(workspace_id, day_id, revision)


# ------------------------------------------------------------------ export --


def _summary_for(workspace_id: str, day_id: str) -> DirectionRevision:
    accepted = _accepted_direction(workspace_id, day_id)
    if accepted is None:
        raise ValueError("This day has no accepted summary to choose places from.")
    if not accepted.is_summary:
        raise Stale(
            "This day's agreement was written in the older, longer format. Write "
            "the short summary from the same conversation first."
        )
    return accepted


def prepare_export(
    *,
    workspace_id: str,
    setup: SetupSnapshot,
    workspace_revision: int,
    day_id: str,
    base_revision: int | None = None,
    change_request: str = "",
    change_slot_id: str = "",
) -> DayPromptExport:
    """Build the copyable prompt. Free, deterministic, and reused when unchanged.

    With `base_revision`, the prompt asks for a changed version of that saved
    proposal. Copying twice for an unchanged request returns the same export id
    rather than minting a second one.
    """
    accepted = _summary_for(workspace_id, day_id)
    if not approval_current(workspace_id, setup, day_id):
        raise Stale(
            "This day's layout is not approved as it currently stands. Review it "
            "before building a prompt."
        )
    base = None
    if base_revision is not None:
        base = next(
            (
                stored
                for stored in store.load_results(workspace_id, day_id)
                if stored.result_revision == base_revision
            ),
            None,
        )
        if base is None or not base.is_selection:
            raise LookupError("That proposal version does not exist.")
        if not change_request.strip():
            raise ValueError("Say what should change.")
    day = setup.day(day_id)
    if change_slot_id and (day is None or change_slot_id not in {slot.id for slot in day.slots}):
        raise LookupError("That stop is not on this day.")
    key = current_context_key(workspace_id, setup, day_id)
    results = _results_by_day(workspace_id, setup)

    def assemble(export_id: str | None) -> DayPromptExport:
        return build_export(
            workspace_id=workspace_id,
            workspace_revision=workspace_revision,
            setup=setup,
            day_id=day_id,
            summary=accepted.direction,
            direction_revision=accepted.revision,
            context_key=key,
            results=results,
            directions=_directions_by_day(workspace_id, setup),
            export_id=export_id,
            base=base,
            change_request=change_request,
            change_slot_id=change_slot_id,
        )

    candidate = assemble(None)
    existing = store.find_export_by_hash(workspace_id, day_id, candidate.input_hash)
    if existing is None:
        store.save_export(candidate)
        return candidate
    # The identity is unchanged, so the export that exists is the one that
    # answers. Reassembled under its own id (the id is baked into the text and
    # the schema), and saved again so it is the day's current request.
    reused = assemble(existing.export_id).model_copy(
        update={"created_at": existing.created_at}
    )
    store.save_export(reused)
    return reused


def current_export(workspace_id: str, day_id: str) -> DayPromptExport | None:
    """The day's current request in the proposal format, if it has one.

    An export from the article-shaped versions is history: it is never the
    request a new answer is checked against.
    """
    exports = [export for export in store.list_exports(workspace_id, day_id) if export.is_selection]
    return exports[-1] if exports else None


def export_answered_by(
    workspace_id: str, day_id: str, raw: str
) -> DayPromptExport | None:
    """The export an answer says it is answering.

    Read from the answer rather than assumed to be the newest, because a day
    can have more than one outstanding prompt. Falls back to the newest when
    the answer names nothing usable.
    """
    try:
        payload, _notes = parse_paste(raw)
    except PasteRejected:
        return current_export(workspace_id, day_id)
    named = payload.get("exportId")
    if isinstance(named, str) and named:
        found = store.load_export(named)
        if (
            found is not None
            and found.workspace_id == workspace_id
            and found.day_id == day_id
        ):
            return found
    return current_export(workspace_id, day_id)


def _context_changes(
    export: DayPromptExport, setup: SetupSnapshot, day_id: str, workspace_id: str
) -> list[str]:
    """What moved since a request was built, in words.

    Compared field by field against what the request recorded. When the
    fingerprint moved and none of these did, the summary or the notes did.
    """
    before = export.context_summary or {}
    now = _context_summary(setup, day_id, _results_by_day(workspace_id, setup))
    labels = _day_labels(setup)
    changes: list[str] = []
    if before.get("stay") != now["stay"]:
        changes.append("The stay changed: " + " ".join(now["stay"]))
    if before.get("stops") != now["stops"] or before.get("window") != now["window"]:
        changes.append("This day's stops or time window changed.")
    old_days = before.get("other_days") or {}
    for other_id, places in now["other_days"].items():
        if sorted(old_days.get(other_id, [])) != places:
            changes.append(f"{labels.get(other_id, 'Another day')} now uses different places.")
    accepted = _accepted_direction(workspace_id, day_id)
    if accepted is not None and accepted.revision != export.direction_revision:
        changes.append("A newer summary was accepted.")
    if not changes:
        changes.append("The trip details or this day's notes changed.")
    return changes


# ---------------------------------------------------------------- research --


def start_research(
    *, workspace_id: str, setup: SetupSnapshot, day_id: str, attempt_key: str
) -> DayPromptExport:
    """Claim the right to run this day's selection, synchronously, before dispatch.

    Separate from `run_research` so the route can return the moment the claim
    is written; the call itself is minutes of searching.
    """
    export = current_export(workspace_id, day_id)
    if export is None:
        raise ValueError("This day has no prompt yet. Build one first.")
    if export.context_key != current_context_key(workspace_id, setup, day_id):
        raise Stale(
            "This day changed since its prompt was built. Build it again before "
            "choosing places, or the answer will not fit the day."
        )
    reserved, existing = store.reserve_attempt(
        attempt_key=attempt_key,
        workspace_id=workspace_id,
        day_id=day_id,
        kind="research",
        job_id=research_module.RESEARCH_JOB,
    )
    if not reserved:
        raise DuplicateAttempt(existing.get("state", "pending"))
    store.start_research_run(
        attempt_key=attempt_key,
        workspace_id=workspace_id,
        day_id=day_id,
        export_id=export.export_id,
    )
    sent = research_module.sent_sizes(export)
    store.record_research_dispatch(
        attempt_key=attempt_key,
        wire_version=export.schema_version,
        prompt_policy=export.prompt_policy,
        sent=sent,
        sent_hash=stable_hash(
            {
                "system": research_module.system_prompt_for(export) or "",
                "prompt": research_module.build_prompt(export),
                "schema": research_module.schema_for_call(export),
            }
        ),
        budget=export.research_budget,
    )
    return export


def request_revision(
    *,
    workspace_id: str,
    setup: SetupSnapshot,
    workspace_revision: int,
    day_id: str,
    base_revision: int,
    change_request: str,
    change_slot_id: str,
    attempt_key: str,
) -> DayPromptExport:
    """Ask for a changed proposal: build that request, then claim the run.

    What comes back is previewed and saved like any answer; the proposal on
    screen is untouched until then.
    """
    prepare_export(
        workspace_id=workspace_id,
        setup=setup,
        workspace_revision=workspace_revision,
        day_id=day_id,
        base_revision=base_revision,
        change_request=change_request,
        change_slot_id=change_slot_id,
    )
    return start_research(
        workspace_id=workspace_id, setup=setup, day_id=day_id, attempt_key=attempt_key
    )


def _audit_path(attempt_key: str):
    """Where this app keeps a run's transcript. Local, and never committed."""
    return database.DATA_DIR / "itinerary-research-audit" / f"{attempt_key}.jsonl"


def run_research(
    *, attempt_key: str, export: DayPromptExport, model_name: str, call
) -> None:
    """The research itself, off the request.

    Every failure is contained and written down. An exception escaping a
    background task leaves the day reporting "researching" forever, which is
    the one state an operator cannot get out of.
    """
    try:
        outcome = research_module.run_research(
            export=export, model_name=model_name, call=call
        )
    except research_module.ResearchUnavailable as error:
        store.finish_research_run(
            attempt_key, state="failed", detail=str(error), fault=error.kind
        )
        store.record_research_outcome(attempt_key, completion=f"failed:{error.kind}")
        store.finish_attempt(attempt_key, state="failed", detail=str(error))
        return
    except Exception as error:  # noqa: BLE001
        logger.exception("Itinerary research crashed", extra={"day": export.day_id})
        store.finish_research_run(
            attempt_key,
            state="failed",
            detail=f"The research call failed: {type(error).__name__}",
            fault="invalid_response",
        )
        store.record_research_outcome(attempt_key, completion="failed:crashed")
        store.finish_attempt(attempt_key, state="failed", detail=repr(error))
        return
    kept: dict[str, Any] = {"transcript_path": "", "tool_counts": None}
    if outcome.get("session_id"):
        try:
            kept = research_module.keep_transcript(
                outcome["session_id"], _audit_path(attempt_key)
            )
        except Exception:  # noqa: BLE001 -- telemetry never fails a finished day
            logger.warning("Could not read the research transcript", exc_info=True)
    store.record_research_outcome(
        attempt_key,
        completion="done",
        returned=outcome.get("returned", ""),
        session_id=outcome.get("session_id", ""),
        usage=outcome.get("usage") or {},
        duration_ms=outcome.get("duration_ms"),
        tool_counts=kept.get("tool_counts"),
        transcript_path=kept.get("transcript_path", ""),
    )
    store.finish_research_run(
        attempt_key,
        state="done",
        raw=outcome["raw"],
        model=outcome["model"],
        cost_usd=outcome["cost_usd"],
        turns=outcome["turns"],
    )
    store.finish_attempt(attempt_key, state="completed")


# ------------------------------------------------------------------ import --


def _same_answer(left: str, right: str) -> bool:
    try:
        return stable_hash(parse_paste(left)[0]) == stable_hash(parse_paste(right)[0])
    except PasteRejected:
        return False


def _run_behind(workspace_id: str, day_id: str, export_id: str, raw: str) -> str | None:
    """The in-app run whose answer this text is, unedited, or None."""
    for run in store.research_runs_for_export(workspace_id, day_id, export_id):
        if run["raw"] and _same_answer(run["raw"], raw):
            return run["attempt_key"]
    return None


def _check(
    *, workspace_id: str, setup: SetupSnapshot, day_id: str, raw: str
) -> tuple[DayPromptExport, DaySelection | None, ValidationReport, str, str | None]:
    day = setup.day(day_id)
    if day is None:
        raise LookupError(f"No day {day_id}")
    export = export_answered_by(workspace_id, day_id, raw)
    if export is None:
        raise ValueError(
            "No prompt has been built for this day, so there is no request for "
            "this answer to be an answer to."
        )
    results = _results_by_day(workspace_id, setup)
    selection, report, content_hash = validate_answer(
        raw,
        export=export,
        day=day,
        workspace_id=workspace_id,
        day_id=day_id,
        current_context_key=current_context_key(workspace_id, setup, day_id),
        stay_id=stay_wanted(stay_context(setup, day_id, results)),
        other_days=_other_day_places(setup, day_id, results),
    )
    return export, selection, report, content_hash, _run_behind(
        workspace_id, day_id, export.export_id, raw
    )


def preview_import(
    *, workspace_id: str, setup: SetupSnapshot, day_id: str, raw: str
) -> dict[str, Any]:
    export, selection, report, content_hash, attempt = _check(
        workspace_id=workspace_id, setup=setup, day_id=day_id, raw=raw
    )
    return {
        "valid": report.valid,
        "report": report,
        "selection": selection,
        "content_hash": content_hash,
        "export_id": export.export_id,
        "changes": _changes_against(latest_proposal(workspace_id, day_id), selection, setup, day_id),
        "from_research_run": attempt is not None,
        "repair_prompt": (
            None
            if report.valid
            else build_repair_prompt(
                export=export,
                returned=raw,
                issues=[issue.message for issue in report.errors][:20],
            )
        ),
    }


def _changes_against(
    previous: StoredResult | None,
    incoming: DaySelection | None,
    setup: SetupSnapshot,
    day_id: str,
) -> list[str]:
    """What saving this would change about the proposal already saved."""
    if incoming is None or previous is None:
        return []
    day = setup.day(day_id)
    labels = {slot.id: (slot.label or slot.id) for slot in (day.slots if day else [])}
    before = {pick.slot_id: pick for pick in previous.selection.picks}
    lines: list[str] = []
    for pick in incoming.picks:
        was = before.get(pick.slot_id)
        label = labels.get(pick.slot_id, pick.slot_id)
        if was is None:
            continue
        if (was.name or "") != (pick.name or "") or was.status != pick.status:
            lines.append(
                f"{label}: {was.name or was.status.replace('_', ' ')} → "
                f"{pick.name or pick.status.replace('_', ' ')}"
            )
    old_stay = previous.selection.stay.name if previous.selection.stay else ""
    new_stay = incoming.stay.name if incoming.stay else ""
    if old_stay != new_stay and (old_stay or new_stay):
        lines.append(f"Stay: {old_stay or 'none'} → {new_stay or 'none'}")
    if not lines:
        lines.append("The same places; only the wording differs.")
    return lines


def apply_import(
    *,
    workspace_id: str,
    setup: SetupSnapshot,
    day_id: str,
    raw: str,
    expected_content_hash: str,
    import_key: str,
) -> tuple[StoredResult, bool]:
    """Save a previewed proposal, atomically, against the state it was previewed on.

    Everything is re-read and re-checked here rather than trusted from the
    preview: between the two, the day can have moved.
    """
    export, selection, report, content_hash, attempt = _check(
        workspace_id=workspace_id, setup=setup, day_id=day_id, raw=raw
    )
    if selection is None or not report.valid:
        raise ValueError(
            "This answer cannot be saved: it did not pass the checks. Check it "
            "again to see why."
        )
    if expected_content_hash and expected_content_hash != content_hash:
        raise Stale(
            "The answer changed since it was checked. Check it again before saving."
        )

    def build(revision: int) -> StoredResult:
        return StoredResult(
            result_revision=revision,
            export_id=export.export_id,
            content_hash=content_hash,
            selection=selection,
            report=report,
            saved_at=_now(),
        )

    stored, created = store.apply_result(
        workspace_id=workspace_id,
        day_id=day_id,
        import_key=import_key,
        content_hash=content_hash,
        export_id=export.export_id,
        raw_paste=raw,
        build=build,
    )
    if created and attempt is not None:
        store.link_research_result(attempt, stored.result_revision)
    return stored, created


# -------------------------------------------------------------------- swap --


def swap_pick(
    *,
    workspace_id: str,
    setup: SetupSnapshot,
    day_id: str,
    slot_id: str,
    name: str,
    area: str,
    reason: str,
    expected_revision: int,
    swap_key: str,
) -> tuple[StoredResult, bool]:
    """Put the editor's own place in one stop, as a new version.

    Free: no model is asked. The journeys that touch the stop lose their
    estimate, because one end moved; any question about the stop is settled by
    the editor's choice. Every other pick is kept exactly.
    """
    day = setup.day(day_id)
    if day is None:
        raise LookupError(f"No day {day_id}")
    slot = next((slot for slot in day.slots if slot.id == slot_id), None)
    if slot is None:
        raise LookupError("That stop is not on this day.")
    if not name.strip():
        raise ValueError("Name the place to put here.")
    base = latest_proposal(workspace_id, day_id)
    if base is None:
        raise ValueError("This day has no proposal to change.")
    if base.result_revision != expected_revision:
        raise store.RevisionConflict(
            "This proposal changed while you were editing it. Read it again.",
            base.result_revision,
        )
    selection: DaySelection = base.selection
    picks: list[SelectionPick] = []
    for pick in selection.picks:
        if pick.slot_id != slot_id:
            picks.append(pick)
            continue
        picks.append(
            SelectionPick(
                slot_id=slot_id,
                status="selected",
                name=name.strip()[:300],
                category=(slot.allowed_categories[0] if len(slot.allowed_categories) == 1 else pick.category),
                area=area.strip()[:300] or None,
                address=None,
                reason=reason.strip()[:600] or "Chosen by the editor.",
                note="",
                sources=[],
                maps_url=map_search_url(name, area) if slot.kind in {"place", "experience"} else None,
                chosen_by="editor",
            )
        )
    journeys = [
        leg.model_copy(update={"minutes": None, "note": "Not estimated: the place changed."})
        if slot_id in (leg.from_ref, leg.to_ref)
        else leg
        for leg in selection.journeys
    ]
    questions = [question for question in selection.questions if question.slot_id != slot_id]
    changed = selection.model_copy(
        update={"picks": picks, "journeys": journeys, "questions": questions}
    )
    export = store.load_export(base.export_id)
    results = _results_by_day(workspace_id, setup)
    issues = []
    completeness = base.report.completeness
    if export is not None:
        issues = check_structure(
            changed,
            export=export,
            day=day,
            other_days=_other_day_places(setup, day_id, results),
        )
        completeness = completeness_of(changed, export=export, day=day)
    report = ValidationReport(
        valid=not any(issue.severity == "error" for issue in issues),
        issues=issues,
        completeness=completeness,
    )
    content_hash = stable_hash(changed.model_dump(by_alias=True))
    raw = json.dumps(changed.model_dump(by_alias=True), ensure_ascii=False)

    def build(revision: int) -> StoredResult:
        return StoredResult(
            result_revision=revision,
            export_id=base.export_id,
            content_hash=content_hash,
            selection=changed,
            report=report,
            saved_at=_now(),
            origin="editor_swap",
        )

    return store.apply_result(
        workspace_id=workspace_id,
        day_id=day_id,
        import_key=swap_key,
        content_hash=content_hash,
        export_id=base.export_id,
        raw_paste=raw,
        build=build,
        expected_revision=expected_revision,
    )


# -------------------------------------------------------------- the views --


def _grill_view(state: GrillState | None) -> dict[str, Any] | None:
    if state is None:
        return None
    return {
        "run_id": state.run_id,
        "seed": state.seed,
        "status": state.status,
        "consensus": state.consensus,
        "markers_covered": list(state.markers_covered),
        "markers_missing": [
            key for key in state.marker_keys if key not in state.markers_covered
        ],
        "turns": [
            {
                "question_id": turn.question.question_id,
                "ask": turn.question.ask,
                "pushback": turn.question.pushback,
                "answer": turn.answer,
                "accepted_as_drafted": turn.accepted_as_drafted,
            }
            for turn in state.turns
        ],
        "pending": None
        if state.pending is None
        else {
            "question_id": state.pending.question_id,
            "ask": state.pending.ask,
            "recommendation": state.pending.recommendation,
            "pushback": state.pending.pushback,
        },
    }


def derive_state(
    *,
    approved: bool,
    grill: GrillState | None,
    candidate: DirectionRevision | None,
    accepted: DirectionRevision | None,
    export: DayPromptExport | None,
    export_stale: bool,
    proposal: StoredResult | None,
) -> str:
    """The one word the screen leads with, derived and never stored."""
    if not approved:
        return "layout_needs_review"
    if proposal is not None:
        return "proposal_ready" if proposal.complete else "proposal_open"
    if candidate is not None:
        return "direction_review"
    if accepted is not None and not accepted.is_summary:
        return "direction_outdated"
    if export is not None:
        return "context_changed" if export_stale else "prompt_ready"
    if accepted is not None:
        return "direction_accepted"
    if grill is None:
        return "ready_to_start"
    if grill.status == "agreed":
        return "agreed"
    return "grill_asking"


def _previous_view(stored: StoredResult) -> dict[str, Any]:
    """An article-shaped day, reduced to what someone would want to reread."""
    result = stored.result
    return {
        "revision": stored.result_revision,
        "saved_at": stored.saved_at,
        "title": result.title,
        "intro": result.day_intro,
        "stops": [
            {
                "slot_id": stop.slot_id,
                "status": stop.status,
                "name": stop.name,
                "copy": stop.reader_copy,
            }
            for stop in result.stops
        ],
    }


def _stay_view(setup: SetupSnapshot, day_id: str, workspace_id: str) -> dict[str, Any]:
    """This day's stay as the screen shows it: resolved from every saved
    proposal, this day's own included."""
    return stay_context(
        setup, day_id, _results_by_day(workspace_id, setup), exclude_own=False
    )


def day_view(
    *, workspace_id: str, setup: SetupSnapshot, workspace_revision: int, day_id: str
) -> dict[str, Any]:
    day = setup.day(day_id)
    if day is None:
        raise LookupError(f"No day {day_id}")
    work_row = store.load_day_work(workspace_id, day_id)
    grill = work_row["grill"]
    candidate = _candidate_direction(workspace_id, day_id)
    accepted = _accepted_direction(workspace_id, day_id)
    export = current_export(workspace_id, day_id)
    history = store.load_results(workspace_id, day_id)
    proposal = next((stored for stored in reversed(history) if stored.is_selection), None)
    previous = next((stored for stored in reversed(history) if not stored.is_selection), None)
    key = current_context_key(workspace_id, setup, day_id)
    talking = conversation_key(workspace_id, setup, day_id)
    approved = approval_current(workspace_id, setup, day_id)
    export_stale = export is not None and export.context_key != key

    proposal_export = store.load_export(proposal.export_id) if proposal is not None else None
    proposal_stale = bool(proposal_export is not None and proposal_export.context_key != key)
    number = setup.day_number(day_id)

    return {
        "workspace_id": workspace_id,
        "workspace_revision": workspace_revision,
        "day_id": day_id,
        "day_number": number,
        "day_label": day.label or f"Day {number}",
        "day_date": day_date_label(setup.trip, number - 1),
        "window": window_label(day),
        "slots": [
            {
                "id": slot.id,
                "label": slot.label,
                "kind": slot.kind,
                "daypart": slot.daypart,
                "optional": slot.optional,
                "categories": list(slot.allowed_categories),
                "purpose": slot.purpose,
            }
            for slot in day.slots
        ],
        "layout_approved": approved,
        "context_key": key,
        "state": derive_state(
            approved=approved,
            grill=grill,
            candidate=candidate,
            accepted=accepted,
            export=export,
            export_stale=export_stale,
            proposal=proposal,
        ),
        "grill": _grill_view(grill),
        "grill_context_changed": bool(
            grill is not None
            and work_row["context_key"]
            and work_row["context_key"] != talking
        ),
        "candidate_direction": None if candidate is None else candidate.model_dump(),
        "accepted_direction": None if accepted is None else accepted.model_dump(),
        "stay": _stay_view(setup, day_id, workspace_id),
        "export": None
        if export is None
        else {
            "export_id": export.export_id,
            "created_at": export.created_at,
            "direction_revision": export.direction_revision,
            "input_hash": export.input_hash,
            "prompt_text": export.prompt_text,
            "stale": export_stale,
            "changes": _context_changes(export, setup, day_id, workspace_id)
            if export_stale
            else [],
            "characters": len(export.prompt_text),
            "sections": export.sections,
            "size": export.size_report,
            "budget": export.research_budget,
            "revision": None
            if export.base_revision is None
            else {
                "base_revision": export.base_revision,
                "change": export.change_request,
                "slot_id": export.change_slot_id,
            },
        },
        "proposal": None
        if proposal is None
        else {
            "revision": proposal.result_revision,
            "saved_at": proposal.saved_at,
            "origin": proposal.origin,
            "export_id": proposal.export_id,
            "selection": proposal.selection.model_dump(by_alias=True),
            "report": proposal.report.model_dump(),
            "stale": proposal_stale,
            "changes": _context_changes(proposal_export, setup, day_id, workspace_id)
            if proposal_stale and proposal_export is not None
            else [],
        },
        "previous_version": None if previous is None else _previous_view(previous),
        "history": [
            {
                "revision": stored.result_revision,
                "saved_at": stored.saved_at,
                "kind": "proposal" if stored.is_selection else "previous",
                "origin": stored.origin,
                "headline": stored.headline(),
                "complete": stored.complete,
            }
            for stored in history
        ],
        "research": _research_view(workspace_id, day_id, export),
        "pending_attempt": store.pending_attempt(workspace_id, day_id),
    }


# How long past the call's own ceiling a silent run is given before it is
# reported as never heard from. Enough for the subprocess to be killed, the
# failure to be recorded and the write to land; not so much that an operator
# waits an extra ten minutes to learn something already true.
_STALL_SLACK = 120.0


def _older_than(timestamp: str, seconds: float) -> bool:
    """Whether a recorded moment is further back than this many seconds.

    Unreadable timestamps answer False. A row this cannot parse is not
    evidence that something went wrong, and treating it as such would take a
    working run away from an operator on the strength of a formatting problem.
    """
    try:
        started = datetime.fromisoformat(timestamp)
    except (TypeError, ValueError):
        return False
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - started).total_seconds() > seconds


def _stall_ceiling(export_id: str) -> float:
    """How long the run's own export was allowed, not the day's current one.

    A run is measured against the limit it was dispatched under. Reading the
    day's latest export instead would declare a seven-stop run lost the moment
    the operator rebuilt the prompt with three stops in it.
    """
    export = store.load_export(export_id)
    if export is None:
        return research_module.RESEARCH_CEILING_SECONDS
    return research_module.timeout_for(export)


def _research_view(
    workspace_id: str, day_id: str, export: DayPromptExport | None
) -> dict[str, Any] | None:
    """The last in-app research run, and whether its answer still fits the day.

    An answer to a prompt the day has since outgrown is not offered. It is not
    hidden either -- it cost something and it says so -- but it is not put in
    front of the operator as the thing to import.
    """
    run = store.latest_research_run(workspace_id, day_id)
    if run is None:
        return None
    for_this_export = bool(export is not None and run["export_id"] == export.export_id)
    # A run nobody has heard from since well past its own ceiling. The usual
    # cause is the server restarting mid-call, which kills the background task
    # and leaves the row saying "running" with nothing behind it.
    #
    # Reported as its own thing rather than rewritten to "failed", because the
    # two are different facts: this app knows the call was dispatched and does
    # NOT know whether the provider answered or billed. Saying "it failed"
    # would be claiming something nobody established.
    stalled = run["state"] == "running" and _older_than(
        run["started_at"], _stall_ceiling(run["export_id"]) + _STALL_SLACK
    )
    details = store.research_details(run["attempt_key"]) or {}
    usage = details.get("usage") or {}
    return {
        "state": run["state"],
        "stalled": stalled,
        "wire_version": details.get("wire_version", ""),
        "duration_ms": details.get("duration_ms"),
        # Null is unknown -- the transcript could not be read, or the run
        # predates this record. Never shown as zero.
        "searches": details.get("searches"),
        "fetches": details.get("fetches"),
        "budget": details.get("budget") or {},
        "sent_characters": (details.get("sent") or {}).get("total"),
        "returned_characters": len(details.get("returned") or "") or None,
        "output_tokens": usage.get("output_tokens")
        if isinstance(usage.get("output_tokens"), int)
        else None,
        "saved_as_revision": details.get("result_revision"),
        "detail": run["detail"],
        "fault": run["fault"],
        "model": run["model"],
        "cost_usd": run["cost_usd"],
        # A single turn means it never searched, whatever the packet claims
        # about itself. Sent because it is the only honest evidence there is.
        "turns": run["turns"],
        "started_at": run["started_at"],
        "finished_at": run["finished_at"],
        "for_current_export": for_this_export,
        # Only when it is the answer to the prompt this day is actually on.
        "raw": run["raw"] if (run["state"] == "done" and for_this_export) else "",
    }


def workspace_view(
    *, workspace_id: str, setup: SetupSnapshot, workspace_revision: int
) -> dict[str, Any]:
    """The whole trip at a glance: every day's state and its chosen places."""
    approvals = store.approved_signatures(workspace_id)
    results = _results_by_day(workspace_id, setup)
    days: list[dict[str, Any]] = []
    for index, day in enumerate(setup.days):
        grill = store.load_day_work(workspace_id, day.id)["grill"]
        accepted = _accepted_direction(workspace_id, day.id)
        candidate = _candidate_direction(workspace_id, day.id)
        export = current_export(workspace_id, day.id)
        proposal = results.get(day.id)
        key = current_context_key(workspace_id, setup, day.id)
        approved = approvals.get(day.id) == layout_signature(setup, day)
        labels = {slot.id: slot.label or slot.id for slot in day.slots}
        days.append(
            {
                "day_id": day.id,
                "day_number": index + 1,
                "day_label": day.label or f"Day {index + 1}",
                "state": derive_state(
                    approved=approved,
                    grill=grill,
                    candidate=candidate,
                    accepted=accepted,
                    export=export,
                    export_stale=export is not None and export.context_key != key,
                    proposal=proposal,
                ),
                "complete": bool(proposal is not None and proposal.complete),
                "overview": proposal.selection.overview if proposal else "",
                "trip_fit": proposal.selection.trip_fit if proposal else "",
                "picks": []
                if proposal is None
                else [
                    {
                        "label": labels.get(pick.slot_id, pick.slot_id),
                        "name": pick.name,
                        "status": pick.status,
                    }
                    for pick in proposal.selection.picks
                ],
                "stay": stay_context(setup, day.id, results, exclude_own=False),
            }
        )
    return {
        "workspace_id": workspace_id,
        "revision": workspace_revision,
        "setup_hash": stable_hash(setup.model_dump(by_alias=True)),
        "days": days,
    }


def handoff_packet(*, workspace_id: str, setup: SetupSnapshot) -> dict[str, Any]:
    """The chosen places and their context, for whatever writes the article later.

    Only proposals are handed on. Nothing here writes, publishes or starts
    anything; it is a read.
    """
    results = _results_by_day(workspace_id, setup)
    trip = setup.trip
    days = []
    for index, day in enumerate(setup.days, start=1):
        stored = results.get(day.id)
        accepted = _accepted_direction(workspace_id, day.id)
        summary = accepted.direction if accepted and isinstance(accepted.direction, DaySummary) else None
        labels = {slot.id: slot for slot in day.slots}
        selection = stored.selection if stored else None
        days.append(
            {
                "day": index,
                "label": day.label,
                "date": day_date_label(trip, index - 1),
                "window": window_label(day),
                "angle": summary.angle if summary else "",
                "stay": stay_context(setup, day.id, results, exclude_own=False),
                "proposal_version": stored.result_revision if stored else None,
                "complete": bool(stored and stored.complete),
                "overview": selection.overview if selection else "",
                "trip_fit": selection.trip_fit if selection else "",
                "stops": []
                if selection is None
                else [
                    {
                        "stop": labels[pick.slot_id].label if pick.slot_id in labels else pick.slot_id,
                        "kind": labels[pick.slot_id].kind if pick.slot_id in labels else "",
                        "status": pick.status,
                        "name": pick.name,
                        "category": pick.category,
                        "area": pick.area,
                        "address": pick.address,
                        "reason": pick.reason,
                        "note": pick.note,
                        "chosen_by": pick.chosen_by,
                        "map": pick.maps_url,
                        "sources": [source.model_dump() for source in pick.sources],
                    }
                    for pick in selection.picks
                ],
                "journeys": []
                if selection is None
                else [leg.model_dump(by_alias=True) for leg in selection.journeys],
                "open_questions": []
                if selection is None
                else [question.model_dump(by_alias=True) for question in selection.questions],
            }
        )
    return {
        "kind": "itinerary-selection-handoff-v1",
        "workspace_id": workspace_id,
        "trip": {
            "title": trip.title_seed,
            "city": trip.base_city,
            "timing": trip.timing,
            "preferred_areas": trip.preferred_areas,
            "preferences": trip.shared_preferences,
        },
        "days": days,
    }
