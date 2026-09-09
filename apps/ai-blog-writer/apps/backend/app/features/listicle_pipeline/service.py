"""Starting and advancing a listicle interview.

Everything mechanical about the interview -- the loop, the single retry, the
mid-interview lookup budget, the pushback, the "accepted draft is not new
information" rule, the stop condition -- comes from
`prompt2blog.grill_v4` untouched. This module supplies the two things that
make it a listicle: the checklist it has to settle, and the prompt it asks
with.

That split is the point. Every bug worth fixing in the article grill lived in
the loop, and a forked copy of it would have to be fixed twice and would be
fixed once.
"""

from __future__ import annotations

import logging
import uuid

from ..prompt2blog.contracts_v4 import GrillState
from .profiles import PlaceProfile
from ..prompt2blog.grill_v4 import (
    GrillDependencies,
    answer_grill,
    reopen_grill,
    start_grill,
)
from . import runner, spec, store
from .contracts import LISTICLE_MARKER_KEYS, SearchOrder
from .prompts import build_listicle_turn_prompt

logger = logging.getLogger(__name__)


def _dependencies(base: GrillDependencies) -> GrillDependencies:
    """The article grill's dependencies, pointed at the listicle prompt.

    `job_id` is carried through, and that is the entire fix for a real bug:
    this function used to build a fresh `GrillDependencies` and take the
    default, so every listicle interview reported itself as `p2b.grill`. The
    caller was already setting `listicle.grill` and it was being dropped one
    line later -- which meant the usage dashboard attributed listicle spend to
    Prompt2Blog, and the model gateway answered for the wrong job when someone
    changed the listicle grill's model.
    """
    return GrillDependencies(
        llm=base.llm,
        research=base.research,
        job_id=base.job_id,
        model_name=base.model_name,
        build_prompt=build_listicle_turn_prompt,
    )


def start(seed: str, base: GrillDependencies) -> GrillState:
    run_id = uuid.uuid4().hex[:8]
    state = start_grill(
        run_id=run_id,
        seed=seed,
        dependencies=_dependencies(base),
        marker_keys=LISTICLE_MARKER_KEYS,
    )
    store.save(state)
    return state


def answer(
    run_id: str,
    text: str,
    base: GrillDependencies,
    selections: list[dict] | None = None,
) -> GrillState:
    """One turn, plus whatever structure the screen knew about the answer.

    `selections` is the angle picker's own record of what was ticked, edited or
    written. The transcript still stores the operator's text verbatim, because
    that is what the interview agreed to; the records are stored beside it so
    the order does not have to reconstruct a shape from a sentence.
    """
    state = store.load(run_id)
    if state is None:
        raise LookupError(f"No listicle interview with id {run_id}")
    if selections:
        store.save_selections(run_id, selections)
    state = answer_grill(state, text, _dependencies(base))
    store.save(state)
    if state.status == "agreed":
        # Written down at the moment of agreement, so what the screen shows
        # next and what the searches run from are one object rather than two
        # readings of a paragraph.
        _ensure_order(state)
    return state


def reopen(run_id: str, base: GrillDependencies) -> GrillState:
    """Not quite -- keep talking. Sends an agreed interview back to asking."""
    state = store.load(run_id)
    if state is None:
        raise LookupError(f"No listicle interview with id {run_id}")
    state = reopen_grill(state, _dependencies(base))
    store.save(state)
    return state


def get(run_id: str) -> GrillState | None:
    return store.load(run_id)


def _ensure_order(state: GrillState) -> SearchOrder:
    """The agreed order, built once and kept.

    Rebuilt only when there is none. An order that already exists may have been
    corrected by the operator, and regenerating it from the transcript would
    silently undo that correction -- which is the same class of bug as reading
    the count out of prose, one layer up.
    """
    existing = store.load_order(state.run_id)
    if existing is not None:
        return existing
    order = spec.build_search_order(
        state, revision=1, selections=store.load_selections(state.run_id)
    )
    store.save_order(order)
    return order


