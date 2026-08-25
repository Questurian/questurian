"""Prompt2Blog input-option and guideline-preview route contracts."""

import asyncio

from tests.prompt2blog_test_support import response_payload

import app.features.prompt2blog.routes as prompt2blog_routes
from app.features.prompt2blog.api import options as options_api


def test_input_options_returns_article_and_writing_catalogs(monkeypatch):
    monkeypatch.setattr(
        options_api,
        "read_article_type_name_definitions",
        lambda: [{"name": "Explainer", "definition": "Explains things clearly."}],
    )
    monkeypatch.setattr(
        options_api,
        "get_article_type_by_name",
        lambda _name: {
            "id": 11,
            "name": "Explainer",
            "definition": "Explains things clearly.",
        },
    )

    payload = response_payload(asyncio.run(prompt2blog_routes.get_input_options()))

    assert payload["article_types"][0]["id"] == 11
    assert payload["tones"]
    assert payload["lengths"]
    assert payload["brand_voices"]


def test_editorial_options_uses_prompt2blog_catalog_without_shared_article_types(
    monkeypatch,
):
    monkeypatch.setattr(
        options_api,
        "read_article_type_name_definitions",
        lambda: (_ for _ in ()).throw(AssertionError("shared catalog was read")),
    )

    payload = response_payload(
        asyncio.run(prompt2blog_routes.get_editorial_options())
    )

    assert payload["schema_version"] == 3
    assert len(payload["forms"]) == 15
    assert len(payload["topic_modules"]) == 10
    assert payload["forms"][1]["id"] == "analysis"
    assert payload["audience_tags"]
    assert payload["scope_modes"]
    assert payload["reference_roles"]
    assert all("instructions" not in form for form in payload["forms"])


def test_guideline_preview_returns_selected_article_type(monkeypatch):
    monkeypatch.setattr(
        options_api,
        "get_article_type_by_id",
        lambda article_type_id: {
            "id": article_type_id,
            "name": "Explainer",
            "definition": "Explains things clearly.",
            "guideline": "Fallback guideline.",
            "title_guideline": "Fallback title guideline.",
        },
    )

    payload = response_payload(
        asyncio.run(prompt2blog_routes.get_article_type_guideline_preview(11))
    )

    assert payload["id"] == 11
    assert payload["name"] == "Explainer"
    assert isinstance(payload["guideline"], str)
    assert isinstance(payload["title_guideline"], str)
