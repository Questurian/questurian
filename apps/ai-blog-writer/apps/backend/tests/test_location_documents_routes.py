from fastapi import FastAPI
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
                "localShared": {
                  "headline": "Living in Lima Overview"
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

    client = _build_client()
    response = client.post(
        "/location-documents/ai/fill-document",
        json={
            "draft": {
                "level": "city",
                "country": "peru",
                "city": "lima",
                "countryName": "Peru",
                "cityName": "Lima",
            },
            "sourceNotes": "Use the attached city research notes.",
            "modelName": "gemini-2.5-flash",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["modelUsed"] == "gemini-2.5-flash"
    assert payload["document"]["guide"]["localShared"]["headline"] == "Living in Lima Overview"


def test_fill_document_allows_empty_select_values_in_the_incoming_draft(monkeypatch):
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

    client = _build_client()
    response = client.post(
        "/location-documents/ai/fill-document",
        json={
            "draft": {
                "level": "country",
                "country": "peru",
                "countryName": "Peru",
                "guide": {
                    "countryData": {
                        "tapWater": {
                            "status": "",
                            "notes": "",
                        }
                    }
                },
            }
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["document"]["country"] == "peru"


def test_fill_section_rejects_invalid_section_for_country_level():
    client = _build_client()
    response = client.post(
        "/location-documents/ai/fill-section",
        json={
            "draft": {
                "level": "country",
                "country": "peru",
                "countryName": "Peru",
            },
            "sectionPath": "guide.localShared",
            "currentSection": {},
        },
    )

    assert response.status_code == 400
    assert "sectionPath must be one of" in response.json()["detail"]


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

    client = _build_client()
    response = client.post(
        "/location-documents/ai/fill-field",
        json={
            "draft": {
                "level": "country",
                "country": "peru",
                "countryName": "Peru",
            },
            "fieldPath": "countryName",
            "currentValue": "",
            "instruction": "Return the display name only.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["fieldPath"] == "countryName"
    assert payload["value"] == "Peru"
    assert called["graph"] is True
