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

from .contracts import SearchAttempt, SearchOrder
from . import store
from .search import (
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


def _request_for(order: SearchOrder, angle) -> AngleRequest:
    return AngleRequest(
        angle_id=angle.angle_id,
        text=angle.text,
        role=angle.role,
        wanted=angle.wanted,
        shape_key=angle.shape_key,
        group=angle.group,
        edited=angle.edited,
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


def _sightings_of(attempt: SearchAttempt) -> list[Sighting]:
    return [
        Sighting(
            angle=row.get("angle", attempt.angle_text),
            angle_id=row.get("angle_id", attempt.angle_id),
            name=row.get("name", ""),
            district=row.get("district", ""),
            evidence=row.get("evidence", ""),
        )
        for row in attempt.sightings
        if row.get("name")
    ]


def run_order(
    order: SearchOrder,
    research,
    *,
    only: list[str] | None = None,
    reuse: bool = True,
) -> dict:
    """Run the angles that need running, and assemble what the run now knows.

    `only` names the angles to run; everything else is read from storage. That
    is what makes a retry precise -- the operator re-runs the one search that
    timed out and pays for one search.

    `reuse` off is the deliberate full refresh: the operator wants new
    research, knows it costs, and asked for it.
    """
    stored = {a.angle_id: a for a in _latest_by_angle(store.load_attempts(order.run_id))}
    wanted_ids = set(only) if only is not None else None

    for angle in order.angles:
        request = _request_for(order, angle)
        fingerprint = order.angle_fingerprint(angle)
        should_run = wanted_ids is None or angle.angle_id in wanted_ids
        if should_run and reuse:
            existing = reusable_attempt(order, angle, list(stored.values()))
            if existing is not None:
                # Re-filed under this revision so the assembled view is a view
                # of one revision, while `gathered_at` still says when the work
                # was actually done.
                carried = existing.model_copy(
                    update={"revision": order.revision, "wanted": angle.wanted}
                )
                store.save_attempt(carried)
                stored[angle.angle_id] = carried
                continue
        if not should_run:
            continue

        running = SearchAttempt(
            run_id=order.run_id,
            revision=order.revision,
            angle_id=angle.angle_id,
            angle_text=angle.text,
            role=angle.role,
            wanted=angle.wanted,
            request_fingerprint=fingerprint,
            state="running",
            started_at=_now(),
        )
        store.save_attempt(running)
        stored[angle.angle_id] = running

        result, sightings = run_one_angle(
            request,
            kind=order.kind,
            place=order.place,
            exclusions=order.exclusions,
            standard=order.standard,
            research=research,
        )
        finished = running.model_copy(
            update={
                "state": "failed" if result.failed else "completed",
                "rows": result.rows,
                "sources": result.sources,
                "reason": result.reason,
                "source_urls": result.source_urls,
                "source_titles": result.source_titles,
                "sightings": [
                    {
                        "angle": s.angle,
                        "angle_id": s.angle_id,
                        "name": s.name,
                        "district": s.district,
                        "evidence": s.evidence,
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
        stored[angle.angle_id] = finished

    return assemble(order)


def _latest_by_angle(attempts: list[SearchAttempt]) -> list[SearchAttempt]:
    best: dict[str, SearchAttempt] = {}
    for attempt in attempts:
        current = best.get(attempt.angle_id)
        if current is None or (attempt.revision, attempt.finished_at) >= (
            current.revision,
            current.finished_at,
        ):
            best[attempt.angle_id] = attempt
    return list(best.values())


def _current_attempts(order: SearchOrder) -> dict[str, SearchAttempt]:
    """The attempt that speaks for each angle right now.

    This revision's attempt when there is one, because that is the live work
    -- running, failed or finished. Otherwise a completed attempt from an
    earlier revision whose request fingerprint still matches, which is the
    reuse rule stated once: a stored result belongs to a request, not to a
    revision number.

    Reading it this way is what stops a corrected count blanking the screen. An
    order revised to fix one angle leaves five angles asking exactly what they
    asked before, and their results are still answers to their questions.
    """
    stored = store.load_attempts(order.run_id)
    chosen: dict[str, SearchAttempt] = {}
    for angle in order.angles:
        mine = [
            a
            for a in stored
            if a.angle_id == angle.angle_id and a.revision == order.revision
        ]
        if mine:
            chosen[angle.angle_id] = max(mine, key=lambda a: a.finished_at)
            continue
        fingerprint = order.angle_fingerprint(angle)
        reusable = [
            a
            for a in stored
            if a.angle_id == angle.angle_id
            and a.state == "completed"
            and a.request_fingerprint == fingerprint
        ]
        if reusable:
            chosen[angle.angle_id] = max(
                reusable, key=lambda a: (a.revision, a.finished_at)
            )
    return chosen


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
    candidates: list[Candidate] = sorted(
        pool_sightings(sightings), key=lambda c: (-c.overlap, c.name.lower())
    )

    angle_rows = []
    for angle in order.angles:
        attempt = by_angle.get(angle.angle_id)
        state = _state_of(attempt, running)
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
                # Kept for the screen that has always read these.
                "failed": state in {"failed", "interrupted"},
                "rows": attempt.rows if attempt else 0,
                "sources": attempt.sources if attempt else 0,
                "reason": (
                    attempt.reason
                    if attempt
                    else "this search has not been run yet"
                )
                if state != "interrupted"
                else "it never came back; re-running it may be charged again",
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
            }
        )

    uncertain = sum(1 for c in candidates if c.possible_duplicates)
    capacity = planned_capacity(order)
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
        # Said plainly rather than left to be worked out. A distinct count is
        # provisional while any two rows might be one venue, and a screen that
        # prints one number implies a certainty this step has not got.
        "uncertain_identity": uncertain,
        "capacity": capacity,
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
                "name": c.name,
                "district": c.district,
                "evidence": c.evidence,
                "found_by": list(c.found_by),
                "overlap": c.overlap,
                "possible_duplicates": list(c.possible_duplicates),
                "sightings": [
                    {
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
