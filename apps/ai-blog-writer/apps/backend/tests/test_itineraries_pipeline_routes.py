from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.itineraries_pipeline.routes as itineraries_pipeline_routes


class _StubLLM:
    def __init__(self, response_text: str) -> None:
        self._response_text = response_text
        self.last_prompt: str | None = None

    def invoke(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self._response_text


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(itineraries_pipeline_routes.router)
    return TestClient(app)


def test_generate_titles_returns_model_output(monkeypatch):
    monkeypatch.setattr(
        itineraries_pipeline_routes,
        "get_vertex_llm",
        lambda **_kwargs: _StubLLM("1. First title\n2. Second title\n"),
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
