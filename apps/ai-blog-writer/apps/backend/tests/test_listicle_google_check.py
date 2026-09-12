"""Checking the places on a board against Google.

Every lookup is billed on the owner's Google Cloud account, so these pin down
the spending rules as much as the answers: a place Google already answered for
is never asked again, removed places are not asked at all, a failed lookup is
retried, and no key means nothing is attempted. Google itself is faked; nothing
here reaches the network.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.listicle_pipeline.api as listicle_api
from app.features.listicle_pipeline import identity, store
from app.features.listicle_pipeline.identity import Lookup, ResolvedPlace
from tests.listicle_test_support import agreed_state

REPLY = (
    "Wingman | Miraflores | alitas y fútbol\n"
    "Wingman Alitas Inc. | Miraflores | wing bar\n"
    "Juno Wings | Barranco | alitas coreanas"
)


@pytest.fixture
def client(isolated_db, monkeypatch):
    monkeypatch.setattr(
        listicle_api, "_search_call", lambda prompt: (REPLY, ["https://x.test"], 9)
    )
    monkeypatch.setattr(identity, "api_key", lambda: "a-key")
    app = FastAPI()
    app.include_router(listicle_api.router)
    return TestClient(app)


@pytest.fixture
def ids(client):
    store.save(agreed_state(run_id="wings"))
    body = client.post("/api/listicle-pipeline/search/wings").json()
    return {c["name"]: c["candidate_id"] for c in body["candidates"]}


class FakeGoogle:
    """Answers by name, and counts what it was asked."""

    def __init__(self, answers: dict[str, Lookup]):
        self.answers = answers
        self.asked: list[str] = []

    def __call__(self, name: str, city: str, district: str = "") -> Lookup:
        self.asked.append(name)
        return self.answers.get(name, Lookup("not_found"))


def _place(name: str, **extra) -> ResolvedPlace:
    return ResolvedPlace(
        place_id=f"pid-{name}",
        name=name,
        address="Lima",
        types=("restaurant", "food"),
        **extra,
    )


def _use(monkeypatch, google: FakeGoogle) -> None:
    monkeypatch.setattr(identity, "lookup", google)


def test_each_place_gets_what_google_said(client, ids, monkeypatch):
    google = FakeGoogle(
        {
            "Wingman": Lookup(
                "found",
                _place(
                    "Wingman",
                    business_status="OPERATIONAL",
                    rating=4.4,
                    rating_count=1203,
                    price_level=2,
                ),
            ),
            "Juno Wings": Lookup(
                "found",
                _place("Juno Wings", business_status="CLOSED_PERMANENTLY", permanently_closed=True),
            ),
        }
    )
    _use(monkeypatch, google)

    body = client.post("/api/listicle-pipeline/google/wings").json()

    checks = body["checks"]
    assert checks[ids["Wingman"]]["rating"] == 4.4
    assert checks[ids["Wingman"]]["rating_count"] == 1203
    assert checks[ids["Wingman"]]["business_status"] == "OPERATIONAL"
    assert checks[ids["Juno Wings"]]["business_status"] == "CLOSED_PERMANENTLY"
    assert checks[ids["Wingman Alitas Inc."]]["status"] == "not_found"
    assert body["asked"] == 3


def test_a_place_google_answered_for_is_never_asked_again(client, ids, monkeypatch):
    google = FakeGoogle({"Wingman": Lookup("found", _place("Wingman"))})
    _use(monkeypatch, google)
    client.post("/api/listicle-pipeline/google/wings")

    again = client.post("/api/listicle-pipeline/google/wings").json()

    assert again["asked"] == 0
    assert len(google.asked) == 3


def test_a_failed_lookup_is_retried_and_is_not_called_missing(client, ids, monkeypatch):
    first = FakeGoogle({"Wingman": Lookup("failed", reason="Timeout")})
    _use(monkeypatch, first)
    body = client.post("/api/listicle-pipeline/google/wings").json()
    assert body["checks"][ids["Wingman"]]["status"] == "failed"

    second = FakeGoogle({"Wingman": Lookup("found", _place("Wingman"))})
    _use(monkeypatch, second)
    body = client.post("/api/listicle-pipeline/google/wings").json()

    assert second.asked == ["Wingman"]
    assert body["checks"][ids["Wingman"]]["status"] == "found"


def test_removed_places_are_not_looked_up(client, ids, monkeypatch):
    client.post(
        "/api/listicle-pipeline/board/wings/duplicates",
        json={
            "candidate_id": ids["Wingman"],
            "same": [ids["Wingman Alitas Inc."]],
            "keep": ids["Wingman"],
        },
    )
    google = FakeGoogle({})
    _use(monkeypatch, google)

    client.post("/api/listicle-pipeline/google/wings")

    assert "Wingman Alitas Inc." not in google.asked


def test_no_key_means_nothing_is_attempted(client, ids, monkeypatch):
    google = FakeGoogle({})
    _use(monkeypatch, google)
    monkeypatch.setattr(identity, "api_key", lambda: "")

    response = client.post("/api/listicle-pipeline/google/wings")

    assert response.status_code == 400
    assert "GOOGLE_MAPS_API_KEY" in response.json()["detail"]
    assert google.asked == []
    assert client.get("/api/listicle-pipeline/google/wings").json()["checks"] == {}


def test_reading_the_checks_never_looks_anything_up(client, ids, monkeypatch):
    google = FakeGoogle({})
    _use(monkeypatch, google)

    body = client.get("/api/listicle-pipeline/google/wings").json()

    assert body == {"checks": {}, "running": False}
    assert google.asked == []


def test_a_run_with_no_results_is_a_404(client, monkeypatch):
    store.save(agreed_state(run_id="unsearched"))
    _use(monkeypatch, FakeGoogle({}))

    assert client.post("/api/listicle-pipeline/google/unsearched").status_code == 404


class _Reply:
    def __init__(self, body):
        self.body = body
        self.status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return self.body


def _google_says(monkeypatch, body):
    import sys
    import types

    stub = types.ModuleType("requests")
    stub.get = lambda url, params, timeout: _Reply(body)
    monkeypatch.setitem(sys.modules, "requests", stub)
    monkeypatch.setattr(identity, "api_key", lambda: "a-key")


def test_a_refused_request_is_a_failure_not_a_missing_place(monkeypatch):
    _google_says(monkeypatch, {"status": "REQUEST_DENIED", "results": []})

    result = identity.lookup("Wingman", "Lima", "Miraflores")

    assert result.status == "failed"
    assert result.reason == "REQUEST_DENIED"


def test_no_match_is_not_found(monkeypatch):
    _google_says(monkeypatch, {"status": "ZERO_RESULTS", "results": []})

    assert identity.lookup("Nowhere Wings", "Lima").status == "not_found"


def test_a_match_carries_status_rating_and_price(monkeypatch):
    _google_says(
        monkeypatch,
        {
            "status": "OK",
            "results": [
                {
                    "place_id": "abc",
                    "name": "Wingman",
                    "formatted_address": "Av. Larco, Miraflores",
                    "types": ["bar", "restaurant"],
                    "business_status": "CLOSED_TEMPORARILY",
                    "rating": 4.3,
                    "user_ratings_total": 812,
                    "price_level": 2,
                }
            ],
        },
    )

    place = identity.lookup("Wingman", "Lima", "Miraflores").place

    assert place.business_status == "CLOSED_TEMPORARILY"
    assert place.permanently_closed is False
    assert (place.rating, place.rating_count, place.price_level) == (4.3, 812, 2)
    assert place.is_venue


def _closed_google():
    return FakeGoogle(
        {
            "Juno Wings": Lookup(
                "found",
                _place("Juno Wings", business_status="CLOSED_PERMANENTLY", permanently_closed=True),
            ),
            "Wingman Alitas Inc.": Lookup(
                "found", _place("Wingman Alitas Inc.", business_status="CLOSED_TEMPORARILY")
            ),
            "Wingman": Lookup("found", _place("Wingman", business_status="OPERATIONAL")),
        }
    )


def test_a_permanently_closed_place_comes_off_the_board(client, ids, monkeypatch):
    _use(monkeypatch, _closed_google())

    board = client.post("/api/listicle-pipeline/google/wings").json()["board"]

    assert [(r["candidate_id"], r["reason"]) for r in board["removed"]] == [
        (ids["Juno Wings"], "closed")
    ]


def test_temporarily_closed_stays_on_the_board(client, ids, monkeypatch):
    _use(monkeypatch, _closed_google())

    board = client.post("/api/listicle-pipeline/google/wings").json()["board"]

    assert ids["Wingman Alitas Inc."] not in {r["candidate_id"] for r in board["removed"]}


def test_putting_a_closed_place_back_dismisses_the_closure_for_good(client, ids, monkeypatch):
    _use(monkeypatch, _closed_google())
    client.post("/api/listicle-pipeline/google/wings")

    board = client.post(
        "/api/listicle-pipeline/board/wings/restore",
        json={"candidate_id": ids["Juno Wings"]},
    ).json()
    assert board["removed"] == []
    check = client.get("/api/listicle-pipeline/google/wings").json()["checks"][ids["Juno Wings"]]
    assert check["closed_dismissed"] is True
    # What Google said is kept; only the closure is overruled.
    assert check["business_status"] == "CLOSED_PERMANENTLY"

    # A later check does not take it off again.
    again = client.post("/api/listicle-pipeline/google/wings").json()["board"]
    assert again["removed"] == []


def test_closed_places_checked_before_this_rule_are_swept_up(client, ids, monkeypatch):
    """The owner's run was checked before closed places were removed. The
    next press of the button removes them without asking Google again."""
    from app.features.listicle_pipeline.service import _google_check_of

    store.save_google_check(
        "wings",
        ids["Juno Wings"],
        _google_check_of(
            Lookup("found", _place("Juno Wings", business_status="CLOSED_PERMANENTLY"))
        ),
    )
    for name in ("Wingman", "Wingman Alitas Inc."):
        store.save_google_check("wings", ids[name], _google_check_of(Lookup("found", _place(name))))
    google = FakeGoogle({})
    _use(monkeypatch, google)

    body = client.post("/api/listicle-pipeline/google/wings").json()

    assert google.asked == []
    assert [r["candidate_id"] for r in body["board"]["removed"]] == [ids["Juno Wings"]]


def test_a_duplicate_that_is_also_closed_stays_filed_as_a_duplicate(client, ids, monkeypatch):
    client.post(
        "/api/listicle-pipeline/board/wings/duplicates",
        json={
            "candidate_id": ids["Wingman"],
            "same": [ids["Juno Wings"]],
            "keep": ids["Wingman"],
        },
    )
    _use(monkeypatch, _closed_google())

    board = client.post("/api/listicle-pipeline/google/wings").json()["board"]

    juno = next(r for r in board["removed"] if r["candidate_id"] == ids["Juno Wings"])
    assert juno["reason"] == "duplicate"
    assert juno["kept_id"] == ids["Wingman"]


def _remove(client, candidate_id, reason):
    return client.post(
        "/api/listicle-pipeline/board/wings/remove",
        json={"candidate_id": candidate_id, "reason": reason},
    )


def test_a_place_can_be_removed_by_hand_and_put_back(client, ids):
    board = _remove(client, ids["Juno Wings"], "by_hand").json()

    assert [(r["candidate_id"], r["reason"]) for r in board["removed"]] == [
        (ids["Juno Wings"], "by_hand")
    ]
    back = client.post(
        "/api/listicle-pipeline/board/wings/restore",
        json={"candidate_id": ids["Juno Wings"]},
    ).json()
    assert back["removed"] == []


def test_not_a_venue_is_only_accepted_when_google_said_so(client, ids, monkeypatch):
    refused = _remove(client, ids["Wingman"], "not_a_venue")
    assert refused.status_code == 400

    store_place = ResolvedPlace("pid", "Lima Grove Tv", "Lima", ("establishment", "point_of_interest"))
    _use(monkeypatch, FakeGoogle({"Wingman": Lookup("found", store_place)}))
    client.post("/api/listicle-pipeline/google/wings")

    board = _remove(client, ids["Wingman"], "not_a_venue").json()
    assert [(r["candidate_id"], r["reason"]) for r in board["removed"]] == [
        (ids["Wingman"], "not_a_venue")
    ]

    # Putting it back says Google got it wrong; the note stops showing.
    client.post("/api/listicle-pipeline/board/wings/restore", json={"candidate_id": ids["Wingman"]})
    check = client.get("/api/listicle-pipeline/google/wings").json()["checks"][ids["Wingman"]]
    assert check["venue_dismissed"] is True


def test_removing_refuses_an_unknown_reason_or_place(client, ids):
    assert _remove(client, ids["Wingman"], "because").status_code == 400
    assert _remove(client, "not-a-place", "by_hand").status_code == 400
    assert client.get("/api/listicle-pipeline/board/wings").json()["removed"] == []


def test_removing_by_hand_does_not_refile_a_duplicate(client, ids):
    client.post(
        "/api/listicle-pipeline/board/wings/duplicates",
        json={"candidate_id": ids["Wingman"], "same": [ids["Juno Wings"]], "keep": ids["Wingman"]},
    )

    board = _remove(client, ids["Juno Wings"], "by_hand").json()

    juno = next(r for r in board["removed"] if r["candidate_id"] == ids["Juno Wings"])
    assert juno["reason"] == "duplicate"
