"""HTTP contract tests for Editor Assist SEO Metadata."""

import json

import app.features.editor_assist.seo_metadata as seo_metadata
from tests.editor_assist_route_test_support import build_editor_assist_client


def test_generate_seo_metadata_returns_structured_patch():
    captured: dict = {}

    class _StructuredResult:
        payload = {
            "seoTitle": "Two Days in Lima: Food, Art & Coastline",
            "metaDescription": "A compact two-day Lima plan.",
        }
        model_name = seo_metadata.SEO_STRUCTURED_DEFAULT_MODEL

    def _fake_structured(**kwargs):
        captured.update(kwargs)
        return _StructuredResult()

    client = build_editor_assist_client(structured_writer=_fake_structured)
    response = client.post(
        "/editor-assist/generate-seo-metadata",
        json={
            "prompt": "Generate the SEO title and meta description.",
            "seed": json.dumps({"seoTitle": "", "metaDescription": ""}),
            "article_title": "Two Days in Lima",
            "article_context": "Day 1: Barranco murals. Day 2: ceviche crawl.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["seo_patch"]["seoTitle"].startswith("Two Days in Lima")
    assert payload["model_used"] == seo_metadata.SEO_STRUCTURED_DEFAULT_MODEL
    assert captured["model_name"] == seo_metadata.SEO_STRUCTURED_DEFAULT_MODEL
    assert captured["tool_name"] == seo_metadata.SEO_PATCH_TOOL_NAME
    assert "<<<CURRENT_SEO>>>" in captured["prompt"]
    assert "<<<ARTICLE_CONTEXT>>>" in captured["prompt"]


def test_generate_seo_metadata_empty_patch_is_502():
    class _EmptyResult:
        payload: dict = {}
        model_name = seo_metadata.SEO_STRUCTURED_DEFAULT_MODEL

    client = build_editor_assist_client(
        structured_writer=lambda **_kwargs: _EmptyResult()
    )
    response = client.post(
        "/editor-assist/generate-seo-metadata",
        json={
            "prompt": "Generate the SEO title.",
            "seed": json.dumps({"seoTitle": ""}),
        },
    )

    assert response.status_code == 502


def test_structured_data_is_declared_as_a_json_string():
    """Gemini tool declarations can only fill properties the schema names, so a
    free-form ``{"type": "object"}`` has no fields to write and always comes
    back as ``{}``. The JSON-LD has to travel as a serialized string."""
    structured_data = seo_metadata.SEO_PATCH_INPUT_SCHEMA["properties"][
        "structuredData"
    ]

    assert structured_data["type"] == "string"
