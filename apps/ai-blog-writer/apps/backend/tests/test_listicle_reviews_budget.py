"""The switch that stops the reviews API before it becomes a charge.

The plan is free up to five hundred review objects and billed after that. These
tests are about the one property that matters: nothing buys a review once the
allowance would be crossed, and the refusal happens **before** the request
leaves, not after the money is spent.

Nothing here reaches the network. The one test that proves a call is refused
hands `requests` a stub that fails the test if it is ever called.
"""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline import reviews_api, reviews_budget


class _Headers(dict):
    """Response headers, which real ones match case-insensitively."""

    def get(self, key, default=None):
        for held, value in self.items():
            if held.lower() == str(key).lower():
                return value
        return default


def _spend(objects: int, *, remaining: int | None = None, business="ChIJ-x"):
    reviews_budget.record(
        business_id=business,
        requested=objects,
        objects=objects,
        http_status=200,
        headers=(
            _Headers(
                {
                    "x-ratelimit-businesses-remaining": str(remaining),
                    "x-ratelimit-businesses-limit": "500",
                }
            )
            if remaining is not None
            else None
        ),
    )


def test_a_fresh_budget_is_five_hundred_reviews_and_twenty_five_places(isolated_db):
    budget = reviews_budget.status()

    assert budget.ceiling == 500
    assert budget.remaining == 500
    # The unit decisions are actually made in.
    assert budget.places_left == 25
    assert budget.exhausted is False


def test_what_a_call_spends_comes_off_the_counter(isolated_db):
    _spend(20)
    _spend(20)

    budget = reviews_budget.status()

    assert budget.spent == 40
    assert budget.remaining == 460
    assert budget.places_left == 23


def test_a_call_that_would_cross_the_ceiling_is_refused(isolated_db):
    _spend(490)

    refusal = reviews_budget.check(20)

    assert refusal is not None
    assert refusal.reason_code == "reviews_budget_insufficient"
    # Refused on what it could cost, not on what it probably costs: ten are
    # left and twenty were asked for, so the answer is no even though the call
    # might well have returned only eight.
    assert "10 left" in refusal.reason


def test_a_call_that_fits_exactly_is_allowed(isolated_db):
    _spend(480)

    assert reviews_budget.check(20) is None
    assert reviews_budget.check(21) is not None


def test_a_spent_allowance_refuses_everything(isolated_db):
    _spend(500)

    refusal = reviews_budget.check(1)

    assert refusal is not None
    assert refusal.reason_code == "reviews_budget_exhausted"
    assert reviews_budget.status().places_left == 0


def test_their_counter_wins_when_it_is_lower_than_ours(isolated_db):
    # Ours says 480 left. Theirs says 100 -- because the same key has been
    # spending somewhere else, which is exactly the case our own ledger cannot
    # see.
    _spend(20, remaining=100)

    budget = reviews_budget.status()

    assert budget.ours_remaining == 480
    assert budget.reported_remaining == 100
    assert budget.remaining == 100
    assert budget.disagrees is True
    assert reviews_budget.check(120) is not None


def test_our_counter_wins_when_theirs_is_higher(isolated_db):
    # A quota that rolled over on their side does not un-spend our ledger. The
    # ceiling holds until a person clears it on purpose.
    _spend(400, remaining=500)

    budget = reviews_budget.status()

    assert budget.remaining == 100


def test_a_missing_header_is_not_read_as_nothing_left(isolated_db):
    _spend(20, remaining=None)

    budget = reviews_budget.status()

    assert budget.reported_remaining is None
    assert budget.remaining == 480


def test_a_reset_clears_the_counter_and_keeps_the_history(isolated_db):
    _spend(500)
    assert reviews_budget.status().exhausted is True

    reviews_budget.reset("october allowance rolled over", by="owner")

    budget = reviews_budget.status()
    assert budget.spent == 0
    assert budget.remaining == 500
    # The spending rows are still there; they have only stopped counting.
    with __import__(
        "app.core.database", fromlist=["get_db_connection"]
    ).get_db_connection() as conn:
        rows = conn.execute("SELECT COUNT(*) AS n FROM listicle_reviews_spend").fetchone()
    assert rows["n"] == 2


def test_a_reset_needs_a_reason(isolated_db):
    with pytest.raises(ValueError):
        reviews_budget.reset("   ")


def test_an_exhausted_budget_stops_the_call_before_it_is_made(isolated_db, monkeypatch):
    """The property the whole module exists for.

    Not "the call returns an error" -- the call never happens. `requests` is
    replaced with something that fails the test if it is reached.
    """
    _spend(500)

    def _never(*args, **kwargs):  # pragma: no cover -- reaching this is the failure
        raise AssertionError("a request was made with the allowance spent")

    import requests

    monkeypatch.setattr(requests, "get", _never)
    monkeypatch.setenv("RAPID_API_KEY", "irrelevant-but-present")

    fetched = reviews_api.fetch_reviews("ChIJyQz17hnIBZERQqURcd_PGNg")

    assert fetched.failed is True
    assert "allowance is spent" in fetched.reason
    assert fetched.remaining == 0
    # And the refusal bought nothing.
    assert reviews_budget.status().spent == 500


