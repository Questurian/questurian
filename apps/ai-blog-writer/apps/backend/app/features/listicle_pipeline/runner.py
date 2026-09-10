"""Running a search order once, and recovering from the half of it that failed.

The version this replaced ran six searches inside one HTTP request and stored
what came back as a single blob. Three things followed from that, all of them
bad and all of them seen on the only real run there has been:

- a failure on the sixth search threw away the five that had worked;
- a reload had no way to ask what had already been done, so the only way back
  to a run was to pay for it again;
- and a re-run replaced the stored results wholesale, so the last good version
  was gone the moment a worse one finished.

So the unit of work here is one angle, not one order. Each is claimed, run and
stored on its own. A batch is a loop over that, and a retry is the same loop
with a shorter list.

What this can promise: successful work survives; a second click does not start
a second batch; a stale result is never shown as current.

What it cannot promise: that a request whose answer never arrived was not
already processed and charged for. An interrupted attempt is labelled as
interrupted rather than as failed, and retrying it may cost again. Saying so is
the honest version; a green tick would not be.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from .contracts import (
    AngleSelection,
    AttemptContribution,
    PoolSnapshot,
    ProviderCall,
    SearchAttempt,
    SearchOrder,
)
from . import store
from .search import (
    POOLING_VERSION,
    AngleRequest,
    Candidate,
    Sighting,
    contribution_of,
    pool_sightings,
    run_one_angle,
)
from .spec import planned_capacity

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _request_for(order: SearchOrder, angle, attempt_id: str = "") -> AngleRequest:
    return AngleRequest(
        angle_id=angle.angle_id,
        text=angle.text,
        role=angle.role,
        wanted=angle.wanted,
        shape_key=angle.shape_key,
        group=angle.group,
        edited=angle.edited,
        attempt_id=attempt_id,
    )


def reusable_attempt(
    order: SearchOrder, angle, attempts: list[SearchAttempt]
) -> SearchAttempt | None:
    """A stored result that still answers the request this order makes.

    Matched on the request rather than on the angle's name. Change the place,
    the exclusions, the standard or the wording and the stored rows answered a
    different question -- they may still be true and they are no longer this
    order's evidence, so they are not silently carried forward.
    """
    fingerprint = order.angle_fingerprint(angle)
    matching = [
        attempt
        for attempt in attempts
        if attempt.angle_id == angle.angle_id
        and attempt.state == "completed"
        and attempt.request_fingerprint == fingerprint
    ]
    if not matching:
        return None
    return max(matching, key=lambda a: (a.revision, a.finished_at))


def _select(
    order: SearchOrder,
    angle_id: str,
    *,
    selected: str,
    latest: str,
) -> None:
    """Point one angle at the work it is currently showing.

    A reference, never a copy. Re-filing the reused attempt under the new
    revision is what made one paid execution appear three times in search
    history, and it also lost the fact that the work was done earlier.
    """
    store.save_selection(
        AngleSelection(
            run_id=order.run_id,
            revision=order.revision,
            angle_id=angle_id,
            selected_attempt_id=selected,
            latest_attempt_id=latest,
        )
    )


def _sightings_of(attempt: SearchAttempt) -> list[Sighting]:
    return [
        Sighting(
            angle=row.get("angle", attempt.angle_text),
            angle_id=row.get("angle_id", attempt.angle_id),
            name=row.get("name", ""),
            district=row.get("district", ""),
            evidence=row.get("evidence", ""),
            # Named from the attempt and the row's position when it is missing,
            # which is every row stored before observations had identities.
            sighting_id=row.get("sighting_id")
            or f"{attempt.attempt_id}#{index}",
        )
        for index, row in enumerate(attempt.sightings)
        if row.get("name")
    ]


class LeaseLost(RuntimeError):
    """The batch no longer owns the run.

    Raised rather than logged. A process that lost its lease has to stop
    dispatching and must not publish over the work of whoever took it; the
    responses it already bought are archived as orphaned evidence, which is
    what an attempt row left in `running` is.
    """


def run_order(
    order: SearchOrder,
    research,
    *,
    only: list[str] | None = None,
    reuse: bool = True,
    owner_token: str = "",
) -> dict:
    """Run the angles that need running, and assemble what the run now knows.

    `only` names the angles to run; everything else is read from storage. That
    is what makes a retry precise -- the operator re-runs the one search that
    timed out and pays for one search.

    `reuse` off is the deliberate full refresh: the operator wants new
    research, knows it costs, and asked for it.

    `owner_token` is the batch lease. It is checked before every dispatch and
    again before the result is committed, so a process whose lease expired and
    was taken over cannot spend on this run's behalf or overwrite the work of
    the process that took it.
    """
    known = store.load_attempts(order.run_id)
    selections = store.load_selections_for(order.run_id, order.revision)
    wanted_ids = set(only) if only is not None else None

    for angle in order.angles:
        fingerprint = order.angle_fingerprint(angle)
        should_run = wanted_ids is None or angle.angle_id in wanted_ids
        current = selections.get(angle.angle_id)
        selected_now = current.selected_attempt_id if current else ""

        if should_run and reuse:
            existing = reusable_attempt(order, angle, known)
            if existing is not None:
                # A reference. The attempt keeps the revision it was run under,
                # so `gathered_at` still says when the work was actually done
                # and search history still counts one execution.
                _select(
                    order,
                    angle.angle_id,
                    selected=existing.attempt_id,
                    latest=existing.attempt_id,
                )
                continue
        if not should_run:
            if current is None and selected_now == "":
                # Not asked for, and nothing points at it yet. A stored result
                # from an earlier revision may still answer this request.
                existing = reusable_attempt(order, angle, known)
                if existing is not None:
                    _select(
                        order,
                        angle.angle_id,
                        selected=existing.attempt_id,
                        latest=existing.attempt_id,
                    )
            continue

        if owner_token and not store.holds_batch(order.run_id, owner_token):
            raise LeaseLost(
                "These searches lost their claim on the run while they were "
                "working; nothing further was bought."
            )

        running = SearchAttempt(
            attempt_id=store.new_attempt_id(),
            run_id=order.run_id,
            revision=order.revision,
            angle_id=angle.angle_id,
            angle_text=angle.text,
            role=angle.role,
            wanted=angle.wanted,
            request_fingerprint=fingerprint,
            shape_key=angle.shape_key,
            subject=subject_of(order),
            state="running",
            started_at=_now(),
        )
        # Written BEFORE the call. A request that is sent and never answered
        # has to leave a row saying so, or an interrupted search is
        # indistinguishable from one that never ran -- and only one of those
        # may already have been charged for.
        store.save_attempt(running)
        _select(
            order,
            angle.angle_id,
            selected=selected_now,
            latest=running.attempt_id,
        )

        result, sightings = run_one_angle(
            _request_for(order, angle, running.attempt_id),
            kind=order.kind,
            place=order.place,
            exclusions=order.exclusions,
            standard=order.standard,
            research=research,
        )
        if owner_token and not store.holds_batch(order.run_id, owner_token):
            # The response may well have been bought. It is left in `running`,
            # which reads as interrupted: orphaned evidence, not current work.
            raise LeaseLost(
                "These searches lost their claim on the run before this "
                "result could be filed."
            )
        finished = running.model_copy(
            update={
                "state": "failed" if result.failed else "completed",
                "rows": result.rows,
                "sources": result.sources,
                "reason": result.reason,
                "source_urls": result.source_urls,
                "source_titles": result.source_titles,
                "provider_calls": [
                    ProviderCall(at=call.at, outcome=call.outcome, detail=call.detail)
                    for call in result.provider_calls
                ],
                "sightings": [
                    {
                        "angle": s.angle,
                        "angle_id": s.angle_id,
                        "name": s.name,
                        "district": s.district,
                        "evidence": s.evidence,
                        "sighting_id": s.sighting_id,
                    }
                    for s in sightings
                ],
                "finished_at": _now(),
            }
        )
        # Saved the moment it finishes rather than when the batch does. This is
        # the whole reason a failure on the sixth search no longer costs the
        # five that worked.
        store.save_attempt(finished)
        known = [a for a in known if a.attempt_id != finished.attempt_id]
        known.append(finished)
        # A completed refresh becomes what is shown, empty or not: a search
        # that ran and named nobody is a real finding about the angle. A failed
        # one leaves the earlier success selected and says the refresh failed,
        # which is two facts and used to be stored as one.
        _select(
            order,
            angle.angle_id,
            selected=(
                finished.attempt_id if finished.state == "completed" else selected_now
            ),
            latest=finished.attempt_id,
        )

    # The pool is only final once the batch is. Contribution is written back
    # here rather than at the moment each search lands, because what a search
    # contributed depends on what every other search returned.
    record_contribution(order)
    return assemble(order)


def prior_contribution(order: SearchOrder) -> dict[str, str]:
    """What each angle bought the last time it ran, said before it runs again.

    The open item this answers: in run 33fca394 the `purist` angle returned ten
    rows for one place nothing else found, and `hours` returned six rows for
    none. Roughly two of seven searches bought nothing, nothing noticed, and
    the numbers only existed after the money was spent.

    Read from pool snapshots rather than from attempts. Contribution is a
    measurement against peers, and one execution referenced by three revisions
    used to be summed three times -- "30 rows and 30 places nothing else found"
    for a single search that returned ten. One snapshot per prior run, each
    attempt counted once inside it.

    An angle is identified across runs by its SHAPE, not its wording -- the
    model rewrites the sentence every run -- and only within the same subject.
    An angle the operator wrote themselves has no shape to look up, so it is
    matched on its exact wording or not at all.

    Said, and nothing more. No angle is dropped, reordered or discouraged: two
    runs is a fact about two runs, and this pipeline has two.
    """
    subject = subject_of(order)
    snapshots = store.latest_pool_snapshots(subject, exclude_run=order.run_id)
    if not snapshots:
        return {}

    by_shape: dict[str, list[tuple[str, AttemptContribution]]] = {}
    by_text: dict[str, list[tuple[str, AttemptContribution]]] = {}
    for snapshot in snapshots:
        seen: set[str] = set()
        for entry in snapshot.contributions:
            # One execution, once. A snapshot cannot legally hold the same
            # attempt twice, and refusing it here means a corrupt one cannot
            # inflate the number either.
            if entry.attempt_id and entry.attempt_id in seen:
                continue
            if entry.attempt_id:
                seen.add(entry.attempt_id)
            if entry.shape_key:
                by_shape.setdefault(entry.shape_key, []).append(
                    (snapshot.run_id, entry)
                )
            if entry.angle_text:
                by_text.setdefault(entry.angle_text.strip().lower(), []).append(
                    (snapshot.run_id, entry)
                )

    notes: dict[str, str] = {}
    for angle in order.angles:
        earlier = (
            by_shape.get(angle.shape_key)
            if angle.shape_key
            else by_text.get(angle.text.strip().lower())
        )
        if not earlier:
            continue
        runs = len({run_id for run_id, _ in earlier})
        executions = len(earlier)
        rows = sum(entry.rows for _, entry in earlier)
        exclusive = sum(entry.exclusive for _, entry in earlier)
        when = (
            "the last time this search ran here"
            if executions == 1
            else f"across the {executions} times this search has run here"
        )
        earned = (
            "no place the other searches missed"
            if exclusive == 0
            else f"{exclusive} place{'' if exclusive == 1 else 's'} nothing else found"
        )
        # The run count is said separately rather than folded into the
        # execution count. Two searches in one run and one search in each of
        # two runs are different facts about coverage.
        across = "" if runs == executions else f" (in {runs} runs)"
        notes[angle.angle_id] = (
            f"{when.capitalize()}{across} it returned {rows} "
            f"row{'' if rows == 1 else 's'} and {earned}."
        )
    return notes


def subject_of(order: SearchOrder) -> str:
    """What a run is about, in the form two runs can be compared on.

    Kind and place only. The count, the bar and the cut all change what a
    search is asked for, and none of them changes whether "the `hours` shape
    finds cevicherias in Lima nobody else finds".
    """
    return f"{order.kind.strip().lower()}|{order.place.strip().lower()}"


def record_contribution(order: SearchOrder) -> None:
    """Write down what this pooling of the evidence measured.

    Contribution is computed against the finished pool, so it cannot be written
    when a search lands -- the searches after it will change it. It is written
    once the batch is done, and rewritten after every later batch: retrying one
    angle changes the pool and therefore changes what the other six turn out to
    have contributed.

    Stored as a snapshot rather than as a property of each execution. The same
    search has different exclusivity against different peers, and a number kept
    only on the execution cannot say what it was measured against -- which is
    how one paid search came to be reported as three.

    The per-attempt copy is kept as a convenience for the scripts that read
    attempts directly, and it is a mirror of the latest snapshot, never a
    second source of truth.
    """
    by_angle = _current_attempts(order)
    sightings: list[Sighting] = []
    for angle in order.angles:
        attempt = by_angle.get(angle.angle_id)
        if attempt is not None and attempt.state == "completed":
            sightings.extend(_sightings_of(attempt))
    candidates = pool_sightings(sightings)

    contributions: list[AttemptContribution] = []
    for angle in order.angles:
        attempt = by_angle.get(angle.angle_id)
        if attempt is None or attempt.state != "completed":
            continue
        found, shared, exclusive = contribution_of(candidates, angle.text)
        contributions.append(
            AttemptContribution(
                attempt_id=attempt.attempt_id,
                angle_id=angle.angle_id,
                angle_text=attempt.angle_text or angle.text,
                shape_key=attempt.shape_key or angle.shape_key,
                role=angle.role,
                rows=attempt.rows,
                found=found,
                shared=shared,
                exclusive=exclusive,
            )
        )
        store.record_attempt_contribution(
            attempt.attempt_id,
            found=found,
            shared=shared,
            exclusive=exclusive,
            shape_key=angle.shape_key,
            subject=subject_of(order),
        )

    store.save_pool_snapshot(
        PoolSnapshot(
            run_id=order.run_id,
            revision=order.revision,
            subject=subject_of(order),
            target_count=order.target_count,
            candidate_count=len(candidates),
            uncertain_identity=sum(1 for c in candidates if c.possible_duplicates),
            pooling_version=POOLING_VERSION,
            taken_at=_now(),
            contributions=contributions,
        )
    )


def _current_attempts(order: SearchOrder) -> dict[str, SearchAttempt]:
    """The attempt whose RESULT each angle is showing right now.

    The selection is what says so. It is written when work is filed rather than
    worked out on read, because "what is displayed" and "what happened most
    recently" come apart exactly when it matters: a refresh that failed leaves
    the earlier success on screen and the failure as the latest attempt, and
    the previous version of this function could only ever return one of those.

    An order with no selections yet -- one stored before they existed -- falls
    back to the reuse rule stated once: a stored result belongs to a request,
    not to a revision number.
    """
    selections = store.load_selections_for(order.run_id, order.revision)
    stored = {a.attempt_id: a for a in store.load_attempts(order.run_id)}
    chosen: dict[str, SearchAttempt] = {}
    for angle in order.angles:
        selection = selections.get(angle.angle_id)
        attempt = (
            stored.get(selection.selected_attempt_id)
            if selection and selection.selected_attempt_id
            else None
        )
        if attempt is not None:
            chosen[angle.angle_id] = attempt
            continue
        if selection is not None and selection.latest_attempt_id:
            # Nothing successful is selected, but something was tried. The
            # latest attempt is what the screen has to show -- running, failed
            # or interrupted -- and it is not a result.
            latest = stored.get(selection.latest_attempt_id)
            if latest is not None:
                chosen[angle.angle_id] = latest
            continue
        # No selection at all. Either an order stored before selections
        # existed, or an attempt written straight to storage by a recovery
        # path. This revision's own attempt speaks first -- including one still
        # marked `running`, which is what an interrupted search looks like --
        # and a matching stored success from an earlier revision after it.
        mine = [
            a
            for a in stored.values()
            if a.angle_id == angle.angle_id and a.revision == order.revision
        ]
        if mine:
            chosen[angle.angle_id] = max(
                mine, key=lambda a: (a.finished_at, a.started_at)
            )
            continue
        fallback = reusable_attempt(order, angle, list(stored.values()))
        if fallback is not None:
            chosen[angle.angle_id] = fallback
    return chosen


def _latest_attempts(order: SearchOrder) -> dict[str, SearchAttempt]:
    """The most recent attempt for each angle, whatever it did.

    Read beside `_current_attempts` rather than instead of it. "Showing an
    earlier result because the refresh failed" is two facts and the screen has
    to be given both.
    """
    selections = store.load_selections_for(order.run_id, order.revision)
    stored = {a.attempt_id: a for a in store.load_attempts(order.run_id)}
    latest: dict[str, SearchAttempt] = {}
    for angle in order.angles:
        selection = selections.get(angle.angle_id)
        if selection is None or not selection.latest_attempt_id:
            continue
        attempt = stored.get(selection.latest_attempt_id)
        if attempt is not None:
            latest[angle.angle_id] = attempt
    return latest


def _state_of(attempt: SearchAttempt | None, running: bool) -> str:
    if attempt is None:
        return "not_started"
    if attempt.state == "running" and not running:
        # The process that claimed it is gone. Not "failed": nobody knows
        # whether the provider answered, and retrying may be charged again.
        return "interrupted"
    return attempt.state


def assemble(order: SearchOrder) -> dict:
    """What the run knows right now, whether or not anything is still running.

    Read rather than computed as the searches go, so the numbers do not depend
    on the order the angles finished in. Contribution in particular is
    calculated against the finished pool: the first angle to return a place
    does not collect credit for it, and reordering the searches cannot change
    what the table says.
    """
    running = store.batch_is_running(order.run_id)
    by_angle = _current_attempts(order)

    sightings: list[Sighting] = []
    for angle in order.angles:
        attempt = by_angle.get(angle.angle_id)
        if attempt is not None and attempt.state == "completed":
            sightings.extend(_sightings_of(attempt))
    # Sorted for the screen only. Identity does not come from position: the
    # id is a function of a candidate's members, so the same evidence produces
    # the same candidates however it is ordered here.
    candidates: list[Candidate] = sorted(
        pool_sightings(sightings),
        key=lambda c: (-c.overlap, c.name.lower(), c.candidate_id),
    )

    latest_by_angle = _latest_attempts(order)
    angle_rows = []
    for angle in order.angles:
        attempt = by_angle.get(angle.angle_id)
        latest = latest_by_angle.get(angle.angle_id) or attempt
        state = _state_of(attempt, running)
        latest_state = _state_of(latest, running)
        # The result on screen was gathered by an attempt that is not the most
        # recent one. That is a refresh that failed, and saying "0 results" for
        # it -- which is what the old single-row-per-angle storage did -- is
        # both wrong and unrecoverable.
        showing_earlier = bool(
            attempt
            and latest
            and attempt.attempt_id != latest.attempt_id
            and attempt.state == "completed"
        )
        if showing_earlier:
            note = (
                f"refresh {latest_state}; showing the earlier result from "
                f"{attempt.finished_at or 'before'}"
            )
        elif latest_state == "interrupted":
            note = "it never came back; re-running it may be charged again"
        elif attempt is None:
            note = "this search has not been run yet"
        else:
            note = attempt.reason
        found, shared, exclusive = contribution_of(candidates, angle.text)
        angle_rows.append(
            {
                "angle_id": angle.angle_id,
                "angle": angle.text,
                "shape": angle.shape_key,
                "group": angle.group,
                "role": angle.role,
                "wanted": angle.wanted,
                "edited": angle.edited,
                "custom": angle.custom,
                "state": state,
                # What happened most recently, which is not always what is on
                # screen. Kept separate so a failed refresh can say both.
                "latest_state": latest_state,
                "showing_earlier": showing_earlier,
                # Kept for the screen that has always read these.
                "failed": latest_state in {"failed", "interrupted"}
                and not showing_earlier,
                "rows": attempt.rows if attempt else 0,
                "sources": attempt.sources if attempt else 0,
                "reason": note,
                # Repeated discovery, reported as itself. Not a ranking: a
                # search with few exclusive names may be carrying the coverage
                # everything else is being checked against.
                "found": found,
                "shared": shared,
                "exclusive": exclusive,
                "gathered_at": attempt.finished_at if attempt else "",
                "sources_named": list(attempt.source_titles) if attempt else [],
                "reused": bool(
                    attempt
                    and attempt.state == "completed"
                    and attempt.revision != order.revision
                ),
                # How many requests actually reached the provider for the work
                # being shown. One invocation is not one billable call.
                "provider_calls": len(attempt.provider_calls) if attempt else 0,
                "origin": attempt.origin if attempt else "",
            }
        )

    uncertain = sum(1 for c in candidates if c.possible_duplicates)
    capacity = planned_capacity(order)
    # None means nobody has checked this revision against the cut; `{}` means
    # something checked and barred nothing. The screen says which, because
    # "we looked and it is fine" and "we never looked" are different claims.
    stored_review = store.load_cut_review(order.run_id, order.revision)
    barred = stored_review or {}
    payload = {
        "run_id": order.run_id,
        "revision": order.revision,
        "target": order.target_count,
        "found": len(candidates),
        "shortfall": max(0, order.target_count - len(candidates)),
        "rows_returned": sum(row["rows"] for row in angle_rows),
        "running": running,
        "complete": all(
            row["state"] == "completed" for row in angle_rows
        ) and bool(angle_rows),
        # A refresh that failed over work that stands. The list is still
        # complete and something still went wrong, and one boolean cannot say
        # both.
        "failed_refreshes": [
            row["angle_id"] for row in angle_rows if row["showing_earlier"]
        ],
        # Said plainly rather than left to be worked out. A distinct count is
        # provisional while any two rows might be one venue, and a screen that
        # prints one number implies a certainty this step has not got.
        "uncertain_identity": uncertain,
        "capacity": capacity,
        # Said rather than left to be worked out from a table. Roughly two of
        # seven searches in run 33fca394 returned no place the others missed,
        # and nothing anywhere said so.
        # Whether anything has judged this revision's places against the cut,
        # and what it said. Separate from the flags themselves so an unchecked
        # run does not read as a clean one.
        "cut_checked": stored_review is not None,
        "barred_count": sum(
            1 for c in candidates if barred.get(c.name, {}).get("why")
        ),
        "empty_handed": [
            row["angle_id"]
            for row in angle_rows
            if row["state"] == "completed" and row["exclusive"] == 0
        ],
        "capacity_warning": (
            f"These {len(order.angles)} searches ask for {capacity} places in "
            f"total, which may not fill a list of {order.target_count}. Add an "
            "angle, or take the shorter list."
            if capacity < order.target_count
            else ""
        ),
        "order": {
            "kind": order.kind,
            "place": order.place,
            "target_count": order.target_count,
            "standard": order.standard,
            "exclusions": order.exclusions,
            "count_source": order.count_source,
            "count_ambiguous": order.count_ambiguous,
            "count_note": order.count_note,
            "answer_notes": list(order.answer_notes),
        },
        "angles": angle_rows,
        "candidates": [
            {
                # The id, not the name, is what anything filed against this
                # candidate has to key on. Two rows may legitimately show one
                # name; they are never one candidate.
                "candidate_id": c.candidate_id,
                "name": c.name,
                "district": c.district,
                "evidence": c.evidence,
                "found_by": list(c.found_by),
                "overlap": c.overlap,
                "possible_duplicates": list(c.possible_duplicates),
                "possible_duplicate_ids": list(c.possible_duplicate_ids),
                # What the cut check said about this place, if anything has
                # looked. Read from storage rather than recomputed: judging
                # costs a model call, and drawing a screen must not.
                "barred": barred.get(c.name, {}).get("why", ""),
                "barred_confidence": barred.get(c.name, {}).get("confidence", ""),
                "sightings": [
                    {
                        "sighting_id": s.sighting_id,
                        "angle": s.angle,
                        "name": s.name,
                        "district": s.district,
                        "evidence": s.evidence,
                    }
                    for s in c.sightings
                ],
            }
            for c in candidates
        ],
    }
    return payload