def order(run_id: str) -> SearchOrder | None:
    """The order as it stands, built from the interview if it has agreed."""
    existing = store.load_order(run_id)
    if existing is not None:
        return existing
    state = store.load(run_id)
    if state is None or state.status != "agreed":
        return None
    return _ensure_order(state)


def revise_order(
    run_id: str,
    *,
    target_count: int | None = None,
    angles: list[dict] | None = None,
    standard: str | None = None,
    exclusions: str | None = None,
) -> SearchOrder:
    """Correct the agreement, at a new revision.

    A correction is not an edit in place. Results already gathered answered the
    previous request, and the only way to say so honestly is for the previous
    request to still exist -- so a revision is added rather than the old one
    overwritten, and every stored result is re-checked against the new request
    before it is shown as current.
    """
    current = order(run_id)
    if current is None:
        raise LookupError(f"No agreed search order for run {run_id}")

    updated = current.model_copy(deep=True)
    updated.revision = store.next_revision(run_id)
    if target_count is not None:
        if not 1 <= target_count <= 200:
            raise ValueError("A list length has to be between 1 and 200.")
        updated.target_count = target_count
        updated.count_source = "corrected by operator"
        updated.count_ambiguous = False
        updated.count_note = ""
    # The bar and the cut can be typed out here because they may have been
    # assembled from two answers rather than given once. A combined value is
    # the safe reading and not necessarily the right one -- it keeps a rule the
    # operator may have meant to drop -- so the only honest way to combine is
    # to leave a way to disagree. Correcting one clears its note: it was a
    # question about an inference, and there is no longer an inference.
    if standard is not None:
        updated.standard = standard.strip()
        updated.answer_notes = spec.drop_note_for(updated.answer_notes, "bar")
    if exclusions is not None:
        updated.exclusions = exclusions.strip()
        updated.answer_notes = spec.drop_note_for(updated.answer_notes, "cut")
    if angles is not None:
        if not angles:
            raise ValueError("An order with no searches in it cannot be run.")
        from .contracts import SelectedAngle

        rebuilt: list[SelectedAngle] = []
        for index, entry in enumerate(angles):
            text = str(entry.get("text", "")).strip()
            if not text:
                continue
            previous = next(
                (a for a in current.angles if a.angle_id == entry.get("angle_id")),
                None,
            )
            shape_key = str(entry.get("shape_key", "") or (previous.shape_key if previous else ""))
            rebuilt.append(
                SelectedAngle(
                    angle_id=str(entry.get("angle_id") or f"a{index + 1}"),
                    text=text,
                    shape_key=shape_key,
                    group=str(entry.get("group", "") or (previous.group if previous else "")),
                    role=str(entry.get("role") or (previous.role if previous else "broad")),
                    # An angle whose wording changed is an angle whose stored
                    # result no longer answers it. Marked here so the
                    # fingerprint changes and the reuse check refuses it.
                    edited=bool(entry.get("edited"))
                    or (previous is not None and previous.text != text),
                    custom=bool(entry.get("custom")) or not shape_key,
                )
            )
        if not rebuilt:
            raise ValueError("An order with no searches in it cannot be run.")
        updated.angles = rebuilt

    from .search import role_allowances

    allowances = role_allowances(
        updated.target_count, [a.role for a in updated.angles]
    )
    for angle, allowance in zip(updated.angles, allowances):
        angle.wanted = allowance

    store.save_order(updated)
    return updated


def search(
    run_id: str,
    research,
    *,
    only: list[str] | None = None,
    reuse: bool = True,
) -> dict:
    """Run the agreed search order and pool what comes back.

    Refuses to run before the interview has agreed. A half-settled order is
    missing the angles, and searching without them is six searches for whatever
    the seed happened to say -- which is the single-search failure the split
    exists to avoid, at six times the cost.

    `only` runs a named subset, which is how a retry costs one search rather
    than six. `reuse=False` is the deliberate full refresh.
    """
    state = store.load(run_id)
    if state is None:
        raise LookupError(f"No listicle interview with id {run_id}")
    if state.status != "agreed":
        raise ValueError(
            "This interview has not agreed a search order yet, so there is "
            "nothing to search for."
        )

    current = _ensure_order(state)
    if not current.angles:
        raise ValueError("The agreed interview carries no angles to search.")

    if not store.claim_batch(run_id, current.revision):
        raise ValueError(
            "These searches are already running for this order. Wait for them "
            "rather than starting a second set."
        )
    try:
        payload = runner.run_order(current, research, only=only, reuse=reuse)
    finally:
        # Released whatever happened, so a failed batch does not lock the run
        # out of the retry that is the point of storing attempts separately.
        store.release_batch(run_id)
    store.save_results(run_id, payload)
    return payload


