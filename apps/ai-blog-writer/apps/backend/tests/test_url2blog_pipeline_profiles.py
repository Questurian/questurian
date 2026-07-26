import pytest
from fastapi.responses import JSONResponse

from app.features.url2blog.api import generation as generation_api
from app.features.url2blog.content.sanitizers import _resolve_min_expanded_word_target
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


def test_pipeline_v2_lean_profile_skips_optional_heavy_stages(client, monkeypatch):
    captured = {
        "grounded_enrichment_called": False,
        "editorial_augmentation_called": False,
        "second_pass_called": False,
        "fact_repair_called": False,
    }

    async def stub_extract_article(request):
        return JSONResponse(
            {
                "message": "URL2Blog stage 1 completed",
                "source_url": request.url,
                "raw_text_length": 500,
                "raw_response": "{}",
                "parsed": {
                    "title": "Lean profile title",
                    "content": "Short source article for lean profile validation.",
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
                    "id": 4,
                    "name": "Guide",
                    "definition": "Guides readers through clear actions.",
                    "confidence": 0.9,
                    "reasoning": "Editorial fit.",
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
        if "URL2Blog HARD REWRITE" in prompt:
            captured["second_pass_called"] = True
            return ({}, "{}")

        if "repairing a rewritten article to restore missing source facts" in prompt:
            captured["fact_repair_called"] = True
            return ({}, "{}")

        if "URL2Blog EDITORIAL AUGMENTATION" in prompt:
            captured["editorial_augmentation_called"] = True
            return ({}, "{}")

        if "extracting factual anchors from a source article" in prompt:
            return (
                {
                    "facts": [
                        {
                            "fact_id": "F1",
                            "fact": "Guide includes timing and budget signals.",
                            "priority": "high",
                            "category": "other",
                        }
                    ]
                },
                '{"facts":[{"fact_id":"F1"}]}',
            )

        if "auditing factual coverage in a rewritten article" in prompt:
            return (
                {
                    "coverage_score": 10,
                    "coverage_summary": "All source facts retained.",
                    "covered_fact_ids": ["F1"],
                    "missing_facts": [],
                },
                '{"coverage_score":10}',
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
                    "quality_summary": "Lean profile quality pass complete.",
                },
                '{"overall_score":9}',
            )

        if "URL2Blog LENGTH EXPANSION" in prompt:
            return (
                {
                    "expanded_content": (
                        "## Lean Profile Summary\n\n"
                        "This expanded draft keeps the structure explicit while adding "
                        "enough explanatory detail to exceed the minimum expansion "
                        "threshold. It clarifies timing, budget framing, and practical "
                        "decision points for readers who need direct guidance.\n\n"
                        "## Practical Guidance\n\n"
                        "Use this article as a quick planning reference: compare "
                        "seasonality, expected crowd intensity, and cost trade-offs in "
                        "one pass. Prioritize the section that matches your intent "
                        "instead of reading linearly.\n\n"
                        "## Planning Notes\n\n"
                        "A stable plan depends on identifying your primary objective "
                        "first, then validating constraints like flexibility, reservation "
                        "lead time, and expected demand windows."
                    ),
                    "expansion_summary": "Expanded in lean mode without extra heavy passes.",
                },
                '{"expansion_summary":"Expanded in lean mode without extra heavy passes."}',
            )

        return (
            {
                "improved_title": "Lean profile rewritten title",
                "improved_content": (
                    "## Lean Summary\n\n"
                    "This rewrite uses concise structure before expansion."
                ),
                "guideline_alignment_summary": "Lean rewrite complete.",
                "improvements_applied": ["Applied concise structural rewrite."],
                "remaining_gaps": [],
            },
            '{"improved_title":"Lean profile rewritten title"}',
        )

    dependencies = build_pipeline_dependencies(
        json_call=stub_invoke_json_llm,
        extract_article=stub_extract_article,
        classify_article_type=stub_classify_article_type,
        grounded_call=lambda *args, **kwargs: (
            captured.__setitem__("grounded_enrichment_called", True),
            {"context_points": [], "usage_note": "Not used in lean profile."},
            "{}",
            [],
        )[1:],
        get_article_type=lambda article_type_id: {
            "id": article_type_id,
            "name": "Guide",
            "guideline": "Keep guidance explicit.",
            "title_guideline": "Use practical titles.",
        },
    )
    client.app.dependency_overrides[generation_api.get_pipeline_dependencies] = (
        lambda: dependencies
    )

    response = client.post(
        "/url2blog/pipeline-v2",
        json={
            "url": "https://example.com/article",
            "execution_profile": "lean",
            "enable_web_enrichment": True,
            "enable_editorial_augmentation": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["pipeline_status"] == "ready_for_drafting"
    assert captured["grounded_enrichment_called"] is False
    assert captured["editorial_augmentation_called"] is False
    assert captured["second_pass_called"] is False
    assert captured["fact_repair_called"] is False
    assert payload["guideline_review"]["execution_profile"] == "lean"
    assert payload["guideline_review"]["short_article_enrichment_applied"] is False
    assert payload["guideline_review"]["editorial_augmentation_applied"] is False
    assert payload["guideline_review"]["second_pass_applied"] is False
    assert payload["guideline_review"]["fact_repair_applied"] is False


def test_pipeline_v2_rejects_invalid_execution_profile(client):
    response = client.post(
        "/url2blog/pipeline-v2",
        json={
            "url": "https://example.com/article",
            "execution_profile": "turbo",
        },
    )

    assert response.status_code == 400
    detail = response.json().get("detail", "")
    assert "execution_profile" in detail
    assert "standard" in detail and "lean" in detail


def test_resolve_min_expanded_word_target_enforces_growth():
    assert _resolve_min_expanded_word_target(100) >= 180
    assert _resolve_min_expanded_word_target(450) >= 530
