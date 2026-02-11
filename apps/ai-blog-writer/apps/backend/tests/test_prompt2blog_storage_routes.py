import json
import sys
import time
import types

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import clear_all_runs

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
utils_stub.parse_json_response = lambda value: json.loads(value)
sys.modules.setdefault("utils", utils_stub)

import app.features.prompt2blog.routes as prompt2blog_routes


def _long_markdown_body() -> str:
    sentence = (
        "This section keeps practical guidance explicit while preserving source facts "
        "and maintaining editorial clarity for readers."
    )
    paragraphs = [sentence for _ in range(18)]
    return "## Overview\n\n" + "\n\n".join(paragraphs)


def test_prompt2blog_persists_result_articles_and_sync_endpoints(monkeypatch):
    app = FastAPI()
    app.include_router(prompt2blog_routes.router)
    client = TestClient(app)

    clear_all_runs(feature="prompt2blog")

    monkeypatch.setattr(
        prompt2blog_routes,
        "get_article_type_by_id",
        lambda article_type_id: {
            "id": article_type_id,
            "name": "Explainer",
            "definition": "Explains a topic clearly.",
            "guideline": "Use clear structure.",
            "title_guideline": "Keep title explicit.",
        },
    )

    def stub_invoke_json_llm(
        *,
        prompt: str,
        max_tokens: int,
        temperature: float,
        model_name: str | None,
    ):
        if "You are a coverage analyst." in prompt:
            return (
                {
                    "coverage_sufficient": True,
                    "analysis": "Coverage is sufficient.",
                    "missing_sections": [],
                },
                '{"coverage_sufficient": true}',
            )

        if "You are an expert editor creating a publish-ready article" in prompt:
            return (
                {
                    "improved_title": "Persisted Prompt2Blog Title",
                    "improved_content": _long_markdown_body(),
                    "guideline_alignment_summary": "Aligned with target style.",
                    "improvements_applied": ["Improved structure."],
                    "remaining_gaps": [],
                },
                '{"improved_title": "Persisted Prompt2Blog Title"}',
            )

        if "You are a quality auditor for rewritten articles." in prompt:
            return (
                {
                    "overall_score": 9,
                    "guideline_coverage_score": 9,
                    "informativeness_score": 9,
                    "originality_score": 9,
                    "brief_adherence_score": 9,
                    "seo_score": 9,
                    "too_close_to_source": False,
                    "word_count_estimate": 600,
                    "constraint_checks": {
                        "target_word_count_met": True,
                        "paragraph_length_met": True,
                        "cta_present": True,
                        "primary_keyword_present": True,
                        "secondary_keywords_present": True,
                        "audience_match": True,
                        "tone_match": True,
                    },
                    "required_revisions": [],
                    "quality_summary": "Quality pass complete.",
                },
                '{"overall_score": 9}',
            )

        if "You are running a hard rewrite repair pass." in prompt:
            return (
                {
                    "improved_title": "Persisted Prompt2Blog Title",
                    "improved_content": _long_markdown_body(),
                    "guideline_alignment_summary": "Repair pass alignment.",
                    "improvements_applied": [],
                    "remaining_gaps": [],
                },
                '{"improved_title": "Persisted Prompt2Blog Title"}',
            )

        if "Prompt2Blog EDITORIAL AUGMENTATION" in prompt:
            return (
                {
                    "augmented_content": _long_markdown_body(),
                    "components_added": [],
                    "diagnostic": {
                        "cognitive_load": "strong",
                        "narrative_density": "strong",
                        "emphasis_clarity": "strong",
                        "reading_behavior_risk": "strong",
                    },
                    "augmentation_summary": "No editorial augmentation added.",
                },
                '{"augmented_content": "ok"}',
            )

        raise AssertionError(f"Unexpected JSON prompt: {prompt[:120]}")

    def stub_invoke_text_llm(
        *,
        prompt: str,
        max_tokens: int,
        temperature: float,
        model_name: str | None,
    ) -> str:
        if "You are an expert headline editor." in prompt:
            return "Persisted Prompt2Blog Title"
        raise AssertionError(f"Unexpected text prompt: {prompt[:120]}")

    monkeypatch.setattr(prompt2blog_routes, "_invoke_json_llm", stub_invoke_json_llm)
    monkeypatch.setattr(prompt2blog_routes, "_invoke_text_llm", stub_invoke_text_llm)

    run_response = client.post(
        "/prompt2blog/pipeline-v2",
        json={
            "cleaned_data": "Prompt2Blog cleaned source content for storage coverage.",
            "raw_sources": ["Prompt2Blog raw source for stage coverage."],
            "writing_brief": {},
            "article_type_id": 11,
            "include_debug": False,
            "enable_editorial_augmentation": False,
        },
    )

    assert run_response.status_code == 200
    payload = run_response.json()
    run_id = payload.get("run_id")
    assert isinstance(run_id, str) and run_id

    status_payload = None
    for _ in range(40):
        status_response = client.get(f"/prompt2blog/status/{run_id}")
        assert status_response.status_code == 200
        status_payload = status_response.json()
        if status_payload["state"] in {"completed", "failed"}:
            break
        time.sleep(0.05)

    assert status_payload is not None
    assert status_payload["feature"] == "prompt2blog"
    assert status_payload["state"] == "completed"

    result_response = client.get(f"/prompt2blog/result/{run_id}")
    assert result_response.status_code == 200
    result_payload = result_response.json()
    assert result_payload["run_id"] == run_id
    assert result_payload["markdown"].startswith("# Persisted Prompt2Blog Title")

    articles_response = client.get("/prompt2blog/articles")
    assert articles_response.status_code == 200
    articles_payload = articles_response.json()
    matching = [item for item in articles_payload if item["run_id"] == run_id]
    assert matching
    assert matching[0]["title"] == "Persisted Prompt2Blog Title"
    assert matching[0]["article_type"] == "Explainer"

    sync_status_before = client.get(f"/prompt2blog/articles/{run_id}/sync")
    assert sync_status_before.status_code == 200
    assert sync_status_before.json()["synced_to_payload"] is False

    sync_mark_response = client.post(
        f"/prompt2blog/articles/{run_id}/sync",
        json={"payload_article_id": 8883},
    )
    assert sync_mark_response.status_code == 200

    sync_status_after = client.get(f"/prompt2blog/articles/{run_id}/sync")
    assert sync_status_after.status_code == 200
    assert sync_status_after.json()["synced_to_payload"] is True
    assert sync_status_after.json()["payload_article_id"] == 8883

    clear_all_runs(feature="prompt2blog")