def progress(run_id: str) -> dict | None:
    """What the run knows, without running anything.

    This is what a reopened page reads. It never searches: opening a screen is
    not a decision to spend, and the version this replaced had no way to tell
    "nothing stored" from "not read yet", so a reload looked like a run that
    had never happened.
    """
    current = order(run_id)
    if current is None:
        # No agreed order, which for a run with stored results means one from
        # before orders were recorded. Read through the same upgrade so the
        # screen never receives a payload with fields missing.
        stored = store.load_results(run_id)
        if stored is None:
            return None
        return _upgrade_legacy(
            stored,
            SearchOrder(
                run_id=run_id,
                revision=0,
                target_count=max(1, int(stored.get("target") or 20)),
            ),
        )
    assembled = runner.assemble(current)
    if assembled["rows_returned"] == 0 and not any(
        row["state"] != "not_started" for row in assembled["angles"]
    ):
        # Nothing has been run under this order. An older blob may still exist
        # from before attempts were stored per angle, and it is a real result.
        legacy = store.load_results(run_id)
        if legacy is not None and legacy.get("candidates"):
            return _upgrade_legacy(legacy, current)
        return None
    return assembled


def _upgrade_legacy(stored: dict, current: "SearchOrder") -> dict:
    """An old stored result, read into the shape the screen now expects.

    Runs from before work was recorded per angle are real results and they open.
    What they cannot do is name their searches -- there are no attempts behind
    them -- so every field the new screen reads is filled with the honest
    default rather than left missing. A missing field is not a smaller version
    of a result; it is a crash on a page the operator opened expecting their
    research.
    """
    candidates = [
        {
            "name": row.get("name", ""),
            "district": row.get("district", ""),
            "evidence": row.get("evidence", ""),
            "found_by": list(row.get("found_by", [])),
            "overlap": row.get("overlap", len(row.get("found_by", []))),
            # Neither was recorded at the time. Empty is the truthful answer:
            # nothing was checked, rather than nothing was found.
            "possible_duplicates": [],
            "sightings": [],
        }
        for row in stored.get("candidates", [])
    ]
    angles = [
        {
            "angle_id": row.get("angle_id", ""),
            "angle": row.get("angle", ""),
            "shape": "",
            "group": "",
            "role": "broad",
            "wanted": 0,
            "edited": False,
            "custom": False,
            "state": "failed" if row.get("failed") else "completed",
            "failed": bool(row.get("failed")),
            "rows": row.get("rows", 0),
            "sources": row.get("sources", 0),
            "reason": row.get("reason", ""),
            "found": 0,
            "shared": 0,
            "exclusive": 0,
            "gathered_at": "",
            "reused": False,
        }
        for row in stored.get("angles", [])
    ]
    target = stored.get("target", current.target_count)
    return {
        "run_id": current.run_id,
        "revision": stored.get("revision", 0),
        "target": target,
        "found": stored.get("found", len(candidates)),
        "shortfall": stored.get("shortfall", max(0, target - len(candidates))),
        "rows_returned": stored.get("rows_returned", 0),
        "running": False,
        "complete": not any(row["failed"] for row in angles),
        "uncertain_identity": 0,
        "capacity": 0,
        "empty_handed": [],
        "capacity_warning": "",
        "order": {
            "kind": current.kind,
            "place": current.place,
            "target_count": target,
            "standard": current.standard,
            "exclusions": current.exclusions,
            "count_source": current.count_source,
            "count_ambiguous": current.count_ambiguous,
            "count_note": current.count_note,
            "answer_notes": list(current.answer_notes),
        },
        "angles": angles,
        "candidates": candidates,
        # Read by the screen, which then says individual searches cannot be
        # re-run from here rather than offering a button that would do nothing.
        "legacy": True,
    }


