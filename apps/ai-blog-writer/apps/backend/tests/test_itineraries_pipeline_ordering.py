"""Distance and per-day travel-ordering tests for Itinerary Autobuild."""

from tests.itineraries_pipeline_test_support import candidate

from app.features.itineraries_pipeline.ordering import haversine_km, order_day


def test_haversine_zero_distance():
    assert haversine_km((6.2, -75.5), (6.2, -75.5)) == 0.0


def test_haversine_symmetry_and_magnitude():
    a, b = (6.2080, -75.5669), (6.2102, -75.5666)
    d1 = haversine_km(a, b)
    d2 = haversine_km(b, a)
    assert abs(d1 - d2) < 1e-9
    assert 0.0 < d1 < 1.0  # ~250m apart


def test_order_day_greedy_from_anchor():
    anchor = (0.0, 0.0)
    far = candidate(3, latitude=0.0, longitude=0.30)
    near = candidate(1, latitude=0.0, longitude=0.10)
    mid = candidate(2, latitude=0.0, longitude=0.20)

    ordered = order_day([far, near, mid], anchor)

    assert [entry.id for entry in ordered] == [1, 2, 3]


def test_order_day_appends_ungeocoded_last():
    geocoded = candidate(1, latitude=0.0, longitude=0.1)
    no_coords = candidate(9)

    ordered = order_day([no_coords, geocoded], (0.0, 0.0))

    assert [entry.id for entry in ordered] == [1, 9]


def test_order_day_single_or_empty_passthrough():
    assert order_day([], (0.0, 0.0)) == []
    one = candidate(1, latitude=1.0, longitude=1.0)
    assert order_day([one], None) == [one]


def test_order_day_without_anchor_seeds_from_centroid():
    first = candidate(1, latitude=0.0, longitude=0.0)
    middle = candidate(2, latitude=0.0, longitude=0.5)
    last = candidate(3, latitude=0.0, longitude=1.0)

    ordered = order_day([first, last, middle], None)

    assert ordered[0].id == 2
    assert {entry.id for entry in ordered} == {1, 2, 3}
