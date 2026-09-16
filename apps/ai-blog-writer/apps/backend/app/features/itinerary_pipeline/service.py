"""One day's workflow, from a handed-over setup to a saved researched day.

This module is the only place that knows the order of the steps. The pieces
either side of it are deliberately ignorant of each other: the grill does not
know about exports, the validator does not know about the store, and the store
does not know what a day means. That is what makes each of them testable
without a network and without a database.

The state an operator sees is DERIVED here, from the artifacts, every time it
is asked for. There is no `status` column. A stored status is a second opinion
about facts already written down, and the two go out of step the first time a
write half-lands.
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
from .context import context_key, day_brief, day_date_label, window_label
from .contracts import (
    DayDirection,
    DayPromptExport,
    DayResult,
    DirectionRevision,
    SetupSnapshot,
    StoredResult,
    stable_hash,
)
from . import direction as direction_module
from . import grill as grill_module
from .prompt_export import build_export, build_repair_prompt, compact_enabled
from . import research as research_module
from .research_adapter import AdapterContext, RunFacts
from .validation import PasteRejected, parse_paste, validate_paste

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
    # auth off -- the local default -- there is no caller to compare against,
    # and refusing every request would make the feature unusable in
    # development while proving nothing about production.
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
    found: dict[str, StoredResult] = {}
    for day in setup.days:
        latest = store.latest_result(workspace_id, day.id)
        if latest is not None:
            found[day.id] = latest
    return found


def _directions_by_day(
    workspace_id: str, setup: SetupSnapshot
) -> dict[str, DayDirection]:
    found: dict[str, DayDirection] = {}
    for day in setup.days:
        accepted = _accepted_direction(workspace_id, day.id)
        if accepted is not None:
            found[day.id] = accepted.direction
    return found


def current_context_key(workspace_id: str, setup: SetupSnapshot, day_id: str) -> str:
    """What an export depends on: the day, the other days, and the direction.

    The accepted direction is in here because an export is built FROM it, so a
    different direction is a different request.
    """
    accepted = _accepted_direction(workspace_id, day_id)
    return context_key(
        setup,
        day_id,
        _results_by_day(workspace_id, setup),
        accepted.direction if accepted else None,
    )


def conversation_key(workspace_id: str, setup: SetupSnapshot, day_id: str) -> str:
    """What the INTERVIEW depends on, which is the same minus the direction.

    The direction is downstream of the conversation: it is written from it.
    Including it here would mean that accepting a direction — the ordinary next
    step — immediately told the operator their conversation was out of date,
    which is both wrong and the kind of false alarm that teaches people to
    ignore the real one.
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
    """The one line the interview opens on.

    Short on purpose: the seed is replayed verbatim into every later prompt,
    and everything else this interview knows arrives through the brief, which
    is rebuilt per turn from the workspace.
    """
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
    against a day that has since changed describes the old day, and accepting
    it would make an export from requirements nobody agreed to.
    """
    candidates = {
        found.revision: found for found in store.list_directions(workspace_id, day_id)
    }
    found = candidates.get(revision)
    if found is None:
        raise LookupError("That direction revision does not exist.")
    if found.status == "accepted":
        return found
    live = conversation_key(workspace_id, setup, day_id)
    if found.context_key and found.context_key != live:
        raise Stale(
            "This day changed while that direction was on screen. Read it again "
            "before accepting it."
        )
    return store.accept_direction(workspace_id, day_id, revision)


# ------------------------------------------------------------------ export --


def prepare_export(
    *, workspace_id: str, setup: SetupSnapshot, workspace_revision: int, day_id: str
) -> DayPromptExport:
    """Build the copyable prompt. Free, deterministic, and reused when unchanged.

    Copying twice for an unchanged day returns the same export id rather than
    minting a second one -- otherwise the operator is holding one prompt while
    the app is expecting an answer to another.
    """
    accepted = _accepted_direction(workspace_id, day_id)
    if accepted is None:
        raise ValueError("This day has no accepted direction to export.")
    if not approval_current(workspace_id, setup, day_id):
        raise Stale(
            "This day's layout is not approved as it currently stands. Review it "
            "before copying a research prompt."
        )
    key = current_context_key(workspace_id, setup, day_id)

    def assemble(export_id: str | None) -> DayPromptExport:
        return build_export(
            workspace_id=workspace_id,
            workspace_revision=workspace_revision,
            setup=setup,
            day_id=day_id,
            direction=accepted.direction,
            direction_revision=accepted.revision,
            context_key=key,
            results=_results_by_day(workspace_id, setup),
            directions=_directions_by_day(workspace_id, setup),
            export_id=export_id,
        )

    # Built once with a fresh id to learn the hash, which is what decides
    # whether this request already has an export.
    candidate = assemble(None)
    existing = store.find_export_by_hash(workspace_id, day_id, candidate.input_hash)
    if existing is None:
        store.save_export(candidate)
        return candidate

    # The identity is unchanged, so the export that exists is the one that
    # answers. It is reassembled under its OWN id rather than replayed: the
    # voice files and these instructions are allowed to improve without
    # invalidating an outstanding request, because the hash is over what was
    # ASKED FOR and not over the prose that asked. The id is baked into the
    # prompt text and the schema, which is why this cannot simply keep the
    # candidate and relabel it.
    reused = assemble(existing.export_id).model_copy(
        update={"created_at": existing.created_at}
    )
    store.save_export(reused)
    return reused


def current_export(workspace_id: str, day_id: str) -> DayPromptExport | None:
    exports = store.list_exports(workspace_id, day_id)
    return exports[-1] if exports else None


def export_answered_by(
    workspace_id: str, day_id: str, raw: str
) -> DayPromptExport | None:
    """The export a pasted packet says it is answering.

    Read from the packet rather than assumed to be the newest, because a day
    can legitimately have more than one outstanding prompt -- copy one, change
    the day, copy another -- and an answer to the first one should be told what
    changed rather than told it is answering the wrong prompt. The identity and
    context checks then do the real work against the export it actually names.

    Falls back to the newest export when the packet names nothing usable: an
    unreadable paste is a transport problem, and reporting it as one needs
    something for the checks to run against.
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


