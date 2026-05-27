"""Listicle Angle pools and category gates.

The Listicle Angle is always operator-selected (ADR 0010). This module no
longer assigns angles — it just exposes the per-category angle pool and the
category gates used elsewhere in the pipeline (anti-AI prompt block, lean
writer prompt + Writer Brief).

key_location has no pool yet (deferred).
"""

from __future__ import annotations

from typing import Literal

DiningAngle = Literal[
    "signature-dish",
    "atmosphere",
    "founders-backstory",
    "insider-tip",
    "best-for",
    "whats-different",
]

AccommodationsAngle = Literal[
    "location-and-setting",
    "view-and-vista",
    "design-and-aesthetic",
    "signature-amenity",
    "food-and-beverage",
    "trip-fit",
    "property-backstory",
    "booking-tip",
    "whats-different",
]

AttractionsAngle = Literal[
    "signature-feature",
    "setting",
    "history-built",
    "visit-time-tip",
    "best-for-visit-type",
    "whats-different",
]

NightlifeAngle = Literal[
    "best-for-night",
]

ListicleAngle = (
    DiningAngle | AccommodationsAngle | AttractionsAngle | NightlifeAngle
)

DINING_ANGLE_POOL: tuple[ListicleAngle, ...] = (
    "signature-dish",
    "atmosphere",
    "founders-backstory",
    "insider-tip",
    "best-for",
    "whats-different",
)

ACCOMMODATIONS_ANGLE_POOL: tuple[ListicleAngle, ...] = (
    "location-and-setting",
    "view-and-vista",
    "design-and-aesthetic",
    "signature-amenity",
    "food-and-beverage",
    "trip-fit",
    "property-backstory",
    "booking-tip",
    "whats-different",
)

ATTRACTIONS_ANGLE_POOL: tuple[ListicleAngle, ...] = (
    "signature-feature",
    "setting",
    "history-built",
    "visit-time-tip",
    "best-for-visit-type",
    "whats-different",
)

NIGHTLIFE_ANGLE_POOL: tuple[ListicleAngle, ...] = (
    "best-for-night",
)

# Categories whose blurbs use the anti-AI writer prompt block, Research
# Profile, and Writer Brief.
ANTI_AI_PROMPT_CATEGORIES: frozenset[str] = frozenset(
    {"dining", "nightlife", "accommodations"}
)

# Categories whose blurbs run through the lean writer prompt + Writer Brief
# curator (ADR 0007 nightlife, ADR 0009 dining, ADR 0011 accommodations).
# Orthogonal to ANTI_AI_PROMPT_CATEGORIES so a category can in principle opt
# into Research Profile + Writer Brief without flipping to the lean writer
# prompt yet, or vice versa.
LEAN_PROMPT_CATEGORIES: frozenset[str] = frozenset(
    {"dining", "nightlife", "accommodations"}
)

_POOL_BY_CATEGORY: dict[str, tuple[ListicleAngle, ...]] = {
    "dining": DINING_ANGLE_POOL,
    "accommodations": ACCOMMODATIONS_ANGLE_POOL,
    "attractions": ATTRACTIONS_ANGLE_POOL,
    "nightlife": NIGHTLIFE_ANGLE_POOL,
}
