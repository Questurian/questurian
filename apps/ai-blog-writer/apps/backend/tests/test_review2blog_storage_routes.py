import json
import sys
import time
import types

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import clear_all_runs

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
sys.modules["utils"] = utils_stub

import app.features.review2blog.routes as review2blog_routes


class _StubCategoryAwareLLM:
    def invoke(self, prompt: str) -> str:
        if "You are extracting evidence-backed review claims" in prompt:
            return json.dumps(
                [
                    {
                        "review_id": "rev-1",
                        "review_date": "2025-01-15",
                        "review_sentiment": "positive",
                        "claims": [
                            {
                                "topic": "food",
                                "subject": "ceviche",
                                "polarity": "positive",
                                "strength": "high",
                                "specificity": "high",
                                "quote": "Amazing ceviche",
                                "named_entity": "ceviche",
                            },
                            {
                                "topic": "service",
                                "subject": "warm service",
                                "polarity": "positive",
                                "strength": "medium",
                                "specificity": "medium",
                                "quote": "warm service",
                                "named_entity": "",
                            },
                        ],
                    },
                    {
                        "review_id": "rev-2",
                        "review_date": "2025-01-10",
                        "review_sentiment": "positive",
                        "claims": [
                            {
                                "topic": "food",
                                "subject": "ceviche",
                                "polarity": "positive",
                                "strength": "high",
                                "specificity": "high",
                                "quote": "The ceviche was bright and fresh",
                                "named_entity": "ceviche",
                            },
                            {
                                "topic": "atmosphere",
                                "subject": "lively room",
                                "polarity": "positive",
                                "strength": "medium",
                                "specificity": "medium",
                                "quote": "a lively room",
                                "named_entity": "",
                            },
                        ],
                    },
                ]
            )
        if "You are writing a curated blurb" in prompt:
            return (
                "Mar y Sol stands out for repeated praise around ceviche, warm service, and a lively room "
                "that still reads comfortable for dinner. Across the review set, ceviche is the clearest draw "
                "and the most consistently named item. Service shows up as warm rather than showy, which keeps "
                "the experience polished. The overall impression is a Barranco seafood restaurant with enough "
                "energy to feel current without losing its footing."
            )
        if "Rewrite this curated blurb" in prompt:
            return (
                "Mar y Sol stands out for repeated praise around ceviche, warm service, and a lively room "
                "that still reads comfortable for dinner. Across the review set, ceviche is the clearest draw "
                "and the most consistently named item. Service shows up as warm rather than showy, which keeps "
                "the experience polished. The overall impression is a Barranco seafood restaurant with enough "
                "energy to feel current without losing its footing."
            )
        raise AssertionError(f"Unexpected prompt sent to stub LLM: {prompt[:160]}")


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(review2blog_routes.router)
    return TestClient(app)


def _wait_for_status(client: TestClient, run_id: str, target_states: set[str]) -> dict[str, object]:
    last_payload: dict[str, object] | None = None
    for _ in range(40):
        response = client.get(f"/review2blog/status/{run_id}")
        assert response.status_code == 200
        last_payload = response.json()
        if last_payload["state"] in target_states:
            break
        time.sleep(0.05)
    assert last_payload is not None
    return last_payload


def _build_dining_export() -> dict[str, object]:
    return {
        "category": "dining",
        "name": "Mar y Sol",
        "type": "seafood-restaurant",
        "district": "Barranco",
        "locationKey": "peru|lima|barranco",
        "priceLevel": "$$$",
        "idealFor": ["date night", "seafood lovers"],
        "tripadvisorCuisines": ["Peruvian", "Seafood"],
        "tripadvisorMealTypes": ["Dinner"],
        "tripadvisorFeatures": ["Reservations", "Outdoor Seating"],
        "operationHours": {"hours": [{"day": "Monday", "hours": "12:00-22:00"}]},
        "editorial": {
            "placement_type": "curated guide",
            "selection_angle": "review-backed seafood dinner pick",
            "audience": "travelers",
            "tone": "grounded_editorial",
            "must_mention": ["Barranco"],
            "avoid": ["best"],
        },
        "reviews": [
            {
                "reviewId": "rev-1",
                "source": "google",
                "date": "2025-01-15",
                "rating": 5,
                "text": "Amazing ceviche and warm service in a lively room.",
            },
            {
                "reviewId": "rev-2",
                "source": "google",
                "date": "2025-01-10",
                "rating": 5,
                "text": "The ceviche was bright and fresh, and the room felt lively.",
            },
        ],
    }


