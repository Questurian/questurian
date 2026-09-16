"""Location Manager's hotels for a trip's city, for the stay picker.

Read-only, and asked for separately from everything else: the itinerary must
open when Location Manager is not running, so a failure here says "could not
list hotels", never "there are none".

Matched on the city name inside Location Manager's own location path
("Peru > Lima > Miraflores"), because the trip's city is free text the
operator typed ("Lima, Peru"). The first comma-separated part of it is the
city; a trip with no city lists nothing rather than every hotel held.
"""

from __future__ import annotations

import requests

from app import config

LOOKUP_TIMEOUT_SECONDS = 5
LIST_PATH = "/api/accommodations-basic"


class HotelsUnavailable(Exception):
    """Location Manager did not answer, or answered with something unreadable."""


def _city(base_city: str) -> str:
    return base_city.split(",")[0].strip().casefold()


def _in_city(location: str, city: str) -> bool:
    parts = [part.strip().casefold() for part in location.split(">")]
    return city in parts[1:] or (len(parts) == 1 and parts[0] == city)


def _fetch() -> list[dict]:
    try:
        response = requests.get(
            f"{config.LM_API_URL.rstrip('/')}{LIST_PATH}", timeout=LOOKUP_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        return list(response.json()["data"]["locations"])
    except (requests.RequestException, ValueError, KeyError, TypeError) as error:
        raise HotelsUnavailable(
            f"Location Manager could not be asked ({config.LM_API_URL}): {error}"
        ) from error


def hotels_for(base_city: str, *, fetch=_fetch) -> dict:
    city = _city(base_city)
    if not city:
        return {"available": True, "error": "", "hotels": []}
    try:
        rows = fetch()
    except HotelsUnavailable as failure:
        return {"available": False, "error": str(failure), "hotels": []}
    hotels = []
    for row in rows:
        location = str(row.get("location") or "")
        if not _in_city(location, city):
            continue
        parts = [part.strip() for part in location.split(">")]
        hotels.append(
            {
                "id": int(row["id"]),
                "name": str(row.get("name") or row.get("title") or ""),
                "area": parts[2] if len(parts) > 2 else "",
                "type": str(row.get("type") or ""),
            }
        )
    hotels.sort(key=lambda hotel: (hotel["area"].casefold(), hotel["name"].casefold()))
    return {"available": True, "error": "", "hotels": hotels}
