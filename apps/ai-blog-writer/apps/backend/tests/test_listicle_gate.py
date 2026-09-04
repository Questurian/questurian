"""The gate: is there enough published about this place to write about it?"""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline import gate, places
from app.features.listicle_pipeline.places import PlaceDetails
from app.features.listicle_pipeline.profiles import Claim, PlaceProfile


def profile(*claims: Claim) -> PlaceProfile:
    return PlaceProfile(profile_id="p", name="Somewhere", claims=list(claims))


def independent(kind: str, text: str, source: str = "Infobae") -> Claim:
    return Claim(kind=kind, text=text, source_name=source)


# --- weighing who said it -------------------------------------------------


@pytest.mark.parametrize(
    "source, weight",
    [
        ("Infobae", gate.WEIGHT_INDEPENDENT),
        ("Trome.com", gate.WEIGHT_INDEPENDENT),
        ("Google review", gate.WEIGHT_AGGREGATOR),
        ("TripAdvisor", gate.WEIGHT_AGGREGATOR),
        # The subject talking about itself is not evidence about the subject.
        ("Antigua Taberna Queirolo website", gate.WEIGHT_SELF_PUBLISHED),
        ("Facebook", gate.WEIGHT_SELF_PUBLISHED),
        ("", gate.WEIGHT_SELF_PUBLISHED),
        # A machine repeating a machine. All of these came back on real runs.
        ("WanderBoat AI Trip Planner", gate.WEIGHT_AI_WRITTEN),
    ],
)
def test_who_published_it_changes_what_it_is_worth(source, weight):
    assert gate.source_weight(source) == weight


def test_a_place_carried_entirely_by_ai_written_directories_has_nothing():
    result = gate.assess(
        profile(
            *[
                independent("history", f"Fact number {n}.", "WanderBoat AI Trip Planner")
                for n in range(8)
            ]
        )
    )
    assert result.verdict == "nothing"
    assert result.counted == 0
    assert result.discounted == 8


# --- the same fact said three times ---------------------------------------


def test_one_fact_worded_three_ways_is_one_fact():
    """Queirolo's first three claims were "began around 1880", "began in 1880
    when Don Santiago Queirolo founded it" and "the family arrived around
    1877". Three rows, one thing to say."""
    result = gate.assess(
        profile(
            independent("history", "The tavern began around 1880."),
            independent("history", "The tavern began around 1880."),
            independent("history", "Around 1880 the tavern began."),
        )
    )
    assert result.counted == 1
    assert result.discounted == 2


# --- three verdicts, not two ----------------------------------------------


def test_nothing_found_is_its_own_verdict():
    result = gate.assess(profile())
    assert result.verdict == "nothing"
    assert result.missing == ["anything at all"]


def test_a_place_with_one_newspaper_paragraph_is_thin_not_dropped():
    """Publishable at short length. Collapsing this into "no" throws away most
    of a long list."""
    result = gate.assess(
        profile(
            independent("history", "Founded in 1907 by a Catalan immigrant."),
            independent("person", "The owner started as a waiter in 1964."),
        )
    )
    assert result.verdict == "thin"
    assert "short entry" in result.reason


def test_a_place_with_several_independent_sources_is_enough():
    result = gate.assess(
        profile(
            independent("history", "Founded in 1907 by a Catalan immigrant."),
            independent("person", "The owner started as a waiter in 1964.", "Trome.com"),
            independent("signature", "Known for pan con pejerrey.", "El Comercio"),
            independent("award", "Won best classic restaurant.", "Summum"),
            independent("setting", "The original vitrine is still in use.", "La República"),
        )
    )
    assert result.verdict == "enough"


def test_reviews_alone_are_not_a_story():
    """A place with four reviews and nothing else has no story, however many
    reviews there are."""
    result = gate.assess(
        profile(
            *[
                Claim(kind="review", text=f"Diner {n} liked it.", source_name="Infobae")
                for n in range(9)
            ]
        )
    )
    assert result.verdict != "enough"
    assert any("beyond reviews" in m for m in result.missing)


def test_the_verdict_says_what_would_change_it():
    result = gate.assess(profile(independent("review", "Someone liked it.")))
    assert result.missing


# --- the Places pass ------------------------------------------------------


def test_google_facts_become_claims_without_a_model_touching_them():
    claims = places.claims_from(
        PlaceDetails("id", "Rovira", rating=4.1, rating_count=601, price_level=2)
    )
    kinds = {claim.kind for claim in claims}
    assert "recognition" in kinds and "price" in kinds
    assert any("4.1" in claim.text and "601" in claim.text for claim in claims)
    # Said in words a writer can use. "price_level 2" is not a sentence.
    assert any("moderately priced" in claim.text for claim in claims)


def test_a_review_carries_its_stars_and_its_age():
    """A five-star review from eight years ago and a three-star from last month
    say very different things, and a blurb written from the first without
    knowing its age is a blurb about a restaurant that may have changed hands."""
    claims = places.claims_from(
        PlaceDetails(
            "id",
            "Rovira",
            reviews=[
                {
                    "text": "20-30 soles a head.",
                    "rating": 5,
                    "relative_time_description": "8 years ago",
                    "time": 1500000000,
                }
            ],
        )
    )
    assert "5-star" in claims[0].text
    assert "8 years ago" in claims[0].text
    assert claims[0].about_year == 2017


def test_a_failed_places_call_adds_nothing_rather_than_guessing():
    assert places.claims_from(PlaceDetails("id", failed=True, reason="OVER_QUERY_LIMIT")) == []


def test_the_price_band_is_findable_on_its_own():
    """A cheap-eats list has to find this without reading everything else said
    about the place."""
    stored = PlaceProfile(
        profile_id="p",
        name="x",
        claims=[
            Claim(kind="price", text="Inexpensive band.", source_name="Google"),
            Claim(kind="history", text="Founded 1907.", source_name="Infobae"),
        ],
    )
    assert [c.kind for c in stored.claims_for(("price",))] == ["price"]
