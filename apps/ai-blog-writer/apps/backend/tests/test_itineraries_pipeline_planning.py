"""Unit tests for the deterministic core of Itinerary Autobuild:
Haversine distance, greedy per-day ordering, selection round-robin, and
neighborhood-clustered day distribution."""

import sys
import types

# The pipeline package __init__ imports routes → `utils` (LLM client). Stub it
# so these pure-logic tests don't pull in Vertex/LangChain.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
utils_stub.parse_json_response = lambda *args, **kwargs: {}
sys.modules.setdefault("utils", utils_stub)

from app.features.itineraries_pipeline.ordering import haversine_km, order_day  # noqa: E402
from app.features.itineraries_pipeline.graph import _categories_for_shells, _pool_for_slot, _resolve_day_shells  # noqa: E402
from app.features.itineraries_pipeline.schemas import (  # noqa: E402
    Candidate,
    DayShellSelection,
    GenerateItineraryRequest,
    IntentSpec,
    ScoredCandidate,
)
from app.features.itineraries_pipeline.selection import (  # noqa: E402
    distribute_across_days,
    pick_lodging_anchor,
    select_stops,
)


def _cand(id_: int, cat="dining", lat=None, lng=None, hood=None) -> Candidate:
    return Candidate(id=id_, title=f"c{id_}", category=cat, latitude=lat, longitude=lng, neighborhood_key=hood)


def _scored(id_, fit, cat="dining", lat=None, lng=None, hood=None) -> ScoredCandidate:
    return ScoredCandidate(candidate=_cand(id_, cat, lat, lng, hood), fit_score=fit)


# --- Haversine ----------------------------------------------------------------

def test_haversine_zero_distance():
    assert haversine_km((6.2, -75.5), (6.2, -75.5)) == 0.0


def test_haversine_symmetry_and_magnitude():
    a, b = (6.2080, -75.5669), (6.2102, -75.5666)
    d1 = haversine_km(a, b)
    d2 = haversine_km(b, a)
    assert abs(d1 - d2) < 1e-9
    assert 0.0 < d1 < 1.0  # ~250m apart


# --- order_day ----------------------------------------------------------------

def test_order_day_greedy_from_anchor():
    # Anchor at origin; stops at increasing distance, supplied out of order.
    anchor = (0.0, 0.0)
    far = _cand(3, lat=0.0, lng=0.30)
    near = _cand(1, lat=0.0, lng=0.10)
    mid = _cand(2, lat=0.0, lng=0.20)
    ordered = order_day([far, near, mid], anchor)
    assert [c.id for c in ordered] == [1, 2, 3]


def test_order_day_appends_ungeocoded_last():
    anchor = (0.0, 0.0)
    geocoded = _cand(1, lat=0.0, lng=0.1)
    no_coords = _cand(9)
    ordered = order_day([no_coords, geocoded], anchor)
    assert [c.id for c in ordered] == [1, 9]


def test_order_day_single_or_empty_passthrough():
    assert order_day([], (0.0, 0.0)) == []
    one = _cand(1, lat=1.0, lng=1.0)
    assert order_day([one], None) == [one]


def test_order_day_without_anchor_seeds_from_centroid():
    # Three collinear points; centroid nearest is the middle one.
    a = _cand(1, lat=0.0, lng=0.0)
    b = _cand(2, lat=0.0, lng=0.5)
    c = _cand(3, lat=0.0, lng=1.0)
    ordered = order_day([a, c, b], None)
    assert ordered[0].id == 2  # central seed
    assert {c.id for c in ordered} == {1, 2, 3}


# --- pick_lodging_anchor ------------------------------------------------------

def test_pick_lodging_anchor_highest_fit():
    anchor = pick_lodging_anchor([_scored(1, 40, "accommodations"), _scored(2, 90, "accommodations")])
    assert anchor is not None and anchor.candidate.id == 2


def test_pick_lodging_anchor_none_when_empty():
    assert pick_lodging_anchor([]) is None


# --- select_stops -------------------------------------------------------------

