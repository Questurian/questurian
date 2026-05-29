"""Per-day travel ordering — the `order_day` seam (ADR 0014).

v1 orders a day's stops with greedy nearest-neighbor from the Lodging Anchor
using straight-line (Haversine) distance. There are no time windows, so this is
the only constraint. This whole module is the seam: if time slots are ever
added, swap the greedy body for beam search behind the same `order_day(...)`
signature and nothing upstream changes.
"""

from __future__ import annotations

import math
from typing import Callable

from .schemas import Candidate

Coord = tuple[float, float]


def haversine_km(a: Coord, b: Coord) -> float:
    """Great-circle distance in kilometres between two (lat, lng) points."""
    lat1, lng1 = a
    lat2, lng2 = b
    radius = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * radius * math.asin(min(1.0, math.sqrt(h)))


def _coord(candidate: Candidate) -> Coord | None:
    if candidate.latitude is None or candidate.longitude is None:
        return None
    return (candidate.latitude, candidate.longitude)


def order_day(
    stops: list[Candidate],
    anchor: Coord | None,
    *,
    distance_fn: Callable[[Coord, Coord], float] = haversine_km,
) -> list[Candidate]:
    """Order `stops` to minimize travel from `anchor` (greedy nearest-neighbor).

    Stops without coordinates can't be ordered spatially, so they're appended in
    their original order after the geocoded ones. When there's no anchor, the
    first geocoded stop seeds the walk (origin = the centroid-nearest stop).
    """
    geocoded = [s for s in stops if _coord(s) is not None]
    ungeocoded = [s for s in stops if _coord(s) is None]
    if len(geocoded) <= 1:
        return geocoded + ungeocoded

    remaining = list(geocoded)
    ordered: list[Candidate] = []

    if anchor is not None:
        current = anchor
    else:
        # Seed from the stop closest to the centroid → a stable, central start.
        lat = sum(_coord(s)[0] for s in geocoded) / len(geocoded)  # type: ignore[index]
        lng = sum(_coord(s)[1] for s in geocoded) / len(geocoded)  # type: ignore[index]
        centroid = (lat, lng)
        seed = min(remaining, key=lambda s: distance_fn(centroid, _coord(s)))  # type: ignore[arg-type]
        remaining.remove(seed)
        ordered.append(seed)
        current = _coord(seed)  # type: ignore[assignment]

    while remaining:
        nxt = min(remaining, key=lambda s: distance_fn(current, _coord(s)))  # type: ignore[arg-type]
        remaining.remove(nxt)
        ordered.append(nxt)
        current = _coord(nxt)  # type: ignore[assignment]

    return ordered + ungeocoded
