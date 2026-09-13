"""Which places on a list Location Manager already holds.

A listicle can only be published about places Location Manager has: the page
is built from its records. So a place with a finished blurb is not finished
until it is there too, and this is the check that says so.

Matched on Google's Place ID, which both sides store -- this one from the
Google check on the board, Location Manager from its own Google lookup. Never
on the name: two branches share a name, and one place is spelt three ways.

Matched inside one category only: the run's listicle type. Location Manager
keeps a place that is both a restaurant and a bar as two locations, one dining
and one nightlife, and a dining list needs the dining one. A place held only as
nightlife is not in Location Manager as far as a dining list is concerned.

A separate read from the board. The board is drawn from this app's own
database and must open when Location Manager is not running; this answer is
asked for after it, and a failure here says "could not check", never "missing".
"""

from __future__ import annotations

from dataclasses import dataclass, field

import requests

from app import config

from . import candidate_prep, store

LOOKUP_TIMEOUT_SECONDS = 5
LOOKUP_PATH = "/api/locations/by-place-ids"


class LocationManagerUnavailable(Exception):
    """Location Manager did not answer, or answered with something unreadable."""


def lookup(place_ids: list[str]) -> dict[str, list[dict]]:
    """Every Location Manager row holding each Place ID, keyed by the ID.

    An ID with no rows maps to an empty list. More than one row is returned as
    it is: Location Manager has pairs of rows sharing one ID, and choosing one
    here would hide that.
    """
    unique = sorted({place_id for place_id in place_ids if place_id})
    if not unique:
        return {}
    try:
        response = requests.post(
            f"{config.LM_API_URL.rstrip('/')}{LOOKUP_PATH}",
            json={"placeIds": unique},
            timeout=LOOKUP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        results = response.json()["data"]["results"]
        return {
            str(item["placeId"]): [
                {
                    "id": int(location["id"]),
                    "name": str(location["name"]),
                    "category": str(location["category"]),
                }
                for location in item["locations"]
            ]
            for item in results
        }
    except (requests.RequestException, ValueError, KeyError, TypeError) as error:
        raise LocationManagerUnavailable(
            f"Location Manager could not be asked ({config.LM_API_URL}): {error}"
        ) from error


@dataclass
class PlaceStatus:
    """Where one card's place stands in Location Manager.

    `status` is one of, always within the run's listicle type:
      - "present": exactly one location of that type has this Place ID
      - "several": more than one does -- a duplicate there to settle
      - "missing": none does, even if a location of another type has it
      - "no_place_id": the card has no Google Place ID, so nothing to match on
      - "no_type": the run's listicle type has not been chosen
      - "unchecked": Location Manager could not be asked
    """

    status: str
    place_id: str = ""
    # Matches in the run's type. Only these count.
    locations: list[dict] = field(default_factory=list)
    # Matches in other types. Said, so "missing" is not a surprise to someone
    # who has seen the place in Location Manager -- never counted.
    elsewhere: list[dict] = field(default_factory=list)
    # What Location Manager's Add form is opened with, so the operator does not
    # retype what this board already knows.
    prefill: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "place_id": self.place_id,
            "locations": self.locations,
            "elsewhere": self.elsewhere,
            "prefill": self.prefill,
        }


def board_status(run_id: str) -> dict:
    """Location Manager's answer for every place on one run."""
    ctx = candidate_prep.context(run_id)
    listicle_type = store.listicle_type(run_id)
    places: dict[str, dict] = {}
    for candidate_id, candidate in ctx.candidates.items():
        readiness = candidate_prep.readiness_of(ctx, candidate_id)
        prep = ctx.preps.get(candidate_id)
        places[candidate_id] = {
            "place_id": readiness.place_id,
            "prefill": {
                "name": readiness.google_name or candidate.get("name", ""),
                "address": readiness.google_address,
                "tripadvisor_url": prep.tripadvisor_url if prep else "",
            },
        }

    error = ""
    found: dict[str, list[dict]] | None = {}
    if listicle_type:
        try:
            found = lookup([place["place_id"] for place in places.values()])
        except LocationManagerUnavailable as failure:
            found = None
            error = str(failure)

    statuses = {}
    for candidate_id, place in places.items():
        place_id = place["place_id"]
        every = (found or {}).get(place_id, []) if place_id else []
        locations = [row for row in every if row["category"] == listicle_type]
        elsewhere = [row for row in every if row["category"] != listicle_type]
        if not place_id:
            status = "no_place_id"
        elif not listicle_type:
            status = "no_type"
        elif found is None:
            status = "unchecked"
        else:
            status = (
                "missing"
                if not locations
                else "present"
                if len(locations) == 1
                else "several"
            )
        statuses[candidate_id] = PlaceStatus(
            status=status,
            place_id=place_id,
            locations=locations,
            elsewhere=elsewhere,
            prefill=place["prefill"],
        ).as_dict()

    return {
        "run_id": run_id,
        "listicle_type": listicle_type,
        "available": found is not None,
        "error": error,
        "places": statuses,
    }
