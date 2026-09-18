"""Location Manager's hotels for a trip's city, for the stay picker.

Read-only, and asked for separately from everything else: the itinerary must
open when Location Manager is not running, so a failure here says "could not
list hotels", never "there are none".

Matched on the city name inside Location Manager's own location path
("Peru > Lima > Miraflores"), because the trip's city is free text the
operator typed ("Lima, Peru"). The first comma-separated part of it is the
city; a trip with no city lists nothing rather than every hotel held.

Each hotel carries one picture: the first uploaded image set, else the first
saved Instagram image. The pictures come from the full list for the city's
location key, one request, and a failure there costs the pictures only --
the names still list.
"""

from __future__ import annotations

import requests

from app import config

LOOKUP_TIMEOUT_SECONDS = 5
LIST_PATH = "/api/accommodations-basic"
FULL_LIST_PATH = "/api/accommodations"
IMAGE_ROOT = "data/images/"


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


def _fetch_full(location_key: str) -> list[dict]:
    try:
        response = requests.get(
            f"{config.LM_API_URL.rstrip('/')}{FULL_LIST_PATH}",
            params={"locationKey": location_key},
            timeout=LOOKUP_TIMEOUT_SECONDS * 2,
        )
        response.raise_for_status()
        body = response.json()
        rows = body["data"]["locations"] if isinstance(body, dict) else body
        return list(rows)
    except (requests.RequestException, ValueError, KeyError, TypeError) as error:
        raise HotelsUnavailable(str(error)) from error


def image_url(path: str) -> str:
    """Location Manager serves `data/images/<x>` at `/api/images/<x>`."""
    path = (path or "").strip()
    if not path.startswith(IMAGE_ROOT):
        return ""
    return f"{config.LM_API_URL.rstrip('/')}/api/images/{path[len(IMAGE_ROOT):]}"


def first_image(row: dict) -> str:
    for upload in row.get("uploads") or []:
        source = ((upload or {}).get("imageSet") or {}).get("sourceImage") or {}
        url = image_url(str(source.get("path") or ""))
        if url:
            return url
    for embed in row.get("instagram_embeds") or []:
        for path in (embed or {}).get("images") or []:
            url = image_url(str(path or ""))
            if url:
                return url
    return ""


def _city_key(location_key: str) -> str:
    return "|".join(location_key.split("|")[:2])


def hotels_for(base_city: str, *, fetch=_fetch, fetch_full=_fetch_full) -> dict:
    city = _city(base_city)
    if not city:
        return {"available": True, "error": "", "hotels": []}
    try:
        rows = fetch()
    except HotelsUnavailable as failure:
        return {"available": False, "error": str(failure), "hotels": []}
    hotels = []
    keys: set[str] = set()
    for row in rows:
        location = str(row.get("location") or "")
        if not _in_city(location, city):
            continue
        parts = [part.strip() for part in location.split(">")]
        if row.get("locationKey"):
            keys.add(_city_key(str(row["locationKey"])))
        hotels.append(
            {
                "id": int(row["id"]),
                "name": str(row.get("name") or row.get("title") or ""),
                "area": parts[2] if len(parts) > 2 else "",
                "type": str(row.get("type") or ""),
                "image": "",
            }
        )
    images: dict[int, str] = {}
    for key in sorted(keys):
        try:
            for full in fetch_full(key):
                if full.get("id") is not None:
                    images[int(full["id"])] = first_image(full)
        except HotelsUnavailable:
            continue
    for hotel in hotels:
        hotel["image"] = images.get(hotel["id"], "")
    hotels.sort(key=lambda hotel: (hotel["area"].casefold(), hotel["name"].casefold()))
    return {"available": True, "error": "", "hotels": hotels}
