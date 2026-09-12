"""The shelf: every saved run, how far it got, and hiding the ones in the way.

A run was always stored. What the operator lacked was a way to see which runs
exist without remembering an eight-character id, and a way to clear test runs
off that list without losing what they bought.
"""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.listicle_pipeline.api as listicle_api
from app.core.database import get_db_connection
from app.features.listicle_pipeline import store
from tests.listicle_test_support import agreed_state


@pytest.fixture
def client(isolated_db, monkeypatch):
    def fake_search(prompt: str):
        return "Al Toke Pez | Surquillo | six stools", ["https://y.test"], 7

    monkeypatch.setattr(listicle_api, "_search_call", fake_search)
    app = FastAPI()
    app.include_router(listicle_api.router)
    return TestClient(app)


def _shelf(client, **params):
    response = client.get("/api/listicle-pipeline/runs", params=params)
    assert response.status_code == 200
    return {run["run_id"]: run for run in response.json()["runs"]}


def test_every_stage_is_named(client):
    store.save(agreed_state(run_id="searched", seed="The 20 best wings in Lima"))
    store.save(agreed_state(run_id="agreedonly"))
    asking = agreed_state(run_id="asking").model_copy(update={"status": "asking"})
    store.save(asking)
    client.post("/api/listicle-pipeline/search/searched")

    shelf = _shelf(client)

    assert shelf["searched"]["stage"] == "searched"
    assert shelf["searched"]["seed"] == "The 20 best wings in Lima"
    assert shelf["searched"]["found"] >= 1
    assert shelf["searched"]["target"] == 20
    assert shelf["agreedonly"]["stage"] == "agreed"
    assert shelf["agreedonly"]["found"] is None
    assert shelf["asking"]["stage"] == "interview"


def test_looking_at_the_shelf_writes_nothing(client):
    """An agreed run with no order gets one built the first time its order is
    read. The shelf must not be that first read for every run on it."""
    store.save(agreed_state(run_id="noorder"))

    _shelf(client)

    assert store.load_order("noorder") is None


def test_hiding_takes_a_run_off_the_shelf_and_nothing_else(client):
    store.save(agreed_state(run_id="old"))
    store.save(agreed_state(run_id="keep"))
    client.post("/api/listicle-pipeline/search/old")
    before = client.get("/api/listicle-pipeline/search/old").json()

    response = client.post(
        "/api/listicle-pipeline/runs/old/hidden", json={"hidden": True}
    )

    assert response.status_code == 200
    assert set(_shelf(client)) == {"keep"}
    hidden = _shelf(client, include_hidden=True)
    assert hidden["old"]["hidden"] is True
    # Still opens, and still holds exactly what it found.
    assert client.get("/api/listicle-pipeline/grill/old").status_code == 200
    after = client.get("/api/listicle-pipeline/search/old").json()
    assert after["found"] == before["found"]


def test_a_hidden_run_can_be_put_back(client):
    store.save(agreed_state(run_id="old"))
    client.post("/api/listicle-pipeline/runs/old/hidden", json={"hidden": True})
    client.post("/api/listicle-pipeline/runs/old/hidden", json={"hidden": False})

    assert _shelf(client)["old"]["hidden"] is False


def test_hiding_a_run_that_does_not_exist_is_a_404(client):
    response = client.post(
        "/api/listicle-pipeline/runs/nope/hidden", json={"hidden": True}
    )
    assert response.status_code == 404


def test_a_run_stored_in_an_old_shape_is_still_listed(client):
    """The first week's runs no longer validate as an interview. One of them
    must not take the whole shelf down."""
    store.save(agreed_state(run_id="fine"))
    old = json.loads(agreed_state(run_id="old").model_dump_json())
    old["turns"][0]["question"]["options"] = ["a bare string, as it once was"]
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_grills (run_id, state) VALUES (?, ?)",
            ("old", json.dumps(old)),
        )

    shelf = _shelf(client)

    assert set(shelf) == {"fine", "old"}
    assert shelf["old"]["status"] == "agreed"


def test_most_recently_worked_on_comes_first(client):
    store.save(agreed_state(run_id="first"))
    store.save(agreed_state(run_id="second"))
    with get_db_connection() as conn:
        conn.execute(
            "UPDATE listicle_grills SET updated_at = '2026-01-01 00:00:00' "
            "WHERE run_id = 'first'"
        )
        conn.execute(
            "UPDATE listicle_grills SET updated_at = '2026-02-01 00:00:00' "
            "WHERE run_id = 'second'"
        )
    client.post("/api/listicle-pipeline/search/first")

    order = list(_shelf(client))

    assert order == ["first", "second"]