def test_review2blog_run_completes_with_category_aware_artifact(monkeypatch):
    clear_all_runs(feature="review2blog")
    monkeypatch.setattr(
        review2blog_routes.category_pipeline,
        "get_vertex_llm",
        lambda **_kwargs: _StubCategoryAwareLLM(),
    )

    client = _build_client()
    run_response = client.post(
        "/review2blog/run",
        json={
            "review_payload": _build_dining_export(),
            "listicle": {
                "listicle_title": "Best Seafood Spots in Barranco",
                "blurb_length": "medium",
            },
            "max_tokens": 4096,
        },
    )

    assert run_response.status_code == 200
    run_id = run_response.json()["run_id"]

    completed_status = _wait_for_status(client, run_id, {"completed", "failed"})
    assert completed_status["feature"] == "review2blog"
    assert completed_status["state"] == "completed"
    assert completed_status["stage"] == "complete"

    result_response = client.get(f"/review2blog/result/{run_id}")
    assert result_response.status_code == 200
    result_payload = result_response.json()
    assert result_payload["run_id"] == run_id
    assert result_payload["markdown"].startswith("# Mar y Sol")

    artifact = result_payload["artifact"]["review2blog_run"]
    assert artifact["location_context"]["name"] == "Mar y Sol"
    assert artifact["editorial_intent"]["selection_angle"] == "review-backed seafood dinner pick"
    assert artifact["listicle"]["listicle_title"] == "Best Seafood Spots in Barranco"
    assert artifact["listicle"]["blurb_length"] == "medium"
    assert artifact["phase_outputs"]["phase1_summary"]["category"] == "dining"
    assert artifact["phase_outputs"]["phase1_summary"]["claim_count"] == 4
    assert artifact["phase_outputs"]["phase2_profile"]["category"] == "dining"
    assert artifact["phase_outputs"]["phase2_profile"]["ranked_claims"][0]["subject"] == "ceviche"
    assert artifact["phase_outputs"]["phase3"]["blurb"]

    articles_response = client.get("/review2blog/articles")
    assert articles_response.status_code == 200
    articles = articles_response.json()
    matching = [item for item in articles if item["run_id"] == run_id]
    assert matching
    assert matching[0]["title"] == "Best Seafood Spots in Barranco"
    assert matching[0]["article_type"] == "review2blog"

    clear_all_runs(feature="review2blog")


def test_review2blog_run_rejects_missing_category_specific_fields(monkeypatch):
    clear_all_runs(feature="review2blog")
    monkeypatch.setattr(
        review2blog_routes.category_pipeline,
        "get_vertex_llm",
        lambda **_kwargs: _StubCategoryAwareLLM(),
    )

    client = _build_client()
    invalid_payload = _build_dining_export()
    invalid_payload.pop("tripadvisorCuisines")

    response = client.post(
        "/review2blog/run",
        json={"review_payload": invalid_payload},
    )

    assert response.status_code == 400
    assert "tripadvisorCuisines" in response.json()["detail"]

    clear_all_runs(feature="review2blog")


def test_review2blog_run_requires_listicle_title_and_blurb_length(monkeypatch):
    clear_all_runs(feature="review2blog")
    monkeypatch.setattr(
        review2blog_routes.category_pipeline,
        "get_vertex_llm",
        lambda **_kwargs: _StubCategoryAwareLLM(),
    )

    client = _build_client()
    response = client.post(
        "/review2blog/run",
        json={"review_payload": _build_dining_export()},
    )

    assert response.status_code == 400
    assert "listicle_title and blurb_length are required" in response.json()["detail"]

    clear_all_runs(feature="review2blog")


def test_review2blog_articles_can_filter_multiple_blurbs_by_location(monkeypatch):
    clear_all_runs(feature="review2blog")
    monkeypatch.setattr(
        review2blog_routes.category_pipeline,
        "get_vertex_llm",
        lambda **_kwargs: _StubCategoryAwareLLM(),
    )

    client = _build_client()

    first_run = client.post(
        "/review2blog/run",
        json={
            "review_payload": _build_dining_export(),
            "listicle": {
                "listicle_title": "Best Seafood Spots in Barranco",
                "blurb_length": "medium",
            },
            "max_tokens": 4096,
        },
    )
    assert first_run.status_code == 200
    first_run_id = first_run.json()["run_id"]
    assert _wait_for_status(client, first_run_id, {"completed", "failed"})["state"] == "completed"

    second_run = client.post(
        "/review2blog/run",
        json={
            "review_payload": _build_dining_export(),
            "listicle": {
                "listicle_title": "Where to Eat Ceviche in Barranco",
                "blurb_length": "medium",
            },
            "max_tokens": 4096,
        },
    )
    assert second_run.status_code == 200
    second_run_id = second_run.json()["run_id"]
    assert _wait_for_status(client, second_run_id, {"completed", "failed"})["state"] == "completed"

    response = client.get("/review2blog/articles", params={"location_key": "peru|lima|barranco"})
    assert response.status_code == 200
    payload = response.json()

    assert len(payload) == 2
    assert {item["run_id"] for item in payload} == {first_run_id, second_run_id}
    assert {item["listicle_title"] for item in payload} == {
        "Best Seafood Spots in Barranco",
        "Where to Eat Ceviche in Barranco",
    }
    assert {item["location_key"] for item in payload} == {"peru|lima|barranco"}
    assert {item["location_name"] for item in payload} == {"Mar y Sol"}

    clear_all_runs(feature="review2blog")
