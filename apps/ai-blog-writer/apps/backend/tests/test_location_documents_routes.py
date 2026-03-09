import asyncio
import pytest
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.router import router as api_router
import app.features.location_documents.routes as location_document_routes


class _StubLLM:
    def __init__(self, response_text: str) -> None:
        self._response_text = response_text
        self.last_prompt: str | None = None

    def invoke(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self._response_text


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(api_router)
    return TestClient(app)


def test_location_documents_routes_are_registered():
    client = _build_client()
    paths = {route.path for route in client.app.routes}
    assert "/location-documents/ai/fill-document" in paths
    assert "/location-documents/ai/fill-section" in paths
    assert "/location-documents/ai/fill-field" in paths


def test_fill_document_accepts_frontend_aliases_and_returns_alias_response(monkeypatch):
    monkeypatch.setattr(
        location_document_routes,
        "_get_vertex_llm",
        lambda **_kwargs: _StubLLM(
            """
            {
              "level": "city",
              "country": "peru",
              "city": "lima",
              "countryName": "Peru",
              "cityName": "Lima",
              "guide": {
                "core": {
                  "headline": "Living in Lima Overview"
                },
                "explore": {
                  "highlights": [
                    { "title": "Barranco art walk", "description": "Coastal creative district." },
                    { "title": "Historic center", "description": "Colonial landmarks and plazas." },
                    { "title": "Miraflores cliffs", "description": "Parks, ocean views, and cafes." }
                  ]
                },
                "stay": {
                  "highlights": [
                    { "title": "Coworking zones", "description": "Strong remote-work neighborhoods." },
                    { "title": "Short-term rentals", "description": "Wide furnished apartment inventory." },
                    { "title": "Cafe work scene", "description": "Reliable daytime laptop spots." }
                  ]
                },
                "move": {
                  "highlights": [
                    { "title": "Family districts", "description": "More residential areas with schools." },
                    { "title": "Transit access", "description": "Key corridors for daily commutes." },
                    { "title": "Housing options", "description": "Mix of apartments and houses." }
                  ]
                }
              }
            }
            """
        ),
    )
    monkeypatch.setattr(
        location_document_routes,
        "run_location_documents_fill_document_graph",
        lambda *, step_runner: step_runner(),
    )

    request = location_document_routes.FillDocumentRequest.model_validate(
        {
            "draft": {
                "level": "city",
                "country": "peru",
                "city": "lima",
                "countryName": "Peru",
                "cityName": "Lima",
            },
            "sourceNotes": "Use the attached city research notes.",
            "modelName": "gemini-2.5-flash",
        }
    )

    response = location_document_routes._fill_document_impl(request)

    payload = response.model_dump(by_alias=True)
    assert payload["modelUsed"] == "gemini-2.5-flash"
    assert payload["document"]["guide"]["core"]["headline"] == "Living in Lima Overview"


def test_fill_document_accepts_country_drafts_without_local_sections(monkeypatch):
    monkeypatch.setattr(
        location_document_routes,
        "_get_vertex_llm",
        lambda **_kwargs: _StubLLM(
            """
            {
              "level": "country",
              "country": "peru",
              "countryName": "Peru"
            }
            """
        ),
    )
    monkeypatch.setattr(
        location_document_routes,
        "run_location_documents_fill_document_graph",
        lambda *, step_runner: step_runner(),
    )

    request = location_document_routes.FillDocumentRequest.model_validate(
        {
            "draft": {
                "level": "country",
                "country": "peru",
                "countryName": "Peru",
            }
        }
    )

    response = location_document_routes._fill_document_impl(request)

    payload = response.model_dump(by_alias=True)
    assert payload["document"]["country"] == "peru"


def test_fill_section_rejects_invalid_section_for_country_level():
    request = location_document_routes.FillSectionRequest.model_validate(
        {
            "draft": {
                "level": "country",
                "country": "peru",
                "countryName": "Peru",
            },
            "sectionPath": "guide.core",
            "currentSection": {},
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        location_document_routes._fill_section_impl(request)

    assert exc_info.value.status_code == 400
    assert "sectionPath must be one of" in exc_info.value.detail


def test_fill_field_uses_langgraph_runner_and_returns_value(monkeypatch):
    called = {"graph": False}

    monkeypatch.setattr(
        location_document_routes,
        "_get_vertex_llm",
        lambda **_kwargs: _StubLLM('{"value": "Peru"}'),
    )

    def _fake_graph_runner(*, step_runner):
        called["graph"] = True
        return step_runner()

    monkeypatch.setattr(
        location_document_routes,
        "run_location_documents_fill_field_graph",
        _fake_graph_runner,
    )

    request = location_document_routes.FillFieldRequest.model_validate(
        {
            "draft": {
                "level": "country",
                "country": "peru",
                "countryName": "Peru",
            },
            "fieldPath": "countryName",
            "currentValue": "",
            "instruction": "Return the display name only.",
        }
    )

    response = asyncio.run(location_document_routes.fill_field(request))

    payload = response.model_dump(by_alias=True)
    assert payload["fieldPath"] == "countryName"
    assert payload["value"] == "Peru"
    assert called["graph"] is True
