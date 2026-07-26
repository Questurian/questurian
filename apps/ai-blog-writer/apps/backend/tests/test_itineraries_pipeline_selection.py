"""Deterministic candidate-selection tests for Itinerary Autobuild."""

from tests.itineraries_pipeline_test_support import scored_candidate

from app.features.itineraries_pipeline.schemas import IntentSpec
from app.features.itineraries_pipeline.selection import (
    distribute_across_days,
    pick_lodging_anchor,
    select_stops,
)


def test_pick_lodging_anchor_highest_fit():
    anchor = pick_lodging_anchor(
        [
            scored_candidate(1, 40, "accommodations"),
            scored_candidate(2, 90, "accommodations"),
        ]
    )

    assert anchor is not None and anchor.candidate.id == 2


def test_pick_lodging_anchor_none_when_empty():
    assert pick_lodging_anchor([]) is None


def test_select_stops_round_robins_for_variety():
    scored = {
        "dining": [
            scored_candidate(1, 99, "dining"),
            scored_candidate(2, 98, "dining"),
        ],
        "attractions": [scored_candidate(3, 50, "attractions")],
    }
    intent = IntentSpec(categories=["dining", "attractions"], stops_per_day=2)

    picked = select_stops(scored, intent, total_slots=2)

    assert {entry.candidate.category for entry in picked} == {
        "dining",
        "attractions",
    }


def test_select_stops_dedupes_and_caps():
    scored = {
        "dining": [
            scored_candidate(1, 90, "dining"),
            scored_candidate(1, 90, "dining"),
            scored_candidate(2, 80, "dining"),
        ]
    }
    intent = IntentSpec(categories=["dining"])

    picked = select_stops(scored, intent, total_slots=5)

    assert [entry.candidate.id for entry in picked] == [1, 2]


def test_select_stops_excludes_accommodations():
    scored = {
        "accommodations": [scored_candidate(1, 99, "accommodations")],
        "dining": [scored_candidate(2, 50, "dining")],
    }
    intent = IntentSpec(categories=["accommodations", "dining"])

    picked = select_stops(scored, intent, total_slots=3)

    assert [entry.candidate.id for entry in picked] == [2]


def test_distribute_even_chunks():
    stops = [scored_candidate(item_id, 50) for item_id in range(4)]

    days = distribute_across_days(stops, day_count=2)

    assert [len(day) for day in days] == [2, 2]


def test_distribute_uneven_remainder_goes_to_early_days():
    stops = [scored_candidate(item_id, 50) for item_id in range(5)]

    days = distribute_across_days(stops, day_count=2)

    assert [len(day) for day in days] == [3, 2]


def test_distribute_clusters_by_neighborhood():
    stops = [
        scored_candidate(1, 10, neighborhood_key="centro"),
        scored_candidate(2, 90, neighborhood_key="poblado"),
        scored_candidate(3, 80, neighborhood_key="poblado"),
        scored_candidate(4, 20, neighborhood_key="centro"),
    ]

    days = distribute_across_days(stops, day_count=2)
    day_neighborhoods = [
        {entry.candidate.neighborhood_key for entry in day} for day in days
    ]

    assert day_neighborhoods == [{"poblado"}, {"centro"}]


def test_distribute_empty():
    assert distribute_across_days([], day_count=3) == [[], [], []]