def results(run_id: str) -> dict | None:
    """What a previous run found, assembled fresh from the stored attempts."""
    return progress(run_id)


def build_profile(
    *,
    name: str,
    city: str,
    district: str = "",
    angles: list[str] | None = None,
    run_id: str = "",
    research=None,
    resolve_identity: bool = True,
) -> "PlaceProfile":
    """Open this place's profile, anchor it, and gather what has been said.

    Deliberately not called by the search step. A profile is worth building for
    a candidate that survives, and wiring this in would research every row
    returned -- around forty on a real run -- including the ones that are there
    to be thrown away.

    `gate.assess` exists and is tested, but it answers one question: is enough
    published about this place to write about it. It does not answer whether
    the place breaks the cut, and the two are not the same question. Run
    33fca394 returned eight Nikkei and Japanese restaurants against an explicit
    "no places where ceviche is not the primary offering", and every one of
    them is written about constantly -- so a wired gate would have passed all
    eight. Checking the cut is a separate judgement about each place, and it is
    not built.

    Running it twice on the same place is safe and is the normal case: the
    profile is found rather than created, claims already held are not added
    again, and a sighting from a run already recorded is ignored.
    """
    from .profiles import Sighting
    from . import identity, places, profile_research, profile_store

    place_id = ""
    address = ""
    lookup_name = name
    if resolve_identity:
        resolved = identity.resolve(name, city)
        if resolved is not None:
            place_id = resolved.place_id
            address = resolved.address
            # The name Google holds, not the one a search happened to write.
            # "Bar Rovira del Callao" is really "Tradición Chalaca Rovira
            # 1907", and looking a place up under a name it does not use is
            # how a lookup comes back thin.
            lookup_name = resolved.name or name
            if resolved.permanently_closed:
                # Recorded rather than acted on. Whether a closed place stays
                # on a list is the gate's decision and the operator's, not
                # this step's.
                logger.warning("%r resolves to a permanently closed place", name)
            if not resolved.is_venue:
                logger.warning(
                    "%r resolves to %s, which is not somewhere a reader can be "
                    "served", name, ", ".join(resolved.types) or "nothing",
                )

    profile = profile_store.open_profile(
        name=name, city=city, district=district, place_id=place_id
    )

    for angle in angles or []:
        if run_id:
            profile_store.add_sighting(
                profile.profile_id, Sighting(angle=angle, run_id=run_id)
            )

    # What Google holds, before anything a model read. Cheap, factual, and the
    # only material in a profile no model wrote -- and the only source of the
    # customer voice a cheap-eats or value angle is written from.
    if place_id:
        details = places.fetch_details(place_id)
        if details.failed:
            logger.warning(
                "Place details unavailable for %r: %s", name, details.reason
            )
        else:
            added = profile_store.add_claims(
                profile.profile_id, places.claims_from(details)
            )
            logger.info("Profile %s: %s claims from Places", profile.profile_id, added)

    if research is not None:
        result = profile_research.research_place(
            lookup_name, city, list(angles or []), research, address=address
        )
        if result.failed:
            # Raised rather than logged. A profile recorded as having nothing
            # written about it, when the truth is the call never ran, is a
            # place the gate will drop for the network's mistake.
            raise RuntimeError(
                f"Research for {name!r} failed ({result.reason}); the profile "
                "was left as it was rather than recorded as empty."
            )
        added = profile_store.add_claims(profile.profile_id, result.claims)
        logger.info(
            "Profile %s: %s claims found, %s new%s",
            profile.profile_id,
            len(result.claims),
            added,
            f" -- {result.reason}" if result.reason else "",
        )

    refreshed = profile_store.find(
        place_id=profile.place_id, name=name, city=city
    )
    return refreshed or profile
