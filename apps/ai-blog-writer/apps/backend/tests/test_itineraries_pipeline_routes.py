from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.itineraries_pipeline.routes as itineraries_pipeline_routes
from app.shared.writer_invocation import WriterResult


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(itineraries_pipeline_routes.router)
    return TestClient(app)


def test_generate_titles_returns_model_output(monkeypatch):
    monkeypatch.setattr(
        itineraries_pipeline_routes,
        "invoke_writer_model",
        lambda **_kwargs: WriterResult(
            text="1. First title\n2. Second title\n",
            model_name=itineraries_pipeline_routes.DEFAULT_MODEL,
        ),
    )

    client = _build_client()
    response = client.post(
        "/itineraries-pipeline/generate-titles",
        json={"prompt": "x" * 25},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["text"] == "1. First title\n2. Second title"
    assert payload["model_used"] == itineraries_pipeline_routes.DEFAULT_MODEL


def test_generate_titles_rejects_short_prompt():
    client = _build_client()
    response = client.post(
        "/itineraries-pipeline/generate-titles",
        json={"prompt": "short"},
    )
    assert response.status_code == 422
