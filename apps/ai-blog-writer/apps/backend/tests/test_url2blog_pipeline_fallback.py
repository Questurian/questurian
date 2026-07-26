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


def test_pipeline_v2_falls_back_to_original_when_rewrite_fields_missing(
    client, monkeypatch
):
    captured = {"editorial_augmentation_called": False}

    async def stub_extract_article(request):
        return JSONResponse(
            {
                "message": "URL2Blog stage 1 completed",
                "source_url": request.url,
                "raw_text_length": 500,
                "raw_response": "{}",
                "parsed": {
                    "title": "Original title",
                    "content": "Original article content for fallback behavior.",
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
                    "id": 2,
                    "name": "Explainer",
                    "definition": "Explains a topic clearly.",
                    "confidence": 0.8,
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
            captured["editorial_augmentation_called"] = True
            return ({}, "{}")

        if "URL2Blog QUALITY AUDIT" in prompt:
            return (
                {
                    "overall_score": 9,
                    "guideline_coverage_score": 9,
                    "informativeness_score": 9,
                    "originality_score": 9,
                    "too_close_to_source": False,
                    "required_revisions": [],
                    "quality_summary": "Quality pass complete.",
                },
                '{"overall_score":9}',
            )

        if "URL2Blog HARD REWRITE" in prompt:
            return ({}, "{}")

        return ({}, "{}")

    dependencies = build_pipeline_dependencies(
        json_call=stub_invoke_json_llm,
        extract_article=stub_extract_article,
        classify_article_type=stub_classify_article_type,
        grounded_call=lambda *args, **kwargs: (
            {"context_points": [], "usage_note": "No context added."},
            '{"context_points":[]}',
            [],
        ),
        get_article_type=lambda article_type_id: {
            "id": article_type_id,
            "name": "Explainer",
            "guideline": "Use clear plain-language explanations.",
            "title_guideline": "",
        },
    )
    client.app.dependency_overrides[generation_api.get_pipeline_dependencies] = (
        lambda: dependencies
    )

    response = client.post(
        "/url2blog/pipeline-v2",
        json={
            "url": "https://example.com/article",
            "enable_editorial_augmentation": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["pipeline_status"] == "needs_revision"
    assert captured["editorial_augmentation_called"] is False
    assert payload["improved_article"]["title"] == "Original title"
    assert (
        "Original article content for fallback behavior."
        in payload["improved_article"]["content"]
    )
    assert payload["improved_article"]["content"].startswith("## ")
    assert payload["final_markdown"].startswith("# Original title")
    assert "## " in payload["final_markdown"]
    assert payload["guideline_review"]["editorial_augmentation_applied"] is False
    assert payload["guideline_review"]["alignment_summary"]
    assert payload["guideline_review"]["quality_scores"]["overall"] == 9
    assert payload["guideline_review"]["length_requirement_met"] is False
    assert payload["guideline_review"]["length_requirement_blocking_reason"]
    assert payload["guideline_review"]["json_parse_failures_total"] == 0
