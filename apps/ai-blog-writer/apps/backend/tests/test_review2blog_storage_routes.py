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
sys.modules.setdefault("utils", utils_stub)

import app.features.review2blog.routes as review2blog_routes


class _StubReview2BlogLLM:
    def invoke(self, prompt: str) -> str:
        if "INPUT JSON ARRAY" in prompt and "experience signal" in prompt:
            return json.dumps(
                [
                    {
                        "d": "2025-01-15",
                        "r": 5,
                        "s": 1,
                        "vc": [2, 4, 3],
                        "e": {
                            "f": [["ceviche", "fresh"], 3],
                            "sv": [["attentive"], 2],
                            "a": [["buzzy"], 2],
                            "l": [[], 0],
                            "v": [["worth it"], 2],
                        },
                        "dm": ["ceviche", "pisco sour"],
                        "sp": ["amazing ceviche"],
                        "t": [10],
                        "tg": [],
                        "spc": 3,
                    }
                ]
            )
        if "Aggregate them into this format" in prompt:
            return json.dumps(
                {
                    "review_count": 1,
                    "average_rating": 5.0,
                    "food": {
                        "top_descriptors": ["fresh", "vibrant"],
                        "top_dishes": ["ceviche", "pisco sour"],
                        "emotional_tone": ["appreciative"],
                    },
                    "service": {
                        "top_descriptors": ["attentive"],
                        "reliability": "high",
                        "energy": "warm",
                    },
                    "atmosphere": {
                        "top_descriptors": ["buzzy"],
                        "noise_level": "moderate",
                        "best_for": ["date"],
                    },
                    "value": {"perception": "good", "notes": ["Strong value"]},
                    "crowd": {
                        "group_types": ["couples"],
                        "common_occasions": ["date night"],
                    },
                    "overall_vibe": "Vibrant seafood date-night spot",
                }
            )
        if "Restaurant Listicle Blurb Generator" in prompt:
            return (
                "A polished, listicle-ready paragraph that highlights vibrant seafood, "
                "attentive service, and date-night energy."
            )
        raise AssertionError(f"Unexpected prompt sent to stub LLM: {prompt[:120]}")


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(review2blog_routes.router)
    return TestClient(app)


def test_review2blog_run_persists_status_result_and_articles(monkeypatch):
    clear_all_runs(feature="review2blog")
    monkeypatch.setattr(
        review2blog_routes,
        "get_vertex_llm",
        lambda **_kwargs: _StubReview2BlogLLM(),
    )

    client = _build_client()
    run_response = client.post(
        "/review2blog/run",
        json={
            "review_payload": {
                "name": "Mar y Sol",
                "district": "Barranco",
                "description": "Contemporary seafood-focused restaurant.",
                "reviews_summary": "Strong ratings for ceviche and cocktails.",
                "reviews": [
                    {
                        "text": "Amazing ceviche and warm service.",
                        "rating": 5,
                        "date": "2025-01-15",
                    }
                ],
            },
            "listicle": {
                "listicle_type": "Date Night",
                "listicle_title": "Best Barranco Date Night Spots",
                "listicle_goal": "Highlight romantic and lively restaurant picks.",
            },
            "max_tokens": 4096,
        },
    )

    assert run_response.status_code == 200
    run_payload = run_response.json()
    run_id = run_payload.get("run_id")
    assert isinstance(run_id, str) and run_id

    status_payload = None
    for _ in range(40):
        status_response = client.get(f"/review2blog/status/{run_id}")
        assert status_response.status_code == 200
        status_payload = status_response.json()
        if status_payload["state"] in {"completed", "failed"}:
            break
        time.sleep(0.05)

    assert status_payload is not None
    assert status_payload["feature"] == "review2blog"
    assert status_payload["state"] == "completed"

    result_response = client.get(f"/review2blog/result/{run_id}")
    assert result_response.status_code == 200
    result_payload = result_response.json()
    assert result_payload["run_id"] == run_id
    assert result_payload["markdown"].startswith("# Best Barranco Date Night Spots")
    assert "listicle" in result_payload["artifact"]["review2blog_run"]

    articles_response = client.get("/review2blog/articles")
    assert articles_response.status_code == 200
    articles = articles_response.json()
    matching = [item for item in articles if item["run_id"] == run_id]
    assert matching
    assert matching[0]["title"] == "Best Barranco Date Night Spots"
    assert matching[0]["article_type"] == "review2blog"

    clear_all_runs(feature="review2blog")
