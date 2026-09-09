"""The HTTP boundary: what a search returns, and what a reopened run reads.

The first of the six confirmed faults lived here and nowhere else. Every
successful search was passed through the interview's view builder, which reads
`.run_id` off a `GrillState`; a search returns a dict. So a search that worked,
and whose results were already safely stored, was reported to the operator as a
failure -- and the only way to see the results was to pay for them again.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.listicle_pipeline.api as listicle_api
from app.features.listicle_pipeline import store
from tests.listicle_test_support import agreed_state


@pytest.fixture
def client(isolated_db, monkeypatch):
    def fake_search(prompt: str):
        if "decades" in prompt:
            return "Canta Rana | Barranco | open since the 1980s", ["https://x.test"], 9
        return "Al Toke Pez | Surquillo | six stools", ["https://y.test"], 7

    monkeypatch.setattr(listicle_api, "_search_call", fake_search)
    app = FastAPI()
    app.include_router(listicle_api.router)
    return TestClient(app)


@pytest.fixture
def run(client):
    state = agreed_state()
    store.save(state)
    return state


def test_a_successful_search_comes_back_as_a_successful_search(client, run):
    """The whole first fault, stated as a test. No network: the one path that
    reaches the web is replaced above."""
    response = client.post(f"/api/listicle-pipeline/search/{run.run_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["found"] == 2
    assert {c["name"] for c in body["candidates"]} == {"Canta Rana", "Al Toke Pez"}


def test_the_results_can_be_read_back_afterwards(client, run):
    client.post(f"/api/listicle-pipeline/search/{run.run_id}")
    response = client.get(f"/api/listicle-pipeline/search/{run.run_id}")
    assert response.status_code == 200
    assert response.json()["found"] == 2


def test_reading_before_anything_has_run_is_a_state_not_a_result(client, run):
    response = client.get(f"/api/listicle-pipeline/search/{run.run_id}")
    assert response.status_code == 404


def test_a_missing_run_is_still_a_404(client):
    assert client.post("/api/listicle-pipeline/search/nope").status_code == 404


def test_an_unagreed_order_is_still_a_400(client, isolated_db):
    from app.features.prompt2blog.contracts_v4 import GrillQuestion, GrillState
    from app.features.listicle_pipeline.contracts import LISTICLE_MARKER_KEYS

    store.save(
        GrillState(
            run_id="halfway",
            seed="20 cevicherias in Lima",
            status="asking",
            marker_keys=LISTICLE_MARKER_KEYS,
            pending=GrillQuestion(
                question_id="q1", topic="count", ask="How many?", recommendation="20"
            ),
        )
    )
    response = client.post("/api/listicle-pipeline/search/halfway")
    assert response.status_code == 400
    assert "not agreed" in response.json()["detail"]


def test_the_order_is_readable_and_says_where_its_count_came_from(client, run):
    response = client.get(f"/api/listicle-pipeline/order/{run.run_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["target_count"] == 20
    assert body["count_source"] in {"answered", "accepted", "corrected"}
    assert len(body["angles"]) == 2
    assert body["summary"].startswith("20 cevicherias")


def test_correcting_the_count_makes_a_new_revision(client, run):
    client.get(f"/api/listicle-pipeline/order/{run.run_id}")
    response = client.post(
        f"/api/listicle-pipeline/order/{run.run_id}", json={"target_count": 12}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["target_count"] == 12
    assert body["revision"] == 2


def test_a_retry_names_the_angles_it_wants(client, run):
    client.post(f"/api/listicle-pipeline/search/{run.run_id}")
    order = client.get(f"/api/listicle-pipeline/order/{run.run_id}").json()
    one = order["angles"][0]["angle_id"]
    response = client.post(
        f"/api/listicle-pipeline/search/{run.run_id}",
        json={"angle_ids": [one], "reuse": False},
    )
    assert response.status_code == 200
    assert response.json()["found"] == 2


def test_the_shape_catalogue_says_what_each_shape_applies_to(client):
    response = client.get("/api/listicle-pipeline/shapes")
    assert response.status_code == 200
    shapes = {s["key"]: s for s in response.json()["shapes"]}
    assert shapes["informal"]["applies_to"] == ["restaurants"]
    assert shapes["long-stay"]["applies_to"] == ["hotels"]
    # Shared shapes apply to everything, said as an empty list rather than as
    # every subject spelled out -- a new subject must not need this edited.
    assert shapes["cheap"]["applies_to"] == []
    assert "overlaps_with" in shapes["award"]


def test_a_search_that_is_already_running_is_refused_rather_than_doubled(client, run):
    store.claim_batch(run.run_id, 1)
    response = client.post(f"/api/listicle-pipeline/search/{run.run_id}")
    assert response.status_code == 400
    assert "already running" in response.json()["detail"]
