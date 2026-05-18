from datetime import datetime, timedelta, timezone

from app.features.editor_assist.critical_fields import (
    STALENESS_DAYS_BY_CATEGORY,
    evaluate_tiers,
)


def _dining(**overrides):
    """Fully-populated dining venue (no Tier-1 or Tier-2 gaps)."""
    base = {
        "name": "La Mar",
        "type": "Restaurant",
        "priceLevel": "3",
        "address": "Av. Mariscal La Mar 770, Miraflores 15074, Peru",
        "cuisines": ["Peruvian", "Seafood"],
        "idealFor": ["business-lunch", "date-night"],
        "features": ["outdoor seating", "reservations recommended"],
        "mealTypes": ["lunch", "dinner"],
        "operationHours": {"Monday": "12:00 - 17:00"},
        "reviewsCount": 1500,
        "reviewsFetchedAt": datetime.now(timezone.utc).isoformat(),
    }
    base.update(overrides)
    return base


def test_dining_with_complete_data_has_no_gaps_and_skips_research():
    evaluation = evaluate_tiers("dining", _dining())

    assert evaluation.tier1_missing == []
    assert evaluation.tier2_missing == []
    assert evaluation.reviews_stale is False
    assert evaluation.needs_fallback_research is False


def test_dining_missing_cuisines_is_tier1_gap():
    evaluation = evaluate_tiers("dining", _dining(cuisines=[]))

    assert "cuisines" in evaluation.tier1_missing
    assert evaluation.has_tier1_gaps is True


def test_dining_missing_priceLevel_is_tier1_gap():
    evaluation = evaluate_tiers("dining", _dining(priceLevel=None))

    assert "priceLevel" in evaluation.tier1_missing


def test_dining_missing_idealFor_triggers_fallback_research():
    evaluation = evaluate_tiers("dining", _dining(idealFor=None))

    assert "idealFor" in evaluation.tier2_missing
    assert evaluation.needs_fallback_research is True
    assert "idealFor" in evaluation.gap_descriptions


def test_dining_zero_reviews_marks_reviews_stale():
    evaluation = evaluate_tiers("dining", _dining(reviewsCount=0))

    assert evaluation.reviews_stale is True
    assert evaluation.needs_fallback_research is True
    assert "recent reviews / reputation signal" in evaluation.gap_descriptions


def test_dining_old_reviews_marks_reviews_stale():
    threshold = STALENESS_DAYS_BY_CATEGORY["dining"]
    assert threshold is not None
    too_old = (datetime.now(timezone.utc) - timedelta(days=threshold + 30)).isoformat()
    evaluation = evaluate_tiers("dining", _dining(reviewsFetchedAt=too_old))

    assert evaluation.reviews_stale is True
    assert evaluation.needs_fallback_research is True


def test_dining_recent_reviews_within_threshold_are_fresh():
    threshold = STALENESS_DAYS_BY_CATEGORY["dining"]
    assert threshold is not None
    recent = (datetime.now(timezone.utc) - timedelta(days=threshold - 30)).isoformat()
    evaluation = evaluate_tiers("dining", _dining(reviewsFetchedAt=recent))

    assert evaluation.reviews_stale is False


def test_malformed_reviewsFetchedAt_marks_stale():
    evaluation = evaluate_tiers("dining", _dining(reviewsFetchedAt="not-a-date"))

    assert evaluation.reviews_stale is True


def test_non_dining_category_returns_permissive_evaluation():
    evaluation = evaluate_tiers("accommodations", _dining())

    assert evaluation.tier1_missing == []
    assert evaluation.tier2_missing == []
    assert evaluation.reviews_stale is False
    assert evaluation.needs_fallback_research is False


def test_missing_location_dict_returns_permissive_evaluation():
    evaluation = evaluate_tiers("dining", None)

    assert evaluation.tier1_missing == []
    assert evaluation.needs_fallback_research is False