def test_no_key_is_a_refusal_and_not_a_charge(isolated_db, monkeypatch):
    monkeypatch.delenv("RAPID_API_KEY", raising=False)

    fetched = reviews_api.fetch_reviews("ChIJ-anything")

    assert fetched.failed is True
    assert fetched.reason == "no RAPID_API_KEY"
    assert reviews_budget.status().spent == 0


def test_a_call_with_no_answer_is_charged_in_full(isolated_db, monkeypatch):
    """A request that never came back may still have been billed.

    Counting it as zero is the one error here that costs money, so the whole
    request is charged to the ledger.
    """
    import requests

    def _explode(*args, **kwargs):
        raise requests.exceptions.ConnectionError("no route")

    monkeypatch.setattr(requests, "get", _explode)
    monkeypatch.setenv("RAPID_API_KEY", "present")

    fetched = reviews_api.fetch_reviews("ChIJ-anything", limit=20)

    assert fetched.failed is True
    assert reviews_budget.status().spent == 20


def test_a_rejected_call_spends_nothing_but_still_records_their_counter(
    isolated_db, monkeypatch
):
    class _Response:
        status_code = 429
        headers = _Headers({"x-ratelimit-businesses-remaining": "0"})

    monkeypatch.setattr("requests.get", lambda *a, **k: _Response())
    monkeypatch.setenv("RAPID_API_KEY", "present")

    fetched = reviews_api.fetch_reviews("ChIJ-anything", limit=20)

    assert fetched.failed is True
    assert fetched.reason == "HTTP 429"
    budget = reviews_budget.status()
    assert budget.spent == 0
    # Their "nothing left" travelled on the rejection and now gates the next call.
    assert budget.remaining == 0
    assert reviews_budget.check(1) is not None


def test_star_only_reviews_are_bought_even_though_they_cannot_be_read(
    isolated_db, monkeypatch
):
    """Quota is charged per review returned, not per review worth reading.

    A large share of Google reviews are a rating and no words. They cost the
    same, and the gap has to be visible or the budget looks like it is buying
    more than it is.
    """

    class _Response:
        status_code = 200
        headers = _Headers({"x-ratelimit-businesses-remaining": "480"})

        @staticmethod
        def json():
            return {
                "status": "OK",
                "data": {
                    "name": "Example Wings",
                    "reviews": [
                        {"review_text": "Las alitas estaban buenas y bien picantes.", "rating": 5},
                        {"review_text": None, "rating": 4},
                        {"review_text": "   ", "rating": 3},
                    ],
                },
            }

    monkeypatch.setattr("requests.get", lambda *a, **k: _Response())
    monkeypatch.setenv("RAPID_API_KEY", "present")

    fetched = reviews_api.fetch_reviews("ChIJ-anything", limit=20)

    assert fetched.objects == 3
    assert len(fetched.with_text) == 1
    assert reviews_budget.status().spent == 3

    page = reviews_api.reviews_as_page(fetched, "ChIJ-anything")
    assert "1 review(s) of 3 bought" in page.note
    assert "2 were a star rating with no words" in page.note


def test_a_place_whose_reviews_are_all_silent_yields_no_page(isolated_db):
    fetched = reviews_api.ReviewFetch(
        "ChIJ-anything",
        reviews=[{"review_text": None, "rating": 5}],
        objects=1,
    )

    # No page, and not a failure either: a real answer about the place.
    assert reviews_api.reviews_as_page(fetched, "ChIJ-anything") is None
    assert fetched.failed is False


def test_a_review_block_carries_its_own_date_link_and_standing(isolated_db):
    """What the old Places path could not give a claim.

    Google's own endpoint returned "2 years ago", so a claim could not say when
    a customer said a thing. Each block now carries the exact day, the writer,
    and how much of a reviewer they are.
    """
    fetched = reviews_api.ReviewFetch(
        "ChIJ-anything",
        place_name="BarBarian",
        reviews=[
            {
                "author_name": "Handy",
                "rating": 3,
                "review_text": "Pedimos unas alitas y estaban con mal sabor, como guardadas.",
                "review_datetime_utc": "2020-01-08T15:04:05.000Z",
                "review_link": "https://www.google.com/maps/reviews/data=!abc",
                "author_review_count": 151,
                "author_local_guide_level": 7,
                "owner_response_text": "Lamentamos su experiencia.",
                "owner_response_datetime_utc": "2020-01-10T09:00:00.000Z",
            }
        ],
        objects=1,
    )

    page = reviews_api.reviews_as_page(fetched, "ChIJ-anything")

    assert "Handy" in page.text
    assert "3 stars" in page.text
    assert "written 2020-01-08" in page.text
    assert "151 reviews written" in page.text
    assert "Local Guide level 7" in page.text
    # The permalink is deliberately absent: ~170 characters each, nothing
    # downstream follows them, and twenty of them cost four real opinions.
    assert "https://www.google.com/maps/reviews/data=!abc" not in page.text
    assert "OWNER REPLY (2020-01-10)" in page.text
    # Still anchored to the branch by Place ID, which the address check relies on.
    assert page.branch_anchored is True
    assert page.origin == "google_reviews"


