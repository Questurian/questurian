"""Candidate retrieval — deterministic Payload REST reads + per-collection
normalization into a flat `Candidate` (ADR 0014/0015).

Each collection nests its signals differently (dining is flat; accommodations
and nightlife bury tags in groups; nightlife stores price as `priceTier`). We
normalize all of that at read time so the rest of the pipeline never has to
know which tab a value came from.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

import httpx

from app.core.payload_api import resolve_payload_api_url

from .schemas import Candidate, Category

logger = logging.getLogger(__name__)

# Pull a broad pool per category; the data is small (largest collection ~117
# across ALL locations), so a per-location slice is tiny and we let the scorer
# rank rather than over-filtering in the query.
POOL_LIMIT = 100
REQUEST_TIMEOUT_SECONDS = 20.0


def _location_where(
    location_key: str, shared_neighborhoods: list[int]
) -> dict[str, str]:
    """Scope a query to the itinerary's location.

    Data collections only expose the composite `location` key (`country|city|
    neighborhood`) and the `locationRef` relationship — not separate country/
    city fields. When the operator pins shared neighborhoods we match those refs
    exactly; otherwise we prefix-match the location key with `like`.
    """
    if shared_neighborhoods:
        return {
            "where[locationRef][in]": ",".join(str(i) for i in shared_neighborhoods)
        }

    parts = [p.strip() for p in location_key.split("|") if p.strip()]
    if not parts:
        return {}
    return {"where[location][like]": "|".join(parts)}


def _as_int_price(value: Any) -> int | None:
    """Coerce a top-level `priceLevel` ('1'..'4') to int."""
    try:
        n = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 4 else None


def _price_tier_to_int(value: Any) -> int | None:
    """Nightlife stores price as a `$`-string tier; count the glyphs."""
    if not isinstance(value, str):
        return None
    n = value.count("$")
    return n if 1 <= n <= 4 else None


def _get(obj: Any, *path: str) -> Any:
    cur = obj
    for key in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def _collect_tags(*values: Any) -> list[str]:
    """Flatten string / string[] signals into a de-duplicated tag list."""
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        items: Iterable[Any]
        if isinstance(value, str):
            items = [value]
        elif isinstance(value, (list, tuple)):
            items = value
        else:
            items = []
        for item in items:
            if isinstance(item, str):
                tag = item.strip()
                if tag and tag.lower() not in seen:
                    seen.add(tag.lower())
                    out.append(tag)
    return out


def _amenity_tags(stay: Any) -> list[str]:
    """Turn accommodation boolean amenities that are True into tags."""
    labels = {
        "kidFriendly": "Kid Friendly",
        "ac": "AC",
        "wifi": "WiFi",
        "breakfastServed": "Breakfast",
        "restaurant": "Restaurant",
        "rooftopLounge": "Rooftop Lounge",
    }
    if not isinstance(stay, dict):
        return []
    return [label for key, label in labels.items() if stay.get(key) is True]


def _neighborhood_key(location: Any) -> str | None:
    if not isinstance(location, str):
        return None
    parts = [p.strip() for p in location.split("|") if p.strip()]
    return parts[2] if len(parts) >= 3 else None


def _normalize(doc: dict[str, Any], category: Category) -> Candidate | None:
    doc_id = doc.get("id")
    title = doc.get("title")
    if not isinstance(doc_id, int) or not isinstance(title, str) or not title.strip():
        return None

    price_level = _as_int_price(doc.get("priceLevel"))
    tags: list[str]
    type_text: str | None = (
        doc.get("type") if isinstance(doc.get("type"), str) else None
    )

    if category == "dining":
        tags = _collect_tags(doc.get("cuisines"), doc.get("idealFor"), doc.get("type"))
    elif category == "accommodations":
        tags = _collect_tags(
            _get(doc, "theStay", "perfectFor"),
            _get(doc, "theExperience", "vibe"),
            _get(doc, "theDetails", "walkability"),
            *_amenity_tags(doc.get("theStay")),
            *_amenity_tags(doc.get("theExperience")),
        )
    elif category == "attractions":
        attraction_type = _get(doc, "attractionsDetails", "core", "attractionType")
        tags = _collect_tags(attraction_type, doc.get("type"))
        if isinstance(attraction_type, str) and not type_text:
            type_text = attraction_type
    else:  # nightlife
        if price_level is None:
            price_level = _price_tier_to_int(
                _get(doc, "nightlifeDetails", "core", "priceTier")
            )
        tags = _collect_tags(
            _get(doc, "nightlifeDetails", "core", "music"),
            _get(doc, "nightlifeDetails", "core", "idealFor"),
            _get(doc, "nightlifeDetails", "theSpace", "vibe"),
            _get(doc, "nightlifeDetails", "theScene", "dressCode"),
            _get(doc, "nightlifeDetails", "theScene", "energyLevel"),
            _get(doc, "nightlifeDetails", "theScene", "crowdProfile"),
        )
        club_type = _get(doc, "nightlifeDetails", "core", "clubType")
        if isinstance(club_type, str) and not type_text:
            type_text = club_type

    def _coord(value: Any) -> float | None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    return Candidate(
        id=doc_id,
        title=title.strip(),
        category=category,
        price_level=price_level,
        tags=tags,
        type=type_text,
        latitude=_coord(doc.get("latitude")),
        longitude=_coord(doc.get("longitude")),
        neighborhood_key=_neighborhood_key(doc.get("location")),
    )


async def fetch_candidates(
    *,
    category: Category,
    location_key: str,
    shared_neighborhoods: list[int],
    jwt_token: str,
) -> list[Candidate]:
    """Fetch and normalize one category's candidate pool, scoped to location."""
    base_url = resolve_payload_api_url().rstrip("/")
    params: dict[str, str] = {
        "limit": str(POOL_LIMIT),
        "depth": "0",
        "where[status][equals]": "published",
        **_location_where(location_key, shared_neighborhoods),
    }
    headers = {"Authorization": f"JWT {jwt_token}"} if jwt_token else {}

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{base_url}/api/{category}", params=params, headers=headers
            )
            response.raise_for_status()
            docs = response.json().get("docs", [])
    except httpx.HTTPError as exc:
        logger.warning("Candidate fetch failed for %s: %s", category, exc)
        return []

    candidates: list[Candidate] = []
    for doc in docs:
        if isinstance(doc, dict):
            normalized = _normalize(doc, category)
            if normalized is not None:
                candidates.append(normalized)
    return candidates
