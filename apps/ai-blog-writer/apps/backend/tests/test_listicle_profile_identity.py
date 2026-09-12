"""A Place ID is an identity. A name is not.

R9 of the verified plan of 2026-09-09. Opening "Azul" in Centro with Place ID A
and then "Azul" in Barranco with Place ID B returned one profile, anchored to
A -- so the second bar's claims were attached to the first bar, and nothing on
any screen could show that it had happened.

Two causes, both here. The provisional name-and-city index was unique across
every row, including anchored ones, so the second insert could not happen; and
the lookup fell through from an unmatched Place ID to the name.

This is the optional branch of the plan. Profiles are not wired into candidate
discovery, so none of this changes what a search returns.
"""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline import profile_store
from app.features.listicle_pipeline.profiles import Claim


def test_two_place_ids_are_two_profiles(isolated_db):
    one = profile_store.open_profile(
        name="Azul", city="Lima", district="Centro", place_id="place-A"
    )
    two = profile_store.open_profile(
        name="Azul", city="Lima", district="Barranco", place_id="place-B"
    )
    assert one.profile_id != two.profile_id
    assert one.place_id == "place-A"
    assert two.place_id == "place-B", "the ID that was asked for is the ID that comes back"


def test_a_supplied_place_id_that_matches_nothing_is_not_answered_by_a_name(isolated_db):
    profile_store.open_profile(name="Azul", city="Lima", place_id="place-A")
    assert profile_store.find(place_id="place-B") is None


def test_the_same_place_id_reaches_the_same_profile_under_a_new_name(isolated_db):
    """The whole reason for the anchor: a business that renamed itself, or a
    source that spells it differently, is still the same business."""
    opened = profile_store.open_profile(
        name="Bar Rovira del Callao", city="Lima", place_id="place-A"
    )
    again = profile_store.open_profile(
        name="Tradición Chalaca Rovira 1907", city="Lima", place_id="place-A"
    )
    assert again.profile_id == opened.profile_id


def test_an_unanchored_profile_is_promoted_rather_than_left_behind(isolated_db):
    """Profiles are opened before resolution runs -- there may be no API key at
    all -- so the anchor has to arrive later without abandoning what was
    gathered meanwhile."""
    opened = profile_store.open_profile(name="Bar Cordano", city="Lima", district="Centro")
    profile_store.add_claims(
        opened.profile_id, [Claim(kind="history", text="Opened in 1905.")]
    )
    anchored = profile_store.open_profile(
        name="Bar Cordano", city="Lima", district="Centro", place_id="place-C"
    )
    assert anchored.profile_id == opened.profile_id
    assert len(profile_store.find(place_id="place-C").claims) == 1


def test_a_promotion_needs_the_same_branch_not_just_the_same_name(isolated_db):
    """An unanchored "Azul" in Centro is not the "Azul" a resolver just found
    in Barranco, and handing it that Place ID would attach one bar's claims to
    the other for good."""
    centro = profile_store.open_profile(name="Azul", city="Lima", district="Centro")
    barranco = profile_store.open_profile(
        name="Azul", city="Lima", district="Barranco", place_id="place-B"
    )
    assert barranco.profile_id != centro.profile_id
    assert profile_store.find(place_id="place-B").district == "Barranco"


def test_two_unanchored_branches_are_two_profiles(isolated_db):
    """Before this, they were one row and their claims were merged into a place
    that does not exist."""
    centro = profile_store.open_profile(name="Azul", city="Lima", district="Centro")
    barranco = profile_store.open_profile(name="Azul", city="Lima", district="Barranco")
    assert centro.profile_id != barranco.profile_id


def test_two_bars_inside_one_building_are_two_profiles(isolated_db):
    catedral = profile_store.open_profile(
        name="Gran Hotel Bolívar (Bar Catedral)", city="Lima"
    )
    maury = profile_store.open_profile(
        name="Gran Hotel Bolívar (Bar Maury)", city="Lima"
    )
    assert catedral.profile_id != maury.profile_id


def test_a_name_matching_several_anchored_profiles_refuses_to_choose(isolated_db):
    """Returning whichever row the database listed first is how one business
    ends up wearing another's claims."""
    profile_store.open_profile(name="Azul", city="Lima", place_id="place-A")
    # A second anchored profile under the same bare identity, which the schema
    # now permits precisely because a Place ID identifies it.
    profile_store.open_profile(name="Azul", city="Lima", place_id="place-B")
    with pytest.raises(profile_store.AmbiguousProfile) as caught:
        profile_store.find(name="Azul", city="Lima")
    assert len(caught.value.profile_ids) == 2


def test_the_district_reaches_the_resolver_query():
    """The top hit for a bare name is not a validated branch identity -- it is
    the branch Google ranks highest."""
    from app.features.listicle_pipeline import identity

    seen = {}

    class _Response:
        status_code = 200

        def json(self):
            return {"status": "ZERO_RESULTS", "results": []}

    def _get(url, params, timeout):
        seen.update(params)
        return _Response()

    import sys
    import types

    stub = types.ModuleType("requests")
    stub.get = _get
    original = sys.modules.get("requests")
    sys.modules["requests"] = stub
    try:
        identity.api_key = lambda: "a-key"
        identity.resolve("Azul", "Lima", "Barranco")
    finally:
        if original is None:
            sys.modules.pop("requests", None)
        else:
            sys.modules["requests"] = original
    assert "Barranco" in seen.get("query", "")
