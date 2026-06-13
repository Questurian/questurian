"""Route tests for the itinerary day-blurb composer (ADR 0019)."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.editor_assist.routes as editor_assist_routes


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(editor_assist_routes.router)
    return TestClient(app)


def _paragraph(word_count: int, *, token: str = "editorial") -> str:
    return " ".join([token] * word_count)


def _writer_returning(text: str):
    class _WriterResult:
        def __init__(self) -> None:
            self.text = text
            self.model_name = editor_assist_routes.DEFAULT_MODEL

    return lambda **_kwargs: _WriterResult()


def _request_body(**overrides):
    body = {
        "article_title": "Two Days in Lima",
        "location_label": "Lima, Peru",
        "list_tone": "elevated",
        "intro": "A two-day Lima opener.",
        "plan_overview": "A Barranco-anchored foodie trip.",
        "day_label": "Day 1",
        "day_count": 2,
        "next_day_first_stop": {"title": "Museo Larco", "category": "Attractions"},
        "stops": [
            {"target_id": "ws-1_blurb", "title": "Grand Hotel", "category": "Accommodations", "angle": "location-and-setting"},
            {"target_id": "stop-1_blurb", "title": "Mérito", "category": "Dining", "angle": "signature-dish"},
        ],
    }
    body.update(overrides)
    return body


def test_day_blurbs_composes_one_paragraph_per_stop(monkeypatch):
    text = (
        f"<<<BLURB:ws-1_blurb>>>\n{_paragraph(100)}\n<<<END>>>\n"
        f"<<<BLURB:stop-1_blurb>>>\n{_paragraph(110)}\n<<<END>>>"
    )
    monkeypatch.setattr(editor_assist_routes, "invoke_writer_model", _writer_returning(text))

    client = _build_client()
    response = client.post("/editor-assist/compose-itinerary-day-blurbs", json=_request_body())

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_used"] == editor_assist_routes.DEFAULT_MODEL

    results = payload["results"]
    assert results["ws-1_blurb"]["status"] == "generated"
    assert results["ws-1_blurb"]["markdown"] == _paragraph(100)
    assert results["ws-1_blurb"]["validation_errors"] == []
    assert results["stop-1_blurb"]["status"] == "generated"

    # Report timeline: inputs, writer, one step per stop, finalize.
    step_names = [step["name"] for step in payload["steps"]]
    assert step_names[0] == "inputs"
    assert step_names[1] == "writer"
    assert "stop:ws-1_blurb" in step_names
    assert step_names[-1] == "finalize"


def test_day_blurbs_marks_missing_stop_as_error(monkeypatch):
    # Writer only returned a block for one of the two requested stops.
    text = f"<<<BLURB:stop-1_blurb>>>\n{_paragraph(100)}\n<<<END>>>"
    monkeypatch.setattr(editor_assist_routes, "invoke_writer_model", _writer_returning(text))

    client = _build_client()
    response = client.post("/editor-assist/compose-itinerary-day-blurbs", json=_request_body())

    assert response.status_code == 200
    results = response.json()["results"]
    assert results["stop-1_blurb"]["status"] == "generated"
    assert results["ws-1_blurb"]["status"] == "error"
    assert results["ws-1_blurb"]["markdown"] is None


def test_day_blurbs_flags_validation_without_dropping_output(monkeypatch):
    # A too-short blurb still lands, but carries a validation warning (ADR 0019:
    # output contract preserved, surfaced rather than auto-retried).
    text = f"<<<BLURB:stop-1_blurb>>>\nToo short.\n<<<END>>>"
    monkeypatch.setattr(editor_assist_routes, "invoke_writer_model", _writer_returning(text))

    client = _build_client()
    body = _request_body(stops=[{"target_id": "stop-1_blurb", "title": "Mérito", "category": "Dining", "angle": "signature-dish"}])
    response = client.post("/editor-assist/compose-itinerary-day-blurbs", json=body)

    assert response.status_code == 200
    result = response.json()["results"]["stop-1_blurb"]
    assert result["status"] == "generated"
    assert result["validation_errors"]  # non-empty


def test_day_blurbs_no_parseable_blocks_is_502(monkeypatch):
    monkeypatch.setattr(
        editor_assist_routes,
        "invoke_writer_model",
        _writer_returning("Sorry, I could not write these."),
    )

    client = _build_client()
    response = client.post("/editor-assist/compose-itinerary-day-blurbs", json=_request_body())

    assert response.status_code == 502


def test_day_blurbs_requires_a_stop():
    client = _build_client()
    response = client.post(
        "/editor-assist/compose-itinerary-day-blurbs",
        json=_request_body(stops=[]),
    )
    assert response.status_code == 400