def test_the_date_falls_back_to_the_timestamp(isolated_db):
    fetched = reviews_api.ReviewFetch(
        "ChIJ-anything",
        reviews=[
            {
                "author_name": "Ana",
                "rating": 4,
                "review_text": "Buen ambiente y buena musica en la noche.",
                "review_timestamp": 1750000000,
            }
        ],
        objects=1,
    )

    page = reviews_api.reviews_as_page(fetched, "ChIJ-anything")

    assert "written 2025-06-15" in page.text


def test_an_older_response_shape_still_reads_as_reviews(isolated_db, monkeypatch):
    """The vendor has shipped both `reviews` and `reviews_data`.

    A rename on their side must not read as a place nobody has reviewed.
    """

    class _Response:
        status_code = 200
        headers = _Headers({})

        @staticmethod
        def json():
            return {
                "status": "OK",
                "data": {
                    "name": "Example",
                    "reviews_data": [
                        {"review_text": "Muy bueno, las alitas valen la pena.", "review_rating": 5},
                    ],
                },
            }

    monkeypatch.setattr("requests.get", lambda *a, **k: _Response())
    monkeypatch.setenv("RAPID_API_KEY", "present")

    fetched = reviews_api.fetch_reviews("ChIJ-anything")

    assert fetched.objects == 1
    page = reviews_api.reviews_as_page(fetched, "ChIJ-anything")
    assert "5 stars" in page.text


def test_the_reviews_page_obeys_the_same_ceiling_as_every_other_page(isolated_db):
    """Reviews arrive as one page, so without a cap they are the only text in
    the extraction prompt that ignores the limit the rest obey.

    At `limit=100` one unbounded page would be five times the size of any
    other, and the material that decides what gets written would be whatever
    happened to be longest.
    """
    from app.features.listicle_pipeline import source_reader

    long_text = "Las alitas estaban buenas y el ambiente agradable. " * 40
    fetched = reviews_api.ReviewFetch(
        "ChIJ-anything",
        reviews=[
            {
                "author_name": f"Reviewer {n}",
                "rating": 4,
                "review_text": f"{n}. {long_text}",
                "review_datetime_utc": "2025-06-15T12:00:00.000Z",
            }
            for n in range(100)
        ],
        objects=100,
    )

    page = reviews_api.reviews_as_page(fetched, "ChIJ-anything")

    assert len(page.text) <= source_reader.MAX_TEXT_CHARS
    # And it says what it left out, rather than quietly shortening itself.
    assert "ranked lower and did not fit the page" in page.note


def test_a_review_is_dropped_whole_rather_than_cut_in_half(isolated_db):
    """A sliced review is worse than a missing one.

    The check downstream asks whether a quoted sentence is really in this text.
    Half a review fails that check for a sentence the reviewer actually wrote,
    which reads as a fabricated quote rather than as a page that was too long.
    """
    from app.features.listicle_pipeline import source_reader

    body = "x" * 6000
    fetched = reviews_api.ReviewFetch(
        "ChIJ-anything",
        reviews=[
            {"author_name": f"R{n}", "rating": 5, "review_text": f"{n}{body}"}
            for n in range(5)
        ],
        objects=5,
    )

    page = reviews_api.reviews_as_page(fetched, "ChIJ-anything")

    assert len(page.text) <= source_reader.MAX_TEXT_CHARS
    # Every block that survived is a complete one: each still ends with the
    # full body it started with.
    for block in page.text.split("\n\n"):
        assert block.endswith(body), "a review was cut mid-text"


def test_one_review_longer_than_the_ceiling_is_still_carried(isolated_db):
    """Otherwise a single very long review would produce an empty page, and an
    empty page reads as a place nobody has reviewed."""
    fetched = reviews_api.ReviewFetch(
        "ChIJ-anything",
        reviews=[{"author_name": "R", "rating": 5, "review_text": "y" * 20000}],
        objects=1,
    )

    page = reviews_api.reviews_as_page(fetched, "ChIJ-anything")

    assert page is not None
    assert "y" * 20000 in page.text
