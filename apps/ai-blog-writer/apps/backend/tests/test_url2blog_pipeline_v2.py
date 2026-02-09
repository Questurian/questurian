import sys
import types

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
sys.modules.setdefault("utils", utils_stub)

import app.features.url2blog.routes as url2blog_routes


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(url2blog_routes.router)
    return TestClient(app)


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
    ):
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
                    "improvements_applied": ["Restructured flow for stronger originality."],
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

    monkeypatch.setattr(url2blog_routes, "extract_article", stub_extract_article)
    monkeypatch.setattr(
        url2blog_routes, "classify_article_type", stub_classify_article_type
    )
    monkeypatch.setattr(url2blog_routes, "_invoke_json_llm", stub_invoke_json_llm)
    monkeypatch.setattr(
        url2blog_routes,
        "_invoke_google_grounded_json",
        lambda *args, **kwargs: (
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
    )
    monkeypatch.setattr(
        url2blog_routes,
        "get_article_type_by_id",
        lambda article_type_id: {
            "id": article_type_id,
            "name": "Service Comparison",
            "guideline": "Use criteria-first comparison framing.",
            "title_guideline": "Keep title specific and neutral.",
        },
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
    assert "[!EDITORIAL-BLOCK-START|in_the_know_box]" in payload["improved_article"]["content"]
    assert "[!EDITORIAL-BLOCK-LABEL|In The Know]" in payload["improved_article"]["content"]
    assert "[!EDITORIAL-BOX|in_the_know_box]" in payload["improved_article"]["content"]
    assert "[!EDITORIAL-BLOCK-END|in_the_know_box]" in payload["improved_article"]["content"]
    assert "[!EDITORIAL-BLOCK-START|key_takeaways_box]" in payload["improved_article"]["content"]
    assert "[!EDITORIAL-BLOCK-LABEL|Key Takeaways]" in payload["improved_article"]["content"]
    assert "[!EDITORIAL-BOX|key_takeaways_box]" in payload["improved_article"]["content"]
    assert "[!EDITORIAL-BLOCK-END|key_takeaways_box]" in payload["improved_article"]["content"]
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
    assert (
        payload["guideline_review"]["narrative_focus_applied"]
        == "Prioritize practical insights for travelers."
    )
    assert payload["guideline_review"]["model_used"] == "gemini-2.5-flash"
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
    ):
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

    monkeypatch.setattr(url2blog_routes, "extract_article", stub_extract_article)
    monkeypatch.setattr(
        url2blog_routes, "classify_article_type", stub_classify_article_type
    )
    monkeypatch.setattr(url2blog_routes, "_invoke_json_llm", stub_invoke_json_llm)
    monkeypatch.setattr(
        url2blog_routes,
        "_invoke_google_grounded_json",
        lambda *args, **kwargs: (
            {"context_points": [], "usage_note": "No context added."},
            '{"context_points":[]}',
            [],
        ),
    )
    monkeypatch.setattr(
        url2blog_routes,
        "get_article_type_by_id",
        lambda article_type_id: {
            "id": article_type_id,
            "name": "Explainer",
            "guideline": "Use clear plain-language explanations.",
            "title_guideline": "",
        },
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
    ):
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

    monkeypatch.setattr(url2blog_routes, "extract_article", stub_extract_article)
    monkeypatch.setattr(
        url2blog_routes, "classify_article_type", stub_classify_article_type
    )
    monkeypatch.setattr(url2blog_routes, "_invoke_json_llm", stub_invoke_json_llm)
    monkeypatch.setattr(
        url2blog_routes,
        "_invoke_google_grounded_json",
        lambda *args, **kwargs: (
            captured.__setitem__("grounded_enrichment_called", True),
            {"context_points": [], "usage_note": "Not used in lean profile."},
            "{}",
            [],
        )[1:],
    )
    monkeypatch.setattr(
        url2blog_routes,
        "get_article_type_by_id",
        lambda article_type_id: {
            "id": article_type_id,
            "name": "Guide",
            "guideline": "Keep guidance explicit.",
            "title_guideline": "Use practical titles.",
        },
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
    ):
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

    monkeypatch.setattr(url2blog_routes, "extract_article", stub_extract_article)
    monkeypatch.setattr(
        url2blog_routes, "classify_article_type", stub_classify_article_type
    )
    monkeypatch.setattr(url2blog_routes, "_invoke_json_llm", stub_invoke_json_llm)
    monkeypatch.setattr(
        url2blog_routes,
        "_invoke_google_grounded_json",
        lambda *args, **kwargs: (
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
    )
    monkeypatch.setattr(
        url2blog_routes,
        "get_article_type_by_id",
        lambda article_type_id: {
            "id": article_type_id,
            "name": "Guide",
            "guideline": "Use clear structure.",
            "title_guideline": "Use clear title.",
        },
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
    assert "[!EDITORIAL-BLOCK-START|highlight_callout]" in payload["improved_article"]["content"]
    assert "[!EDITORIAL-BLOCK-LABEL|Highlight Callout]" in payload["improved_article"]["content"]
    assert "[!EDITORIAL-BOX|highlight_callout]" in payload["improved_article"]["content"]
    assert "[!EDITORIAL-BLOCK-END|highlight_callout]" in payload["improved_article"]["content"]
    assert "editorial_augmentation_raw_response" in payload["debug"]
    assert payload["debug"]["editorial_components_added"][0]["component"] == (
        "highlight_callout"
    )
    assert payload["debug"]["json_parse_metrics"]["total_parse_failures"] == 0
    assert payload["debug"]["external_context_points"][0]["source_url"] == (
        "https://example.com/context"
    )


def test_extract_json_from_response_handles_unclosed_markdown_fence():
    raw_response = (
        "```json\n"
        '{\n'
        '  "classification": "When to Visit Article",\n'
        '  "confidence": 1.0,\n'
        '  "reasoning": "Editorial intent match."\n'
        "}"
    )

    parsed, parse_error = url2blog_routes._extract_json_from_response(raw_response)

    assert parse_error is None
    assert parsed is not None
    assert parsed["classification"] == "When to Visit Article"
    assert parsed["confidence"] == 1.0


def test_extract_json_from_response_repairs_unterminated_string():
    raw_response = (
        "```json\n"
        "{\n"
        '  "title": "Sample headline",\n'
        '  "content": "This article compares shoulder season weather and crowds'
    )

    parsed, parse_error = url2blog_routes._extract_json_from_response(raw_response)

    assert parse_error is None
    assert parsed is not None
    assert parsed["title"] == "Sample headline"
    assert parsed["content"].endswith("crowds")


def test_editorial_augmentation_normalizes_faq_component_and_adds_box():
    parsed = {
        "augmented_content": (
            "## Overview\n\nThis article compares timing, weather, crowds, and cost."
        ),
        "components_added": [
            {
                "component": "faq",
                "justification": "Captures question-style search arrivals without new claims.",
                "placement": "Near the end after key takeaways.",
            }
        ],
        "diagnostic": {
            "cognitive_load": "strong",
            "narrative_density": "strong",
            "emphasis_clarity": "strong",
            "reading_behavior_risk": "weak",
        },
        "augmentation_summary": "Added compact FAQ block for search-intent coverage.",
    }

    sanitized = url2blog_routes._sanitize_v2_editorial_augmentation(
        parsed,
        fallback_content="## Overview\n\nFallback body.",
    )

    assert sanitized["components_added"][0]["component"] == "faq_block"
    assert "[!EDITORIAL-BLOCK-START|faq_block]" in sanitized["augmented_content"]
    assert "[!EDITORIAL-BLOCK-LABEL|FAQ Block]" in sanitized["augmented_content"]
    assert "[!EDITORIAL-BOX|faq_block]" in sanitized["augmented_content"]
    assert "[!EDITORIAL-BLOCK-END|faq_block]" in sanitized["augmented_content"]
    assert "**Component:** FAQ Block" in sanitized["augmented_content"]


def test_editorial_augmentation_adds_official_label_inside_existing_block():
    parsed = {
        "augmented_content": (
            "## Overview\n\n"
            "> [!EDITORIAL-BLOCK-START|highlight_callout]\n"
            "> [!EDITORIAL-BOX|highlight_callout]\n"
            "> Brief pacing reset sentence.\n"
            "> [!EDITORIAL-BLOCK-END|highlight_callout]\n"
        ),
        "components_added": [
            {
                "component": "highlight_callout",
                "justification": "Creates breathing room in a dense area.",
                "placement": "After the first section.",
            }
        ],
    }

    sanitized = url2blog_routes._sanitize_v2_editorial_augmentation(
        parsed,
        fallback_content="## Overview\n\nFallback body.",
    )

    assert "[!EDITORIAL-BLOCK-START|highlight_callout]" in sanitized["augmented_content"]
    assert "[!EDITORIAL-BLOCK-LABEL|Highlight Callout]" in sanitized["augmented_content"]
    assert "[!EDITORIAL-BOX|highlight_callout]" in sanitized["augmented_content"]
    assert "**Component:** Highlight Callout" in sanitized["augmented_content"]
    assert "[!EDITORIAL-BLOCK-END|highlight_callout]" in sanitized["augmented_content"]


def test_invoke_json_llm_tracks_parse_recovery(monkeypatch):
    responses = iter(
        [
            (
                '{"classification":"When to Visit Article",'
                '"confidence":1.0,'
                '"reasoning":"The article intent",}'
            ),
            (
                '{'
                '"classification":"When to Visit Article",'
                '"confidence":1.0,'
                '"reasoning":"Editorial intent fit."'
                '}'
            ),
        ]
    )

    class StubLLM:
        def invoke(self, prompt: str) -> str:  # noqa: ARG002 - prompt asserted by caller
            return next(responses)

    monkeypatch.setattr(
        url2blog_routes,
        "get_vertex_llm",
        lambda *args, **kwargs: StubLLM(),  # noqa: ARG005 - signature parity
    )

    metrics = {
        "total_parse_failures": 0,
        "recovered_calls": 0,
        "recovered_parse_failures": 0,
        "failures_by_stage": {},
    }

    with url2blog_routes._json_parse_tracking_scope(metrics, "unit_test_stage"):
        parsed, _ = url2blog_routes._invoke_json_llm(
            prompt="Return strict JSON.",
            max_tokens=256,
            temperature=0.1,
            model_name="gemini-2.5-flash",
        )

    assert parsed["classification"] == "When to Visit Article"
    assert metrics["total_parse_failures"] == 1
    assert metrics["recovered_calls"] == 1
    assert metrics["recovered_parse_failures"] == 1
    assert metrics["failures_by_stage"]["unit_test_stage"] == 1


def test_resolve_min_expanded_word_target_enforces_growth():
    assert url2blog_routes._resolve_min_expanded_word_target(100) >= 180
    assert url2blog_routes._resolve_min_expanded_word_target(450) >= 530


def test_editorial_augmentation_does_not_shorten_article_body():
    fallback_content = (
        "## Overview\n\n"
        "Peru has multiple climate zones that affect trip timing.\n\n"
        "## Key Insights\n\n"
        "Dry season in the highlands and summer on the coast do not fully overlap.\n\n"
        "## Practical Implications\n\n"
        "Travelers should prioritize weather, crowds, and budget based on region."
    )
    parsed = {
        "augmented_content": "## Overview\n\nShort summary only.",
        "components_added": [
            {
                "component": "faq_block",
                "justification": "Adds question-style retrieval for skimmers.",
                "placement": "Near the end.",
            }
        ],
    }

    sanitized = url2blog_routes._sanitize_v2_editorial_augmentation(
        parsed,
        fallback_content=fallback_content,
    )

    assert len(url2blog_routes._tokenize_similarity_words(sanitized["augmented_content"])) >= len(
        url2blog_routes._tokenize_similarity_words(fallback_content)
    )
    assert "[!EDITORIAL-BLOCK-START|faq_block]" in sanitized["augmented_content"]
