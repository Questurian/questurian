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


def test_pipeline_v2_uses_langgraph_runner(client, monkeypatch):
    async def _fake_graph_runner(*, request, dependencies, owner_staff_id):
        del request, dependencies
        assert owner_staff_id is None
        return JSONResponse({"message": "langgraph path"})

    monkeypatch.setattr(
        generation_api,
        "run_url2blog_pipeline_graph",
        _fake_graph_runner,
    )

    response = client.post("/url2blog/pipeline-v2", json={"url": "https://example.com"})

    assert response.status_code == 200
    assert response.json()["message"] == "langgraph path"


def test_pipeline_v2_runs_stage1_stage2_then_guideline_rewrite(client, monkeypatch):
    captured = {
        "extract_called": False,
        "classify_called": False,
        "fact_coverage_calls": 0,
        "editorial_augmentation_called": False,
    }

    async def stub_extract_article(request):
        captured["extract_called"] = True
        return JSONResponse(
            {
                "message": "URL2Blog stage 1 completed",
                "source_url": request.url,
                "raw_text_length": 500,
                "raw_response": "{}",
                "parsed": {
                    "title": "Original headline",
                    "content": "Original article content with enough detail for rewrite.",
                    "language": "English",
                },
                "parse_error": None,
                "translated": None,
                "translation_skipped": True,
                "translation_error": None,
            }
        )

    async def stub_classify_article_type(request):
        captured["classify_called"] = True
        return JSONResponse(
            {
                "message": "URL2Blog stage 2 classification completed",
                "classification": {
                    "id": 5,
                    "name": "Service Comparison",
                    "definition": "Compares options against practical criteria.",
                    "confidence": 0.92,
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

        if "extracting factual anchors from a source article" in prompt:
            return (
                {
                    "facts": [
                        {
                            "fact_id": "F1",
                            "fact": "Lounge spans over 2,400 square meters.",
                            "priority": "high",
                            "category": "numbers",
                        },
                        {
                            "fact_id": "F2",
                            "fact": "Day pass pricing includes USD 80 for adults and USD 30 for children.",
                            "priority": "high",
                            "category": "pricing",
                        },
                    ]
                },
                '{"facts":[{"fact_id":"F1"}]}',
            )

        if "auditing factual coverage in a rewritten article" in prompt:
            captured["fact_coverage_calls"] += 1
            if captured["fact_coverage_calls"] == 1:
                return (
                    {
                        "coverage_score": 6,
                        "coverage_summary": "Important pricing fact missing.",
                        "covered_fact_ids": ["F1"],
                        "missing_facts": [
                            {
                                "fact_id": "F2",
                                "fact": "Day pass pricing includes USD 80 for adults and USD 30 for children.",
                                "priority": "high",
                                "reason": "Pricing detail is omitted.",
                            }
                        ],
                    },
                    '{"coverage_score":6}',
                )
            return (
                {
                    "coverage_score": 9,
                    "coverage_summary": "All high-priority facts are covered.",
                    "covered_fact_ids": ["F1", "F2"],
                    "missing_facts": [],
                },
                '{"coverage_score":9}',
            )

        if "repairing a rewritten article to restore missing source facts" in prompt:
            return (
                {
                    "improved_title": "Improved comparison headline",
                    "improved_content": (
                        "In conclusion, improved body with clearer structure and transitions. "
                        "Day pass pricing includes USD 80 for adults and USD 30 for children."
                    ),
                    "guideline_alignment_summary": "Fact repair restored missing pricing detail.",
                    "improvements_applied": [
                        "Restored missing high-priority pricing fact.",
                        "Kept structure readable.",
                    ],
                    "remaining_gaps": [],
                },
                '{"improved_title":"Improved comparison headline"}',
            )

        if "URL2Blog QUALITY AUDIT" in prompt:
            return (
                {
                    "overall_score": 9,
                    "guideline_coverage_score": 9,
                    "informativeness_score": 9,
                    "originality_score": 8,
                    "too_close_to_source": False,
                    "required_revisions": [],
                    "quality_summary": "Strong guideline fit with useful added context.",
                },
                '{"overall_score":9}',
            )

        if "URL2Blog HARD REWRITE" in prompt:
            return (
                {
                    "improved_title": "Improved comparison headline v2",
                    "improved_content": "Improved body v2 with stronger originality.",
                    "guideline_alignment_summary": "Forced second pass improved originality.",
                    "improvements_applied": [
                        "Restructured flow for stronger originality."
                    ],
                    "remaining_gaps": [],
                },
                '{"improved_title":"Improved comparison headline v2"}',
            )

        if "URL2Blog EDITORIAL AUGMENTATION" in prompt:
            captured["editorial_augmentation_called"] = True
            return (
                {
                    "augmented_content": (
                        "## Overview\n\n"
                        "Improved body with clearer structure and transitions. "
                        "This version expands practical guidance so readers can compare "
                        "cost, timing, and booking trade-offs without losing context.\n\n"
                        "> **In the know:** Day pass pricing in this piece is listed as "
                        "USD 80 for adults and USD 30 for children, and this benchmark "
                        "is used to evaluate value relative to seasonal demand shifts.\n\n"
                        "## Practical Comparison Framework\n\n"
                        "Use one consistent framework across options: access reliability, "
                        "total cost, queue exposure, and fallback flexibility. This "
                        "keeps decisions grounded in comparable criteria instead of "
                        "isolated anecdotes.\n\n"
                        "## Key Takeaways\n\n"
                        "- Lounge spans over 2,400 square meters.\n"
                        "- Day pass pricing includes USD 80 for adults and USD 30 for children.\n"
                        "- Travelers often compare reservation channels before peak dining times.\n"
                        "- Shoulder demand windows usually reward earlier planning.\n"
                        "- Booking flexibility can matter as much as headline price."
                    ),
                    "components_added": [
                        {
                            "component": "in_the_know_box",
                            "justification": "Clarifies practical context at a likely confusion point.",
                            "placement": "After the opening section.",
                        },
                        {
                            "component": "key_takeaways_box",
                            "justification": "Improves skimmability for non-linear readers.",
                            "placement": "After core insights.",
                        },
                    ],
                    "diagnostic": {
                        "cognitive_load": "weak",
                        "narrative_density": "strong",
                        "emphasis_clarity": "strong",
                        "reading_behavior_risk": "weak",
                    },
                    "augmentation_summary": (
                        "Added an in-the-know box and key takeaways to reduce confusion "
                        "and support skimmers."
                    ),
                },
                '{"augmentation_summary":"Added an in-the-know box and key takeaways."}',
            )

        assert "NARRATIVE OR AUDIENCE FOCUS" in prompt
        assert "GUIDELINE:" in prompt
        return (
            {
                "improved_title": "Improved comparison headline",
                "improved_content": "Improved body with clearer structure and transitions.",
                "guideline_alignment_summary": "Article now better matches comparison intent.",
                "improvements_applied": [
                    "Clarified comparison criteria.",
                    "Improved paragraph flow.",
                ],
                "remaining_gaps": ["Add one more supporting example."],
            },
            '{"improved_title":"Improved comparison headline"}',
        )

    dependencies = build_pipeline_dependencies(
        json_call=stub_invoke_json_llm,
        extract_article=stub_extract_article,
        classify_article_type=stub_classify_article_type,
        grounded_call=lambda *args, **kwargs: (
            {
                "context_points": [
                    {
                        "insight": "Travelers often compare reservation channels before peak dining times.",
                        "why_it_matters": "Improves planning utility for readers.",
                        "source_url": "https://example.com/source",
                        "confidence": "high",
                    }
                ],
                "usage_note": "Apply context sparingly for short-source depth.",
            },
            '{"context_points":[{"insight":"Travelers often compare reservation channels before peak dining times."}]}',
            ["https://example.com/source"],
        ),
        get_article_type=lambda article_type_id: {
            "id": article_type_id,
            "name": "Service Comparison",
            "guideline": "Use criteria-first comparison framing.",
            "title_guideline": "Keep title specific and neutral.",
        },
    )
    client.app.dependency_overrides[generation_api.get_pipeline_dependencies] = (
        lambda: dependencies
    )

    response = client.post(
        "/url2blog/pipeline-v2",
        json={
            "url": "https://example.com/article",
            "narrative_focus": "Prioritize practical insights for travelers.",
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert captured["extract_called"] is True
    assert captured["classify_called"] is True
    assert captured["editorial_augmentation_called"] is True
    assert payload["pipeline_status"] == "ready_for_drafting"
    assert payload["improved_article"]["title"] == "Improved comparison headline"
    assert "clearer structure" in payload["improved_article"]["content"]
    assert (
        "[!EDITORIAL-BLOCK-START|in_the_know_box]"
        in payload["improved_article"]["content"]
    )
    assert (
        "[!EDITORIAL-BLOCK-LABEL|In The Know]" in payload["improved_article"]["content"]
    )
    assert "[!EDITORIAL-BOX|in_the_know_box]" in payload["improved_article"]["content"]
    assert (
        "[!EDITORIAL-BLOCK-END|in_the_know_box]"
        in payload["improved_article"]["content"]
    )
    assert (
        "[!EDITORIAL-BLOCK-START|key_takeaways_box]"
        in payload["improved_article"]["content"]
    )
    assert (
        "[!EDITORIAL-BLOCK-LABEL|Key Takeaways]"
        in payload["improved_article"]["content"]
    )
    assert (
        "[!EDITORIAL-BOX|key_takeaways_box]" in payload["improved_article"]["content"]
    )
    assert (
        "[!EDITORIAL-BLOCK-END|key_takeaways_box]"
        in payload["improved_article"]["content"]
    )
    assert "**In the know:**" in payload["improved_article"]["content"]
    assert "## Key Takeaways" in payload["improved_article"]["content"]
    assert "## " in payload["improved_article"]["content"]
    assert "in conclusion" not in payload["improved_article"]["content"].lower()
    assert payload["final_markdown"].startswith("# Improved comparison headline")
    assert "## " in payload["final_markdown"]
    assert "## Key Takeaways" in payload["final_markdown"]
    assert "in conclusion" not in payload["final_markdown"].lower()
    assert payload["guideline_review"]["alignment_summary"]
    assert payload["guideline_review"]["quality_scores"]["overall"] == 9
    # `narrative_focus_applied` reports the composed steering directive that
    # actually reached the prompts: the caller's focus followed by the resolved
    # tone profile (Practical is the default when no tone_id is sent).
    narrative_focus_applied = payload["guideline_review"]["narrative_focus_applied"]
    assert narrative_focus_applied.startswith(
        "Prioritize practical insights for travelers."
    )
    assert "TONE PROFILE (Practical):" in narrative_focus_applied
    assert payload["guideline_review"]["model_used"] == "gemini-2.5-flash-lite"
    assert payload["guideline_review"]["execution_profile"] == "standard"
    assert payload["guideline_review"]["length_requirement_met"] is True
    assert payload["guideline_review"]["length_requirement_blocking_reason"] == ""
    assert payload["guideline_review"]["short_article_enrichment_applied"] is True
    assert payload["guideline_review"]["external_context_points_used"] == 1
    assert payload["guideline_review"]["fact_repair_applied"] is True
    assert payload["guideline_review"]["missing_high_priority_facts_count"] == 0
    assert payload["guideline_review"]["editorial_augmentation_applied"] is True
    assert payload["guideline_review"]["editorial_components_added"] == [
        "in_the_know_box",
        "key_takeaways_box",
    ]
    assert payload["guideline_review"]["editorial_augmentation_summary"]
    assert payload["guideline_review"]["json_parse_failures_total"] == 0
    assert len(payload["guideline_review"]["improvements_applied"]) >= 1
    assert payload["selected_article_type"]["name"] == "Service Comparison"
    assert "guideline" not in payload
    assert "raw_outputs" not in payload
    assert "original_content" not in payload["article"]
    assert payload["article"]["original_excerpt"]
