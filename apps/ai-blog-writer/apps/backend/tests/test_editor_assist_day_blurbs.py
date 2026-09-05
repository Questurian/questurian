"""Route tests for the itinerary day-blurb composer (ADR 0019)."""

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


def _paragraph(word_count: int, *, token: str = "editorial") -> str:
    return " ".join([token] * word_count)


def _writer_returning(text: str):
    class _WriterResult:
        def __init__(self) -> None:
            self.text = text
            self.model_name = "gemini-2.5-flash-lite"

    return lambda **_kwargs: _WriterResult()


def _writer_capturing(text: str, sink: dict):
    class _WriterResult:
        def __init__(self) -> None:
            self.text = text
            self.model_name = "gemini-2.5-flash-lite"

    def _invoke(**kwargs):
        sink["prompt"] = kwargs.get("prompt", "")
        return _WriterResult()

    return _invoke


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
            {
                "target_id": "ws-1_blurb",
                "title": "Grand Hotel",
                "category": "Accommodations",
                "angle": "location-and-setting",
            },
            {
                "target_id": "stop-1_blurb",
                "title": "Mérito",
                "category": "Dining",
                "angle": "signature-dish",
            },
        ],
    }
    body.update(overrides)
    return body


def test_day_blurbs_composes_one_paragraph_per_stop(monkeypatch):
    text = (
        f"<<<BLURB:ws-1_blurb>>>\n{_paragraph(100)}\n<<<END>>>\n"
        f"<<<BLURB:stop-1_blurb>>>\n{_paragraph(110)}\n<<<END>>>"
    )
    client = _build_client(writer=_writer_returning(text))
    response = client.post(
        "/editor-assist/compose-itinerary-day-blurbs", json=_request_body()
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_used"] == "gemini-2.5-flash-lite"

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
    client = _build_client(writer=_writer_returning(text))
    response = client.post(
        "/editor-assist/compose-itinerary-day-blurbs", json=_request_body()
    )

    assert response.status_code == 200
    results = response.json()["results"]
    assert results["stop-1_blurb"]["status"] == "generated"
    assert results["ws-1_blurb"]["status"] == "error"
    assert results["ws-1_blurb"]["markdown"] is None


def test_day_blurbs_flags_validation_without_dropping_output(monkeypatch):
    # A too-short blurb still lands, but carries a validation warning (ADR 0019:
    # output contract preserved, surfaced rather than auto-retried).
    text = "<<<BLURB:stop-1_blurb>>>\nToo short.\n<<<END>>>"
    client = _build_client(writer=_writer_returning(text))
    body = _request_body(
        stops=[
            {
                "target_id": "stop-1_blurb",
                "title": "Mérito",
                "category": "Dining",
                "angle": "signature-dish",
            }
        ]
    )
    response = client.post("/editor-assist/compose-itinerary-day-blurbs", json=body)

    assert response.status_code == 200
    result = response.json()["results"]["stop-1_blurb"]
    assert result["status"] == "generated"
    assert result["validation_errors"]  # non-empty


def test_day_blurbs_no_parseable_blocks_is_502(monkeypatch):
    client = _build_client(writer=_writer_returning("Sorry, I could not write these."))
    response = client.post(
        "/editor-assist/compose-itinerary-day-blurbs", json=_request_body()
    )

    assert response.status_code == 502


def test_day_blurbs_writer_failure_returns_traceable_provider_error(monkeypatch):
    def _raise_writer_error(**_kwargs):
        raise itinerary_composition.WriterModelError(
            "Writer model call failed: provider overloaded"
        )

    client = _build_client(writer=_raise_writer_error)
    response = client.post(
        "/editor-assist/compose-itinerary-day-blurbs", json=_request_body()
    )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "error " in detail
    assert "provider overloaded" in detail


def test_day_blurbs_requires_a_stop():
    client = _build_client()
    response = client.post(
        "/editor-assist/compose-itinerary-day-blurbs",
        json=_request_body(stops=[]),
    )
    assert response.status_code == 400


def test_day_blurbs_write_subset_authors_only_named_stops(monkeypatch):
    # ADR 0022: write only stop-1; ws-1 is context-only with its existing copy.
    captured: dict = {}
    text = f"<<<BLURB:stop-1_blurb>>>\n{_paragraph(110)}\n<<<END>>>"
    client = _build_client(writer=_writer_capturing(text, captured))
    body = _request_body(
        write_target_ids=["stop-1_blurb"],
        stops=[
            {
                "target_id": "ws-1_blurb",
                "title": "Grand Hotel",
                "category": "Accommodations",
                "angle": "location-and-setting",
                "existing_blurb": "The lodging copy already written.",
            },
            {
                "target_id": "stop-1_blurb",
                "title": "Mérito",
                "category": "Dining",
                "angle": "signature-dish",
                "selection_reason": "tasting-menu fine dining",
            },
        ],
    )
    response = client.post("/editor-assist/compose-itinerary-day-blurbs", json=body)

    assert response.status_code == 200
    results = response.json()["results"]
    # Only the written stop appears; the context-only sibling is not touched.
    assert set(results.keys()) == {"stop-1_blurb"}
    assert results["stop-1_blurb"]["status"] == "generated"

    # The sibling is presented as context with its prose; the target as TO WRITE.
    prompt = captured["prompt"]
    assert "id=ws-1_blurb [ALREADY WRITTEN]" in prompt
    assert "The lodging copy already written." in prompt
    assert "id=stop-1_blurb [TO WRITE]" in prompt

    inputs = response.json()["steps"][0]["details"]
    assert inputs["write_count"] == 1
    assert inputs["context_only_count"] == 1


def test_day_blurbs_invalid_write_targets_is_400(monkeypatch):
    client = _build_client(writer=_writer_returning("unused"))
    response = client.post(
        "/editor-assist/compose-itinerary-day-blurbs",
        json=_request_body(write_target_ids=["does-not-exist_blurb"]),
    )
    assert response.status_code == 400
