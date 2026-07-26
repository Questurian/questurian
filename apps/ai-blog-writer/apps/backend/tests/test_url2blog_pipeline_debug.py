import pytest
from fastapi.responses import JSONResponse

from app.features.url2blog.api import generation as generation_api
from tests.url2blog_test_support import (
    build_pipeline_dependencies,
    build_pipeline_test_client,
)


@pytest.fixture
def client():
    return build_pipeline_test_client()


@pytest.fixture(autouse=True)
def _disable_markdown_long_stages_by_default(monkeypatch):
    """Keep legacy JSON path as default in existing tests."""
    monkeypatch.setenv("URL2BLOG_USE_MARKDOWN_LONG_STAGES", "0")


def test_pipeline_v2_includes_debug_payload_only_when_requested(client, monkeypatch):
    async def stub_extract_article(request):
        return JSONResponse(
            {
                "message": "URL2Blog stage 1 completed",
                "source_url": request.url,
                "raw_text_length": 500,
                "raw_response": "{}",
                "parsed": {
                    "title": "Debug title",
                    "content": "Debug content used for include_debug behavior.",
                    "language": "English",
                },
                "parse_error": None,
                "translated": None,
                "translation_skipped": True,
                "translation_error": None,
            }
        )

    async def stub_classify_article_type(request):
        return JSONResponse(
            {
                "message": "URL2Blog stage 2 classification completed",
                "classification": {
                    "id": 3,
                    "name": "Guide",
                    "definition": "Guides users through a topic.",
                    "confidence": 0.85,
                    "reasoning": "Editorial intent fit.",
                },
                "article_types_considered": 6,
                "raw_response": "{}",
            }
        )

    def stub_invoke_json_llm(
        prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.05,
        model_name: str | None = None,
        allow_truncated_repair: bool = True,
    ):
        del allow_truncated_repair
        if (
            "target article-type guideline" in prompt
            or "URL2Blog QUALITY AUDIT" in prompt
            or "URL2Blog HARD REWRITE" in prompt
            or "repairing a rewritten article to restore missing source facts" in prompt
        ):
            assert "SEO-SAFE CONTENT GENERATION GUIDELINES (2026-READY)" in prompt

        if "URL2Blog EDITORIAL AUGMENTATION" in prompt:
            return (
                {
                    "augmented_content": (
                        "## Overview\n\n"
                        "Debug rewritten content.\n\n"
                        '> **Highlight:** The core recommendation is to act on the '
                        "validated evidence before expanding scope."
                    ),
                    "components_added": [
                        {
                            "component": "highlight_callout",
                            "justification": "Adds breathing room after dense explanatory text.",
                            "placement": "After the first section.",
                        }
                    ],
                    "diagnostic": {
                        "cognitive_load": "strong",
                        "narrative_density": "weak",
                        "emphasis_clarity": "strong",
                        "reading_behavior_risk": "strong",
                    },
                    "augmentation_summary": "Added one highlight callout for pacing relief.",
                },
                '{"augmentation_summary":"Added one highlight callout for pacing relief."}',
            )

        if "URL2Blog QUALITY AUDIT" in prompt:
            return (
                {
                    "overall_score": 9,
                    "guideline_coverage_score": 9,
                    "informativeness_score": 9,
                    "originality_score": 9,
                    "too_close_to_source": False,
                    "required_revisions": [],
                    "quality_summary": "Debug quality pass complete.",
                },
                '{"overall_score":9}',
            )

        if "URL2Blog HARD REWRITE" in prompt:
            return (
                {
                    "improved_title": "Debug rewritten title v2",
                    "improved_content": "Debug rewritten content v2.",
                    "guideline_alignment_summary": "Second pass rewrite complete.",
                    "improvements_applied": ["Applied stricter rewrite constraints."],
                    "remaining_gaps": [],
                },
                '{"improved_title":"Debug rewritten title v2"}',
            )

        return (
            {
                "improved_title": "Debug rewritten title",
                "improved_content": "Debug rewritten content.",
                "guideline_alignment_summary": "Debug summary.",
                "improvements_applied": ["Debug improvement."],
                "remaining_gaps": [],
            },
            '{"improved_title":"Debug rewritten title"}',
        )

    dependencies = build_pipeline_dependencies(
        json_call=stub_invoke_json_llm,
        extract_article=stub_extract_article,
        classify_article_type=stub_classify_article_type,
        grounded_call=lambda *args, **kwargs: (
            {
                "context_points": [
                    {
                        "insight": "External context point",
                        "why_it_matters": "Adds depth.",
                        "source_url": "https://example.com/context",
                        "confidence": "medium",
                    }
                ],
                "usage_note": "Use external context carefully.",
            },
            '{"context_points":[{"insight":"External context point"}]}',
            ["https://example.com/context"],
        ),
        get_article_type=lambda article_type_id: {
            "id": article_type_id,
            "name": "Guide",
            "guideline": "Use clear structure.",
            "title_guideline": "Use clear title.",
        },
    )
    client.app.dependency_overrides[generation_api.get_pipeline_dependencies] = (
        lambda: dependencies
    )

    response = client.post(
        "/url2blog/pipeline-v2",
        json={
            "url": "https://example.com/article",
            "include_debug": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "debug" in payload
    assert payload["debug"]["article_original_content"] == (
        "Debug content used for include_debug behavior."
    )
    assert payload["guideline_review"]["quality_scores"]["overall"] == 9
    assert payload["guideline_review"]["editorial_augmentation_applied"] is True
    assert payload["guideline_review"]["editorial_components_added"] == [
        "highlight_callout"
    ]
    assert (
        "[!EDITORIAL-BLOCK-START|highlight_callout]"
        in payload["improved_article"]["content"]
    )
    assert (
        "[!EDITORIAL-BLOCK-LABEL|Highlight Callout]"
        in payload["improved_article"]["content"]
    )
    assert (
        "[!EDITORIAL-BOX|highlight_callout]" in payload["improved_article"]["content"]
    )
    assert (
        "[!EDITORIAL-BLOCK-END|highlight_callout]"
        in payload["improved_article"]["content"]
    )
    assert "editorial_augmentation_raw_response" in payload["debug"]
    assert payload["debug"]["editorial_components_added"][0]["component"] == (
        "highlight_callout"
    )
    assert payload["debug"]["json_parse_metrics"]["total_parse_failures"] == 0
    assert payload["debug"]["external_context_points"][0]["source_url"] == (
        "https://example.com/context"
    )
    assert isinstance(payload["debug"]["pipeline_trace"], list)
    assert len(payload["debug"]["pipeline_trace"]) > 0
    assert any(
        entry.get("stage") == "short_article_enrichment"
        for entry in payload["debug"]["pipeline_trace"]
        if isinstance(entry, dict)
    )
