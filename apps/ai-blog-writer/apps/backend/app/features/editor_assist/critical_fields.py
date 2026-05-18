"""Per-category Critical Fields Guideline for listicle blurb generation.

Tier 1: MUST have. Missing = soft warning (operator should enrich LM); for now
    we proceed with generation. A future phase will surface this in the UI.
Tier 2: SHOULD have. Missing = trigger Fallback Research scoped to the gaps.
Tier 3: NICE to have. Silent; never triggers anything.

This module is per-category. Today only dining is fully defined; other
categories return a permissive evaluation (no gaps) and skip Fallback Research.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

DiningCategory = Literal["dining"]
ListicleCategory = Literal["dining", "accommodations", "attractions", "nightlife", "key_location"]

# Per-category review-staleness thresholds. None = category has no Tier-2
# review dependency in its current guideline.
STALENESS_DAYS_BY_CATEGORY: dict[str, int | None] = {
    "dining": 365,
    "accommodations": 365,
    "attractions": 540,
    "nightlife": 180,
    "key_location": None,
}


@dataclass(frozen=True)
class TierEvaluation:
    tier1_missing: list[str]
    tier2_missing: list[str]
    reviews_stale: bool
    needs_fallback_research: bool

    @property
    def has_tier1_gaps(self) -> bool:
        return bool(self.tier1_missing)

    @property
    def gap_descriptions(self) -> list[str]:
        """Human-readable list of Tier-2 gaps for the Fallback Research prompt."""
        labels = list(self.tier2_missing)
        if self.reviews_stale:
            labels.append("recent reviews / reputation signal")
        return labels


def _is_non_empty_str(value: Any) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _is_non_empty_list(value: Any) -> bool:
    return isinstance(value, list) and len(value) > 0


def _reviews_stale(
    *,
    reviews_count: Any,
    reviews_fetched_at: Any,
    staleness_days: int | None,
) -> bool:
    if staleness_days is None:
        return False
    if not isinstance(reviews_count, int) or reviews_count <= 0:
        return True
    if not _is_non_empty_str(reviews_fetched_at):
        return True
    try:
        fetched = datetime.fromisoformat(reviews_fetched_at.replace("Z", "+00:00"))
    except ValueError:
        return True
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=timezone.utc)
    age = datetime.now(timezone.utc) - fetched
    return age > timedelta(days=staleness_days)


def _evaluate_dining(location: dict[str, Any]) -> TierEvaluation:
    tier1_missing: list[str] = []
    tier2_missing: list[str] = []

    # Tier 1
    if not _is_non_empty_str(location.get("name")):
        tier1_missing.append("name")
    has_cuisine = _is_non_empty_list(location.get("cuisines"))
    if not has_cuisine:
        tier1_missing.append("cuisines")
    if not _is_non_empty_str(location.get("address")):
        tier1_missing.append("address")
    if not _is_non_empty_str(location.get("priceLevel")):
        tier1_missing.append("priceLevel")

    # Tier 2
    if not _is_non_empty_str(location.get("type")):
        tier2_missing.append("type")
    if not _is_non_empty_list(location.get("idealFor")):
        tier2_missing.append("idealFor")
    if not (
        isinstance(location.get("operationHours"), dict)
        and len(location["operationHours"]) > 0
    ):
        tier2_missing.append("operationHours")
    if not _is_non_empty_list(location.get("features")):
        tier2_missing.append("features")

    stale = _reviews_stale(
        reviews_count=location.get("reviewsCount"),
        reviews_fetched_at=location.get("reviewsFetchedAt"),
        staleness_days=STALENESS_DAYS_BY_CATEGORY["dining"],
    )

    needs_research = bool(tier2_missing) or stale
    return TierEvaluation(
        tier1_missing=tier1_missing,
        tier2_missing=tier2_missing,
        reviews_stale=stale,
        needs_fallback_research=needs_research,
    )


def _permissive_evaluation() -> TierEvaluation:
    """For categories without a defined guideline: no gaps, no research."""
    return TierEvaluation(
        tier1_missing=[],
        tier2_missing=[],
        reviews_stale=False,
        needs_fallback_research=False,
    )


def evaluate_tiers(
    category: ListicleCategory | None,
    location: dict[str, Any] | None,
) -> TierEvaluation:
    """Evaluate the Critical Fields Guideline for a single venue.

    Returns a permissive evaluation if either the category is missing or the
    location data is absent — in those cases the existing generation path
    runs unchanged (current behavior preserved).
    """
    if location is None:
        return _permissive_evaluation()
    if category == "dining":
        return _evaluate_dining(location)
    return _permissive_evaluation()
