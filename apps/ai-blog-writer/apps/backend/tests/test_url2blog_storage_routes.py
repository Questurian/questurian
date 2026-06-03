import sys
import types

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.core import clear_all_runs

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
sys.modules.setdefault("utils", utils_stub)

import app.features.url2blog.routes as url2blog_routes


def _long_markdown_body() -> str:
    sentence = (
        "This section keeps practical guidance explicit while preserving source facts "
        "and maintaining editorial clarity for readers."
    )
    paragraphs = [sentence for _ in range(28)]
    return "## Overview\n\n" + "\n\n".join(paragraphs)


def test_url2blog_persists_result_articles_and_sync_endpoints(monkeypatch):
    app = FastAPI()
    app.include_router(url2blog_routes.router)
    client = TestClient(app)

    clear_all_runs(feature="url2blog")

    async def stub_extract_article(request):
        return JSONResponse(
            {
                "message": "URL2Blog stage 1 completed",
                "source_url": request.url,
                "raw_text_length": 500,
                "raw_response": "{}",
                "parsed": {
                    "title": "Persisted URL2Blog Title",
                    "content": "Source content used for storage route coverage.",
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
                    "id": 8,
                    "name": "Explainer",
                    "definition": "Explains a topic clearly.",
                    "confidence": 0.9,
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
        if "extracting factual anchors from a source article" in prompt:
            return ({"facts": []}, '{"facts": []}')

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
                '{"overall_score": 9}',
            )

        return (
            {
                "improved_title": "Persisted URL2Blog Title",
                "improved_content": _long_markdown_body(),
                "guideline_alignment_summary": "Aligned with target style.",
                "improvements_applied": ["Improved structure."],
                "remaining_gaps": [],
            },
            '{"improved_title": "Persisted URL2Blog Title"}',
        )

    monkeypatch.setattr(url2blog_routes, "extract_article", stub_extract_article)
    monkeypatch.setattr(
        url2blog_routes, "classify_article_type", stub_classify_article_type
    )
    monkeypatch.setattr(url2blog_routes, "_invoke_json_llm", stub_invoke_json_llm)
    monkeypatch.setattr(
        url2blog_routes,
        "_invoke_google_grounded_json",
        lambda *args, **kwargs: ({"context_points": [], "usage_note": ""}, "{}", []),
    )
    monkeypatch.setattr(
        url2blog_routes,
        "get_article_type_by_id",
        lambda article_type_id: {
            "id": article_type_id,
            "name": "Explainer",
            "guideline": "Use clear structure.",
            "title_guideline": "Keep title explicit.",
        },
    )

    run_response = client.post(
        "/url2blog/pipeline-v2",
        json={
            "url": "https://example.com/url2blog-storage",
            "execution_profile": "lean",
            "enable_web_enrichment": False,
            "enable_editorial_augmentation": False,
        },
    )

    assert run_response.status_code == 200
    payload = run_response.json()
    run_id = payload.get("run_id")
    assert isinstance(run_id, str) and run_id

    status_response = client.get(f"/url2blog/status/{run_id}")
    assert status_response.status_code == 200
    assert status_response.json()["feature"] == "url2blog"
    assert status_response.json()["state"] == "completed"

    result_response = client.get(f"/url2blog/result/{run_id}")
    assert result_response.status_code == 200
    result_payload = result_response.json()
    assert result_payload["run_id"] == run_id
    assert result_payload["markdown"].startswith("# Persisted URL2Blog Title")

    articles_response = client.get("/url2blog/articles")
    assert articles_response.status_code == 200
    articles_payload = articles_response.json()
    matching = [item for item in articles_payload if item["run_id"] == run_id]
    assert matching
    assert matching[0]["title"] == "Persisted URL2Blog Title"
    assert matching[0]["article_type"] == "Explainer"

    sync_status_before = client.get(f"/url2blog/articles/{run_id}/sync")
    assert sync_status_before.status_code == 200
    assert sync_status_before.json()["synced_to_payload"] is False

    sync_mark_response = client.post(
        f"/url2blog/articles/{run_id}/sync",
        json={"payload_article_id": 9991},
    )
    assert sync_mark_response.status_code == 200

    sync_status_after = client.get(f"/url2blog/articles/{run_id}/sync")
    assert sync_status_after.status_code == 200
    assert sync_status_after.json()["synced_to_payload"] is True
    assert sync_status_after.json()["payload_article_id"] == 9991

    clear_all_runs(feature="url2blog")
