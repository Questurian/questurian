"""Per-blurb Listicle Angle assignment.

Heuristic auto-assignment based on LM data availability, with rotation to avoid
adjacent repeats, and operator override via a non-null `angle` on the target.

Only `dining` has a real angle pool today; other categories return `None` (no
angle injected into the prompt — the writer still runs as before).
"""

from __future__ import annotations

import logging
from typing import Any, Literal

logger = logging.getLogger(__name__)

ListicleAngle = Literal[
    "signature-dish",
    "atmosphere",
    "founders-backstory",
    "insider-tip",
    "best-for",
    "whats-different",
]

DINING_ANGLE_POOL: tuple[ListicleAngle, ...] = (
    "signature-dish",
    "atmosphere",
    "founders-backstory",
    "insider-tip",
    "best-for",
    "whats-different",
)

# Cue words in reviews-digest text that hint at founder/backstory content.
FOUNDER_CUES = (
    "family-owned", "family owned", "since 19", "since 20", "founded",
    "founder", "opened in", "third-generation", "second-generation",
    "generations", "tradition", "established",
)

# How many adjacent items to avoid when rotating (e.g. 2 = don't repeat the
# same angle for the next 2 items immediately after using it).
ROTATION_LOOKBACK = 2


def _has_named_dishes(digest: dict[str, Any] | None) -> int:
    if not isinstance(digest, dict):
        return 0
    named = digest.get("namedDishes")
    return len(named) if isinstance(named, list) else 0


def _has_known_for(digest: dict[str, Any] | None) -> int:
    if not isinstance(digest, dict):
        return 0
    known = digest.get("knownFor")
    return len(known) if isinstance(known, list) else 0


def _has_common_positives(digest: dict[str, Any] | None) -> int:
    if not isinstance(digest, dict):
        return 0
    positives = digest.get("commonPositives")
    return len(positives) if isinstance(positives, list) else 0


def _digest_summary_text(digest: dict[str, Any] | None) -> str:
    if not isinstance(digest, dict):
        return ""
    summary = digest.get("summary")
    return summary.lower() if isinstance(summary, str) else ""


def _count_list(location: dict[str, Any] | None, key: str) -> int:
    if not isinstance(location, dict):
        return 0
    value = location.get(key)
    return len(value) if isinstance(value, list) else 0


def _has_text(location: dict[str, Any] | None, key: str) -> bool:
    if not isinstance(location, dict):
        return False
    value = location.get(key)
    return isinstance(value, str) and value.strip() != ""


def _score_dining_angles(location: dict[str, Any] | None) -> dict[ListicleAngle, float]:
    """Score each angle 0..N based on how well-supported it is by available data.
    Higher = better fit. 0 = no data backs this angle for this venue.
    """
    digest = location.get("_reviewsDigest") if isinstance(location, dict) else None
    summary = _digest_summary_text(digest)

    return {
        "signature-dish": float(_has_named_dishes(digest)) * 1.5,
        "atmosphere": float(_count_list(location, "features"))
            + (1.0 if _has_text(location, "neighborhoodDescription") else 0.0),
        "founders-backstory": (
            2.0 if any(cue in summary for cue in FOUNDER_CUES) else 0.0
        ),
        "insider-tip": float(_has_common_positives(digest)) * 0.75,
        "best-for": float(_count_list(location, "idealFor")) * 1.25,
        "whats-different": (
            # Cross-list "what's different" needs list context, which we don't
            # have here; treat as a low-baseline fallback.
            0.5 if _has_known_for(digest) > 0 else 0.0
        ),
    }


def _pick_best_with_rotation(
    scores: dict[ListicleAngle, float],
    recent: list[ListicleAngle],
) -> ListicleAngle | None:
    """Pick the highest-scoring angle that hasn't been used in `recent` slots.
    If everything's been used or all scores are 0, fall back to first
    non-recent angle in the pool, then to None.
    """
    blocked = set(recent[-ROTATION_LOOKBACK:])
    ranked = sorted(
        scores.items(), key=lambda kv: (-kv[1], DINING_ANGLE_POOL.index(kv[0]))
    )
    for angle, score in ranked:
        if score <= 0:
            continue
        if angle in blocked:
            continue
        return angle
    # No positive-scored angle is rotation-eligible: pick any non-blocked
    # angle from the pool so we still inject *something*.
    for angle in DINING_ANGLE_POOL:
        if angle not in blocked:
            return angle
    return None


def assign_dining_angles(
    items: list[tuple[str, dict[str, Any] | None, ListicleAngle | None]],
) -> dict[str, ListicleAngle | None]:
    """Assign an angle per blurb target.

    `items` is an ordered list of (target_id, lm_location_or_None, operator_override_or_None).
    The order matters because rotation considers the previous N assignments.

    Returns {target_id: angle | None}. None means the writer prompt won't get
    an angle block (this happens when category isn't dining and operator didn't
    override, or when location is missing).
    """
    assignments: dict[str, ListicleAngle | None] = {}
    history: list[ListicleAngle] = []

    for target_id, location, override in items:
        if override is not None:
            assignments[target_id] = override
            history.append(override)
            continue

        if location is None:
            assignments[target_id] = None
            continue

        scores = _score_dining_angles(location)
        pick = _pick_best_with_rotation(scores, history)
        assignments[target_id] = pick
        if pick is not None:
            history.append(pick)

    return assignments
