"""Turning a name a search returned into the identity of a real building.

A name is not an identity. Inside one run the searches returned "Bar Inglés"
and "Bar Inglés del Country Club" as two bars, and "Gran Hotel Bolívar" and
"Gran Hotel Bolívar (Bar Catedral)" as two hotels. Stretch that across months,
across listicles, and across Spanish and English sources, and name matching
stops being a heuristic with rough edges and becomes a store full of split and
merged places.

A Google Place ID is stable across all of that, and Location Manager is already
keyed on it -- `place-details.client.ts` resolves places by text search and
stores `placeId` on its records. Using the same anchor is what lets a profile
and an LM record point at one building without either owning the other.

No key, no resolution
---------------------
`GOOGLE_MAPS_API_KEY` lives in Location Manager's environment, not this app's.
Until it is set here, resolution is skipped and profiles keep their provisional
name-and-city key: they still gather claims, still accumulate sightings, and
gain their anchor the first time a resolution pass runs.

Degrading is deliberate. Refusing to open a profile without an API key would
stop the whole pipeline over a setting, and a profile that is merely
unanchored is useful now and repairable later.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)

_TEXT_SEARCH = "https://maps.googleapis.com/maps/api/place/textsearch/json"
RESOLVE_TIMEOUT_SECONDS = 15


@dataclass(frozen=True)
class ResolvedPlace:
    place_id: str
    name: str
    address: str
    # What Google says this place is. `lodging`, `restaurant`, `bar`,
    # `point_of_interest`. Kept because it is the cheapest existence-and-kind
    # check there is: a row that resolves to a `transit_station` or does not
    # resolve at all is the junk the search runner could not filter by name.
    types: tuple[str, ...] = ()
    permanently_closed: bool = False


def api_key() -> str:
    return os.getenv("GOOGLE_MAPS_API_KEY", "").strip()


def resolve(name: str, city: str) -> ResolvedPlace | None:
    """Find the one real place this name refers to, or nothing.

    Returns None when there is no key, when nothing matches, or when the call
    fails. All three mean the same thing to the caller -- carry on unanchored
    -- and are distinguished only in the log, because a missing key is a
    setting and a failed call is a network.
    """
    key = api_key()
    if not key:
        logger.info(
            "No GOOGLE_MAPS_API_KEY set; leaving %r unresolved. It is in "
            "Location Manager's environment.",
            name,
        )
        return None

    import requests  # imported here so the module loads without the dependency

    query = f"{name} {city}".strip()
    try:
        response = requests.get(
            _TEXT_SEARCH,
            params={"query": query, "key": key},
            timeout=RESOLVE_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
    except Exception as exc:  # pragma: no cover -- network dependent
        logger.warning("Place lookup failed for %r: %s", query, exc)
        return None

    results = body.get("results") or []
    if not results:
        # Not an error. A name nothing matches is a finding about the row: it
        # is probably not one named business, which is exactly what the list
        # needs to know before anyone writes about it.
        logger.info("No place matched %r", query)
        return None

    top = results[0]
    return ResolvedPlace(
        place_id=str(top.get("place_id") or ""),
        name=str(top.get("name") or name),
        address=str(top.get("formatted_address") or ""),
        types=tuple(str(t) for t in (top.get("types") or [])),
        permanently_closed=str(top.get("business_status") or "") == "CLOSED_PERMANENTLY",
    )
