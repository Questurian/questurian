"""Settling "might be the same place" from the board.

The operator says which flagged places are the same and which one to keep, or
that they are different places. Removing is not deleting: a removed place goes
to the bottom of the board and can be put back, and the pool itself -- what the
searches found, and what each one contributed -- is never changed by it.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.listicle_pipeline.api as listicle_api
from app.features.listicle_pipeline import store
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
    app = FastAPI()
    app.include_router(listicle_api.router)
    return TestClient(app)


@pytest.fixture
def ids(client):
    store.save(agreed_state(run_id="wings"))
    body = client.post("/api/listicle-pipeline/search/wings").json()
    by_name = {c["name"]: c["candidate_id"] for c in body["candidates"]}
    assert {"Wingman", "Wingman Alitas Inc.", "Juno Wings"} <= set(by_name)
    return by_name


def _answer(client, **body):
    return client.post("/api/listicle-pipeline/board/wings/duplicates", json=body)


def test_same_place_keeps_the_chosen_one_and_removes_the_rest(client, ids):
    response = _answer(
        client,
        candidate_id=ids["Wingman"],
        same=[ids["Wingman Alitas Inc."]],
        keep=ids["Wingman"],
    )

    assert response.status_code == 200
    removed = response.json()["removed"]
    assert [(r["candidate_id"], r["kept_id"]) for r in removed] == [
        (ids["Wingman Alitas Inc."], ids["Wingman"])
    ]


def test_the_keeper_can_be_the_other_place(client, ids):
    board = _answer(
        client,
        candidate_id=ids["Wingman"],
        same=[ids["Wingman Alitas Inc."]],
        keep=ids["Wingman Alitas Inc."],
    ).json()

    assert [r["candidate_id"] for r in board["removed"]] == [ids["Wingman"]]


def test_different_places_are_remembered_as_a_pair(client, ids):
    board = _answer(
        client, candidate_id=ids["Juno Wings"], different=[ids["Wingman"]]
    ).json()

    assert board["removed"] == []
    assert board["distinct_pairs"] == [sorted([ids["Juno Wings"], ids["Wingman"]])]


def test_removing_does_not_touch_what_the_searches_found(client, ids):
    before = client.get("/api/listicle-pipeline/search/wings").json()
    _answer(
        client,
        candidate_id=ids["Wingman"],
        same=[ids["Wingman Alitas Inc."]],
        keep=ids["Wingman"],
    )
    after = client.get("/api/listicle-pipeline/search/wings").json()

    assert after["found"] == before["found"]
    assert [c["candidate_id"] for c in after["candidates"]] == [
        c["candidate_id"] for c in before["candidates"]
    ]


def test_a_removed_place_can_be_put_back(client, ids):
    _answer(
        client,
        candidate_id=ids["Wingman"],
        same=[ids["Wingman Alitas Inc."]],
        keep=ids["Wingman"],
    )

    response = client.post(
        "/api/listicle-pipeline/board/wings/restore",
        json={"candidate_id": ids["Wingman Alitas Inc."]},
    )

    assert response.status_code == 200
    assert response.json()["removed"] == []


def test_the_decisions_survive_a_reload(client, ids):
    _answer(client, candidate_id=ids["Juno Wings"], different=[ids["Wingman"]])

    board = client.get("/api/listicle-pipeline/board/wings").json()

    assert len(board["distinct_pairs"]) == 1


@pytest.mark.parametrize(
    "body",
    [
        # Same, with no keeper chosen.
        lambda ids: {"candidate_id": ids["Wingman"], "same": [ids["Wingman Alitas Inc."]]},
        # A keeper from outside the group it keeps.
        lambda ids: {
            "candidate_id": ids["Wingman"],
            "same": [ids["Wingman Alitas Inc."]],
            "keep": ids["Juno Wings"],
        },
        # Called both same and different.
        lambda ids: {
            "candidate_id": ids["Wingman"],
            "same": [ids["Juno Wings"]],
            "different": [ids["Juno Wings"]],
            "keep": ids["Wingman"],
        },
        # A place this run does not hold.
        lambda ids: {"candidate_id": ids["Wingman"], "different": ["not-a-place"]},
        # Nothing decided at all.
        lambda ids: {"candidate_id": ids["Wingman"]},
    ],
)
def test_an_answer_out_of_step_with_the_run_is_refused(client, ids, body):
    response = _answer(client, **body(ids))

    assert response.status_code == 400
    assert client.get("/api/listicle-pipeline/board/wings").json() == {
        "removed": [],
        "distinct_pairs": [],
    }


def test_a_run_that_does_not_exist_is_a_404(client):
    assert client.get("/api/listicle-pipeline/board/nope").status_code == 404