def test_select_stops_round_robins_for_variety():
    scored = {
        "dining": [_scored(1, 99, "dining"), _scored(2, 98, "dining")],
        "attractions": [_scored(3, 50, "attractions")],
    }
    intent = IntentSpec(categories=["dining", "attractions"], stops_per_day=2)
    picked = select_stops(scored, intent, total_slots=2)
    # Despite both top scores being dining, round-robin pulls one attraction.
    assert {p.candidate.category for p in picked} == {"dining", "attractions"}


def test_select_stops_dedupes_and_caps():
    scored = {"dining": [_scored(1, 90, "dining"), _scored(1, 90, "dining"), _scored(2, 80, "dining")]}
    intent = IntentSpec(categories=["dining"])
    picked = select_stops(scored, intent, total_slots=5)
    assert [p.candidate.id for p in picked] == [1, 2]


def test_select_stops_excludes_accommodations():
    scored = {"accommodations": [_scored(1, 99, "accommodations")], "dining": [_scored(2, 50, "dining")]}
    intent = IntentSpec(categories=["accommodations", "dining"])
    picked = select_stops(scored, intent, total_slots=3)
    assert [p.candidate.id for p in picked] == [2]


# --- distribute_across_days ---------------------------------------------------

def test_distribute_even_chunks():
    stops = [_scored(i, 50) for i in range(4)]
    days = distribute_across_days(stops, day_count=2)
    assert [len(d) for d in days] == [2, 2]


def test_distribute_uneven_remainder_goes_to_early_days():
    stops = [_scored(i, 50) for i in range(5)]
    days = distribute_across_days(stops, day_count=2)
    assert [len(d) for d in days] == [3, 2]


def test_distribute_clusters_by_neighborhood():
    stops = [
        _scored(1, 10, hood="centro"),
        _scored(2, 90, hood="poblado"),
        _scored(3, 80, hood="poblado"),
        _scored(4, 20, hood="centro"),
    ]
    days = distribute_across_days(stops, day_count=2)
    day_hoods = [{s.candidate.neighborhood_key for s in d} for d in days]
    # Each day holds a single neighborhood; strongest (poblado) leads day 1.
    assert day_hoods == [{"poblado"}, {"centro"}]


def test_distribute_empty():
    assert distribute_across_days([], day_count=3) == [[], [], []]


# --- Day Shells ---------------------------------------------------------------

def test_resolve_day_shells_uses_one_shell_per_day():
    req = GenerateItineraryRequest(
        location="peru|lima",
        title="Lima nightlife",
        brief="late start and clubs",
        day_count=2,
        payload_jwt="token",
        day_shells=[
            DayShellSelection(day_index=0, shell_id="nightlife_full_day"),
            DayShellSelection(day_index=1, shell_id="food_focused_full_day"),
        ],
    )
    shells = _resolve_day_shells(req)
    assert [shell.id for shell in shells] == ["nightlife_full_day", "food_focused_full_day"]
    assert [slot.id for slot in shells[0].slots] == [
        "late_start_lunch",
        "recovery_friendly_activity",
        "dinner",
        "evening_social_stop",
        "nightlife_stop",
        "late_night_nightlife",
    ]


def test_categories_derive_from_shell_slots_not_intent():
    req = GenerateItineraryRequest(
        location="peru|lima",
        title="Lima nightlife",
        brief="late start and clubs",
        day_count=1,
        payload_jwt="token",
        day_shells=[DayShellSelection(day_index=0, shell_id="nightlife_full_day")],
    )
    shells = _resolve_day_shells(req)
    assert _categories_for_shells(shells) == ["dining", "attractions", "nightlife"]


def test_pool_for_slot_excludes_already_filled_places():
    req = GenerateItineraryRequest(
        location="peru|lima",
        title="Lima food",
        brief="dessert",
        day_count=1,
        payload_jwt="token",
        day_shells=[DayShellSelection(day_index=0, shell_id="food_focused_full_day")],
    )
    dessert_slot = _resolve_day_shells(req)[0].slots[-1]
    pool = _pool_for_slot(
        dessert_slot,
        {
            "dining": [_cand(1, "dining"), _cand(2, "dining")],
            "nightlife": [_cand(3, "nightlife")],
        },
        {("dining", 1)},
    )
    assert [(candidate.category, candidate.id) for candidate in pool] == [("dining", 2), ("nightlife", 3)]