# ---------------------------------------------------------------- research --


def start_research(
    *, workspace_id: str, setup: SetupSnapshot, day_id: str, attempt_key: str
) -> DayPromptExport:
    """Claim the right to research this day, synchronously, before dispatch.

    Separate from `run_research` below so the route can return the moment the
    claim is written. A day's research is minutes of searching and reading; a
    request that waited for it would time out in the browser long before the
    work finished, and a second click would buy a second one.
    """
    export = current_export(workspace_id, day_id)
    if export is None:
        raise ValueError(
            "This day has no research prompt yet. Build one first."
        )
    if export.context_key != current_context_key(workspace_id, setup, day_id):
        raise Stale(
            "This day changed since its prompt was built. Rebuild the prompt "
            "before researching, or the answer will not fit the day."
        )
    if compact_enabled() and not export.is_compact:
        # An issued v1 prompt stays readable and its pasted answers stay
        # importable; it is just no longer something the app will run.
        raise Stale(
            "This prompt was built in the older, larger research format. Rebuild "
            "it to run the research here; answers you already have for it can "
            "still be pasted in."
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
    """The research run whose answer this text is, unedited, or None.

    Telemetry belongs to a run, and a paste only inherits it when it IS that
    run's answer. An edited answer is the operator's text, not the run's.
    """
    for run in store.research_runs_for_export(workspace_id, day_id, export_id):
        if run["raw"] and _same_answer(run["raw"], raw):
            return run["attempt_key"]
    return None


def _run_facts(attempt_key: str | None) -> RunFacts:
    if attempt_key is None:
        return RunFacts()
    run = store.research_details(attempt_key) or {}
    searches, fetches = run.get("searches"), run.get("fetches")
    browsed = None if searches is None or fetches is None else (searches + fetches) > 0
    finished = store.research_run_finished_at(attempt_key)
    return RunFacts(performed_at=finished[:10] or None, browsed=browsed)


def _adapter_for(
    workspace_id: str, setup: SetupSnapshot, day_id: str, export: DayPromptExport, raw: str
) -> tuple[AdapterContext, str | None]:
    day = setup.day(day_id)
    assert day is not None
    agreed = next(
        (
            found.direction
            for found in store.list_directions(workspace_id, day_id)
            if found.revision == export.direction_revision
        ),
        None,
    )
    attempt = (
        _run_behind(workspace_id, day_id, export.export_id, raw)
        if export.is_compact
        else None
    )
    return (
        AdapterContext(
            day=day,
            trip_role=agreed.trip_role if agreed else "",
            schedule_label=window_label(day),
            reserved_for_later=list(agreed.continuity.reserved_for_later) if agreed else [],
            run=_run_facts(attempt),
        ),
        attempt,
    )


def preview_import(
    *, workspace_id: str, setup: SetupSnapshot, day_id: str, raw: str
) -> dict[str, Any]:
    day = setup.day(day_id)
    if day is None:
        raise LookupError(f"No day {day_id}")
    export = export_answered_by(workspace_id, day_id, raw)
    if export is None:
        raise ValueError(
            "Nothing has been exported for this day, so there is no request for "
            "this answer to be an answer to."
        )
    adapter, attempt = _adapter_for(workspace_id, setup, day_id, export, raw)
    result, report, content_hash = validate_paste(
        raw,
        export=export,
        day=day,
        workspace_id=workspace_id,
        day_id=day_id,
        current_context_key=current_context_key(workspace_id, setup, day_id),
        adapter=adapter,
        base_known=bool(setup.trip.starting_base.strip()),
    )
    previous = store.latest_result(workspace_id, day_id)
    return {
        "valid": report.valid,
        "report": report,
        "result": result,
        "content_hash": content_hash,
        "export_id": export.export_id,
        "changes": _changes_against(previous, result),
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
    previous: StoredResult | None, incoming: DayResult | None
) -> list[str]:
    """What this paste would change about the day that is already saved."""
    if incoming is None:
        return []
    if previous is None:
        return ["Nothing is saved for this day yet; this would be the first result."]
    lines: list[str] = []
    if (previous.result.title or "") != (incoming.title or ""):
        lines.append(
            f'Title: "{previous.result.title}" becomes "{incoming.title}"'
        )
    before = {stop.slot_id: stop for stop in previous.result.stops}
    for stop in incoming.stops:
        was = before.get(stop.slot_id)
        if was is None:
            lines.append(f"{stop.slot_id}: new in this result")
            continue
        if was.status != stop.status:
            lines.append(f"{stop.slot_id}: {was.status} becomes {stop.status}")
        elif (was.name or "") != (stop.name or ""):
            lines.append(
                f'{stop.slot_id}: "{was.name or "nothing"}" becomes '
                f'"{stop.name or "nothing"}"'
            )
    if not lines:
        lines.append("No stop changes; the wording or the evidence may still differ.")
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
    """Save a previewed result, atomically, against the state it was previewed on.

    Everything is re-read and re-validated here rather than trusted from the
    preview. The preview is a rendering; between it and this call the workspace
    can have moved, and a save that skipped the second check would write a
    result answering a question the day no longer asks.
    """
    day = setup.day(day_id)
    if day is None:
        raise LookupError(f"No day {day_id}")
    export = export_answered_by(workspace_id, day_id, raw)
    if export is None:
        raise ValueError("Nothing has been exported for this day.")
    adapter, attempt = _adapter_for(workspace_id, setup, day_id, export, raw)
    result, report, content_hash = validate_paste(
        raw,
        export=export,
        day=day,
        workspace_id=workspace_id,
        day_id=day_id,
        current_context_key=current_context_key(workspace_id, setup, day_id),
        adapter=adapter,
        base_known=bool(setup.trip.starting_base.strip()),
    )
    if result is None or not report.valid:
        raise ValueError(
            "This result cannot be saved: it did not pass the checks. Preview it "
            "again to see why."
        )
    if expected_content_hash and expected_content_hash != content_hash:
        raise Stale(
            "The pasted text changed since it was previewed. Preview it again "
            "before saving."
        )

    def build(revision: int) -> StoredResult:
        return StoredResult(
            result_revision=revision,
            export_id=export.export_id,
            content_hash=content_hash,
            result=result,
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
    result: StoredResult | None,
) -> str:
    """The one word the screen leads with, derived and never stored."""
    if not approved:
        return "layout_needs_review"
    if result is not None:
        if export_stale:
            return "context_changed"
        return (
            "saved_complete"
            if result.report.completeness.complete
            else "saved_needs_work"
        )
    if export is not None and not export_stale:
        return "prompt_ready"
    if export is not None and export_stale:
        return "context_changed"
    if accepted is not None:
        return "direction_accepted"
    if candidate is not None:
        return "direction_review"
    if grill is None:
        return "ready_to_start"
    if grill.status == "agreed":
        return "agreed"
    return "grill_asking"


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
    result = store.latest_result(workspace_id, day_id)
    key = current_context_key(workspace_id, setup, day_id)
    talking = conversation_key(workspace_id, setup, day_id)
    approved = approval_current(workspace_id, setup, day_id)
    export_stale = export is not None and export.context_key != key

    history = store.load_results(workspace_id, day_id)
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
            result=result,
        ),
        "grill": _grill_view(grill),
        "grill_context_changed": bool(
            grill is not None
            and work_row["context_key"]
            and work_row["context_key"] != talking
        ),
        "candidate_direction": None
        if candidate is None
        else candidate.model_dump(),
        "accepted_direction": None if accepted is None else accepted.model_dump(),
        "export": None
        if export is None
        else {
            "export_id": export.export_id,
            "created_at": export.created_at,
            "direction_revision": export.direction_revision,
            "input_hash": export.input_hash,
            "voice_version": export.voice_version,
            "prompt_text": export.prompt_text,
            "stale": export_stale,
            "characters": len(export.prompt_text),
            "wire_version": export.schema_version,
            "compact": export.is_compact,
            # A prompt in the old format can still be copied and answered;
            # the app will not run it.
            "legacy": not export.is_compact,
            "runnable": export.is_compact or not compact_enabled(),
            "sections": export.sections,
            "size": export.size_report,
            "budget": export.research_budget,
        },
        "result": None
        if result is None
        else {
            "result_revision": result.result_revision,
            "saved_at": result.saved_at,
            "export_id": result.export_id,
            "result": result.result.model_dump(by_alias=True),
            "report": result.report.model_dump(),
            # What actually arrived, when the saved object was built from it
            # by the app rather than returned as-is.
            "returned_raw": store.result_raw(workspace_id, day_id, result.result_revision)
            if result.result.wire_version
            else "",
        },
        "result_history": [
            {
                "result_revision": stored.result_revision,
                "saved_at": stored.saved_at,
                "title": stored.result.title,
                "complete": stored.report.completeness.complete,
            }
            for stored in history
        ],
        "review": {
            "notes": work_row["review_notes"],
            "evidence_reviewed": work_row["evidence_reviewed"],
        },
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
    approvals = store.approved_signatures(workspace_id)
    days: list[dict[str, Any]] = []
    for index, day in enumerate(setup.days):
        grill = store.load_day_work(workspace_id, day.id)["grill"]
        accepted = _accepted_direction(workspace_id, day.id)
        candidate = _candidate_direction(workspace_id, day.id)
        export = current_export(workspace_id, day.id)
        result = store.latest_result(workspace_id, day.id)
        key = current_context_key(workspace_id, setup, day.id)
        approved = approvals.get(day.id) == layout_signature(setup, day)
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
                    result=result,
                ),
                "title": None if result is None else result.result.title,
                "complete": bool(
                    result is not None and result.report.completeness.complete
                ),
            }
        )
    return {
        "workspace_id": workspace_id,
        "revision": workspace_revision,
        "setup_hash": stable_hash(setup.model_dump(by_alias=True)),
        "days": days,
    }
