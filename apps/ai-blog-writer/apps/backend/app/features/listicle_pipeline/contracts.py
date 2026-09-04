"""What a listicle interview has to settle before it may agree.

The article grill settles a vision: what the piece is for, who reads it, what
would make it a failure. This settles a specification: what kind of place,
where, how many, what earns a spot, what is barred, and which angles the list
gets built from.

Same six-marker shape, same stop condition, deliberately different contents.
The two are not interchangeable and neither is a mode of the other -- an
article is judged on whether it reads well, which was never provable; a list
is judged on whether every item is real, current and earns its place, which
is checkable.
"""

from __future__ import annotations

# (marker, the field it fills on the spec, how it is said to a person)
LISTICLE_MARKERS: tuple[tuple[str, str, str], ...] = (
    ("kind", "listicle_type", "what kind of place the list is about"),
    ("place", "location", "where, and how wide an area"),
    ("count", "target_item_count", "how many items"),
    ("bar", "selection_standard", "what earns a place on the list"),
    ("cut", "exclusions", "what is out no matter how good it is"),
    ("angles", "tropes", "the angles the list gets built from"),
)

LISTICLE_MARKER_KEYS: tuple[str, ...] = tuple(m for m, _, _ in LISTICLE_MARKERS)
