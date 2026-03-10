import asyncio
import pytest
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.router import router as api_router
from app.features.location_documents.currency_references import CurrencyLatestUsdRate
import app.features.location_documents.routes as location_document_routes
from app.features.location_documents.models import LocationDocumentDraft


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
    stub_llm = _StubLLM(
        """
        {
          "level": "city",
          "country": "peru",
          "city": "lima",
          "countryName": "Peru",
          "cityName": "Lima",
          "guide": {
            "core": {
              "headline": "Living in Lima Overview",
              "moneyHandling": {
                "currencyCode": "PEN"
              }
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
    )
    monkeypatch.setattr(
        location_document_routes,
        "_get_vertex_llm",
        lambda **_kwargs: stub_llm,
    )
    monkeypatch.setattr(
        location_document_routes,
        "get_active_currency_references",
        lambda: [
            location_document_routes.CurrencyReference(
                id=14,
                code="PEN",
                name="Peruvian Sol",
                symbol="S/",
                display_symbol="S/",
                default_locale="es-PE",
                decimal_places=2,
                used_in=("Peru",),
                notes="",
                latest_usd_rate=CurrencyLatestUsdRate(
                    units_per_usd=3.72,
                    provider="exchange-rate-api-open",
                    source_updated_at="2026-03-09T00:00:01.000Z",
                    next_update_at="2026-03-10T00:00:01.000Z",
                    fetched_at="2026-03-09T12:00:00.000Z",
                ),
            )
        ],
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
    assert payload["document"]["guide"]["core"]["moneyHandling"]["currency"] == 14
    assert payload["document"]["guide"]["core"]["moneyHandling"]["currencyCode"] == "PEN"
    assert stub_llm.last_prompt is not None
    assert "Available active currencies" in stub_llm.last_prompt
    assert '"code": "PEN"' in stub_llm.last_prompt
    assert '"latestUsdRate"' in stub_llm.last_prompt
    assert '"unitsPerUsd": 3.72' in stub_llm.last_prompt


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


def test_fill_core_section_uses_currency_catalog_and_resolves_currency_code(monkeypatch):
    stub_llm = _StubLLM(
        """
        {
          "headline": "Practical Lima overview",
          "moneyHandling": {
            "currencyCode": "PEN",
            "cardUsage": "Cards are accepted in most neighborhoods."
          }
        }
        """
    )
    monkeypatch.setattr(
        location_document_routes,
        "_get_vertex_llm",
        lambda **_kwargs: stub_llm,
    )
    monkeypatch.setattr(
        location_document_routes,
        "get_active_currency_references",
        lambda: [
            location_document_routes.CurrencyReference(
                id=14,
                code="PEN",
                name="Peruvian Sol",
                symbol="S/",
                display_symbol="S/",
                default_locale="es-PE",
                decimal_places=2,
                used_in=("Peru",),
                notes="",
                latest_usd_rate=CurrencyLatestUsdRate(
                    units_per_usd=3.72,
                    provider="exchange-rate-api-open",
                    source_updated_at="2026-03-09T00:00:01.000Z",
                    next_update_at="2026-03-10T00:00:01.000Z",
                    fetched_at="2026-03-09T12:00:00.000Z",
                ),
            )
        ],
    )

    request = location_document_routes.FillSectionRequest.model_validate(
        {
            "draft": {
                "level": "city",
                "country": "peru",
                "city": "lima",
                "countryName": "Peru",
                "cityName": "Lima",
            },
            "sectionPath": "guide.core",
            "currentSection": {},
        }
    )

    response = location_document_routes._fill_section_impl(request)
    payload = response.model_dump(by_alias=True)

    assert payload["section"]["moneyHandling"]["currency"] == 14
    assert payload["section"]["moneyHandling"]["currencyCode"] == "PEN"
    assert stub_llm.last_prompt is not None
    assert "Available active currencies" in stub_llm.last_prompt
    assert '"name": "Peruvian Sol"' in stub_llm.last_prompt
    assert '"latestUsdRate"' in stub_llm.last_prompt


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


def test_neighborhood_field_fill_rejects_city_wide_weather_field():
    request = location_document_routes.FillFieldRequest.model_validate(
        {
            "draft": {
                "level": "neighborhood",
                "country": "peru",
                "city": "lima",
                "neighborhood": "barranco",
                "countryName": "Peru",
                "cityName": "Lima",
                "neighborhoodName": "Barranco",
            },
            "fieldPath": "guide.core.weather.summary",
            "currentValue": "",
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        location_document_routes._fill_field_impl(request)

    assert exc_info.value.status_code == 400
    assert "fieldPath must be one of" in exc_info.value.detail


def test_neighborhood_model_strips_city_wide_practical_fields():
    draft = LocationDocumentDraft.model_validate(
        {
            "level": "neighborhood",
            "country": "peru",
            "city": "lima",
            "neighborhood": "barranco",
            "countryName": "Peru",
            "cityName": "Lima",
            "neighborhoodName": "Barranco",
            "guide": {
                "core": {
                    "headline": "Barranco",
                    "weather": {
                        "summary": "Cloudy",
                    },
                    "moneyHandling": {
                        "currency": 18,
                        "cardUsage": "Cards accepted",
                    },
                },
                "explore": {
                    "intro": "Creative district",
                    "touristVisaStatus": "90 days",
                },
                "move": {
                    "propertyPricesPerSqm": "$2,100-$3,600",
                    "residencyVisa": "Residence permit",
                },
            },
        }
    )

    assert draft.guide.core.headline == "Barranco"
    assert draft.guide.core.weather.summary == ""
    assert draft.guide.core.moneyHandling.currency is None
    assert draft.guide.core.moneyHandling.cardUsage == ""
    assert draft.guide.explore.intro == "Creative district"
    assert draft.guide.explore.touristVisaStatus == ""
    assert draft.guide.move.propertyPricesPerSqm == "$2,100-$3,600"
    assert draft.guide.move.residencyVisa == ""
