import asyncio
import json
import sys
import types
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks
from pydantic import ValidationError

from app.core import clear_all_runs, read_status

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
utils_stub.parse_json_response = lambda value: json.loads(value)
sys.modules.setdefault("utils", utils_stub)

import app.features.prompt2blog.routes as prompt2blog_routes


def _response_payload(response) -> dict:
    return json.loads(response.body.decode("utf-8"))


def _seed_completed_run(run_id: str) -> None:
    prompt2blog_routes.write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "completed",
            "stage": "complete",
            "error": None,
            "updated_at": "2026-03-05T00:00:00Z",
        },
        feature="prompt2blog",
    )
    prompt2blog_routes.write_artifact(
        run_id,
        {
            "markdown": "# Persisted Prompt2Blog Title\n\n## Overview\n\nBody content.",
            "pipeline_v2": {
                "improved_article": {
                    "title": "Persisted Prompt2Blog Title",
                    "content": "## Overview\n\nBody content.",
                },
                "article_type": {"id": 11, "name": "Explainer"},
            },
        },
    )


def test_prompt2blog_storage_endpoints_without_http_client():
    clear_all_runs(feature="prompt2blog")
    run_id = f"p2b-{uuid4()}"
    _seed_completed_run(run_id)

    status_payload = _response_payload(asyncio.run(prompt2blog_routes.get_status(run_id)))
    assert status_payload["feature"] == "prompt2blog"
    assert status_payload["state"] == "completed"

    result_payload = _response_payload(asyncio.run(prompt2blog_routes.get_result(run_id)))
    assert result_payload["run_id"] == run_id
    assert result_payload["markdown"].startswith("# Persisted Prompt2Blog Title")

    articles_payload = _response_payload(asyncio.run(prompt2blog_routes.get_articles()))
    matching = [item for item in articles_payload if item["run_id"] == run_id]
    assert matching
    assert matching[0]["title"] == "Persisted Prompt2Blog Title"
    assert matching[0]["article_type"] == "Explainer"

    sync_before = _response_payload(asyncio.run(prompt2blog_routes.get_sync_status(run_id)))
    assert sync_before["synced_to_payload"] is False

    sync_mark = _response_payload(
        asyncio.run(
            prompt2blog_routes.mark_article_as_synced(
                run_id,
                {"payload_article_id": 8883},
            )
        )
    )
    assert sync_mark["payload_article_id"] == 8883

    sync_after = _response_payload(asyncio.run(prompt2blog_routes.get_sync_status(run_id)))
    assert sync_after["synced_to_payload"] is True
    assert sync_after["payload_article_id"] == 8883

    clear_all_runs(feature="prompt2blog")


def test_prompt2blog_start_pipeline_v2_queues_background_task(monkeypatch):
    clear_all_runs(feature="prompt2blog")
    captured: dict[str, object] = {}

    def _fake_run_full_pipeline(run_id: str, request):  # noqa: ANN001
        captured["run_id"] = run_id
        captured["request"] = request

    monkeypatch.setattr(prompt2blog_routes, "_run_full_pipeline", _fake_run_full_pipeline)

    request = prompt2blog_routes.Prompt2BlogInputRequest(
        article_type_id=1,
        source_material=["One source blob."],
        article_goal="Generate a practical article.",
        target_reader="General readers",
        destination_context="Barcelona, Spain",
        tone_id="practical",
        length_id="medium",
        brand_voice_id="questurian-default",
        include_debug=False,
        enable_editorial_augmentation=False,
    )
    background_tasks = BackgroundTasks()

    response = asyncio.run(
        prompt2blog_routes.start_pipeline_v2(
            request=request,
            background_tasks=background_tasks,
        )
    )
    payload = _response_payload(response)
    run_id = payload["run_id"]
    assert payload["message"] == "Prompt2Blog pipeline v2 queued"

    assert len(background_tasks.tasks) == 1
    task = background_tasks.tasks[0]
    task.func(*task.args, **task.kwargs)

    assert captured["run_id"] == run_id
    assert isinstance(captured["request"], prompt2blog_routes.Prompt2BlogInputRequest)
    assert read_status(run_id)["feature"] == "prompt2blog"

    clear_all_runs(feature="prompt2blog")


def test_prompt2blog_rejects_legacy_payload_shape():
    with pytest.raises(ValidationError):
        prompt2blog_routes.Prompt2BlogInputRequest.model_validate(
            {
                "raw_sources": ["legacy"],
                "writing_brief": {},
            }
        )


def test_prompt2blog_input_options_endpoint_returns_catalog(monkeypatch):
    monkeypatch.setattr(
        prompt2blog_routes,
        "read_article_type_name_definitions",
        lambda: [{"name": "Explainer", "definition": "Explains things clearly."}],
    )
    monkeypatch.setattr(
        prompt2blog_routes,
        "get_article_type_by_name",
        lambda _name: {
            "id": 11,
            "name": "Explainer",
            "definition": "Explains things clearly.",
        },
    )

    payload = _response_payload(asyncio.run(prompt2blog_routes.get_input_options()))
    assert payload["article_types"][0]["id"] == 11
    assert payload["tones"]
    assert payload["lengths"]
    assert payload["brand_voices"]


def test_prompt2blog_guideline_preview_endpoint_returns_selected_type(monkeypatch):
    monkeypatch.setattr(
        prompt2blog_routes,
        "get_article_type_by_id",
        lambda article_type_id: {
            "id": article_type_id,
            "name": "Explainer",
            "definition": "Explains things clearly.",
            "guideline": "Fallback guideline.",
            "title_guideline": "Fallback title guideline.",
        },
    )

    payload = _response_payload(
        asyncio.run(prompt2blog_routes.get_article_type_guideline_preview(11))
    )
    assert payload["id"] == 11
    assert payload["name"] == "Explainer"
    assert isinstance(payload["guideline"], str)
    assert isinstance(payload["title_guideline"], str)
