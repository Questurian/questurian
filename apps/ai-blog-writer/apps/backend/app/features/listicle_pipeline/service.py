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
from . import spec, store
from .contracts import LISTICLE_MARKER_KEYS
from .prompts import build_listicle_turn_prompt
from .search import run_search_order

logger = logging.getLogger(__name__)


def _dependencies(base: GrillDependencies) -> GrillDependencies:
    """The article grill's dependencies, pointed at the listicle prompt."""
    return GrillDependencies(
        llm=base.llm,
        research=base.research,
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


def answer(run_id: str, text: str, base: GrillDependencies) -> GrillState:
    state = store.load(run_id)
    if state is None:
        raise LookupError(f"No listicle interview with id {run_id}")
    state = answer_grill(state, text, _dependencies(base))
    store.save(state)
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


def search(run_id: str, research) -> dict:
    """Run the agreed search order and pool what comes back.

    Refuses to run before the interview has agreed. A half-settled order is
    missing the angles, and searching without them is six searches for whatever
    the seed happened to say -- which is the single-search failure the split
    exists to avoid, at six times the cost.
    """
    state = store.load(run_id)
    if state is None:
        raise LookupError(f"No listicle interview with id {run_id}")
    if state.status != "agreed":
        raise ValueError(
            "This interview has not agreed a search order yet, so there is "
            "nothing to search for."
        )

    angles = spec.angles_from(state)
    if not angles:
        raise ValueError("The agreed interview carries no angles to search.")

    target = spec.count_from(state)
    candidates, results = run_search_order(
        angles,
        kind=spec.kind_from(state),
        place=spec.place_from(state),
        target_items=target,
        exclusions=spec.exclusions_from(state),
        standard=spec.standard_from(state),
        research=research,
    )
    payload = {
        "run_id": run_id,
        "target": target,
        # Said plainly rather than left to be worked out from the list length.
        # Whether the order filled the list is the only question this step was
        # built to answer.
        "found": len(candidates),
        "shortfall": max(0, target - len(candidates)),
        "rows_returned": sum(result.rows for result in results),
        "angles": [
            {
                "angle": r.angle,
                "rows": r.rows,
                "sources": r.sources,
                "failed": r.failed,
                "reason": r.reason,
            }
            for r in results
        ],
        "candidates": [
            {
                "name": c.name,
                "district": c.district,
                "evidence": c.evidence,
                "found_by": list(c.found_by),
                "overlap": c.overlap,
            }
            for c in candidates
        ],
    }
    store.save_results(run_id, payload)
    return payload


def results(run_id: str) -> dict | None:
    return store.load_results(run_id)


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
    a candidate that survives, and which candidates survive is what the gate --
    not yet built -- decides. Wiring this into the pipeline before that gate
    exists would research every row returned, including the ones the gate is
    there to throw away.

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
