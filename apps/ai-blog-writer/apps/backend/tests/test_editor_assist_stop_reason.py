"""Route tests for the itinerary stop selection-reason composer (ADR 0020)."""

from dataclasses import replace

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.editor_assist.routes as editor_assist_routes
import app.features.editor_assist.itinerary_composition as itinerary_composition
from app.features.editor_assist.dependencies import get_editor_assist_dependencies


def _build_client(*, writer=None) -> TestClient:
    app = FastAPI()
    app.include_router(editor_assist_routes.router)
    dependencies = get_editor_assist_dependencies()
    if writer is not None:
        dependencies = replace(dependencies, invoke_writer=writer)
    app.dependency_overrides[get_editor_assist_dependencies] = lambda: dependencies
    return TestClient(app)


def _writer_returning(text: str):
    class _WriterResult:
        def __init__(self) -> None:
            self.text = text
            self.model_name = "gemini-2.5-flash-lite"

    return lambda **_kwargs: _WriterResult()


def _capturing_writer(text: str, sink: dict):
    def _call(**kwargs):
        sink["prompt"] = kwargs.get("prompt", "")

        class _WriterResult:
            def __init__(self) -> None:
                self.text = text
                self.model_name = "gemini-2.5-flash-lite"

        return _WriterResult()

    return _call


def _request_body(**overrides):
    body = {
        "rough_reason": "great rooftop, perfect for the sunset slot",
        "title": "Mérito",
        "category": "Dining",
        "daypart": "evening",
        "angle": "signature-dish",
        "article_title": "Two Days in Lima",
        "location_label": "Lima, Peru",
        "plan_overview": "A Barranco-anchored foodie trip.",
    }
    body.update(overrides)
    return body


def test_stop_reason_refines_rough_note(monkeypatch):
    refined = "A buzzy Barranco rooftop whose sunset views and ceviche make it the natural evening anchor."
    client = _build_client(writer=_writer_returning(refined))
    response = client.post(
        "/editor-assist/compose-itinerary-stop-reason", json=_request_body()
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["reason"] == refined
    assert payload["model_used"] == "gemini-2.5-flash-lite"


def test_stop_reason_passes_rough_note_and_context_to_writer(monkeypatch):
    sink: dict = {}
    client = _build_client(writer=_capturing_writer("refined reason", sink))
    response = client.post(
        "/editor-assist/compose-itinerary-stop-reason", json=_request_body()
    )

    assert response.status_code == 200
    prompt = sink["prompt"]
    # The operator's rough note is the substance, carried verbatim into the prompt.
    assert "great rooftop, perfect for the sunset slot" in prompt
    # Stop identity + trip framing are present as context.
    assert "Mérito" in prompt
    assert "Lima, Peru" in prompt
    assert "Barranco-anchored" in prompt


def test_stop_reason_strips_generation_fence(monkeypatch):
    client = _build_client(
        writer=_writer_returning("```\nA clean refined reason.\n```")
    )
    response = client.post(
        "/editor-assist/compose-itinerary-stop-reason", json=_request_body()
    )

    assert response.status_code == 200
    assert response.json()["reason"] == "A clean refined reason."


def test_stop_reason_empty_output_is_502(monkeypatch):
    client = _build_client(writer=_writer_returning("   "))
    response = client.post(
        "/editor-assist/compose-itinerary-stop-reason", json=_request_body()
    )

    assert response.status_code == 502


def test_stop_reason_requires_rough_reason():
    client = _build_client()
    response = client.post(
        "/editor-assist/compose-itinerary-stop-reason",
        json=_request_body(rough_reason=""),
    )
    # min_length=1 -> 422 from validation; whitespace-only -> 400 from impl.
    assert response.status_code == 422

    response = client.post(
        "/editor-assist/compose-itinerary-stop-reason",
        json=_request_body(rough_reason="   "),
    )
    assert response.status_code == 400
