"""Prompt2Blog run lifecycle route contracts."""

import asyncio

import pytest
from fastapi import BackgroundTasks
from pydantic import ValidationError

from tests.prompt2blog_test_support import response_payload

import app.features.prompt2blog.routes as prompt2blog_routes
from app.core import read_status
from app.features.prompt2blog.api import runs as runs_api
from app.features.prompt2blog.models import PipelineV2RuntimeRequest

pytest_plugins = ["tests.prompt2blog_test_fixtures"]


def test_completed_run_exposes_status_and_result(completed_prompt2blog_run):
    status_payload = response_payload(
        asyncio.run(prompt2blog_routes.get_status(completed_prompt2blog_run))
    )
    assert status_payload["feature"] == "prompt2blog"
    assert status_payload["state"] == "completed"

    result_payload = response_payload(
        asyncio.run(prompt2blog_routes.get_result(completed_prompt2blog_run))
    )
    assert result_payload["run_id"] == completed_prompt2blog_run
    assert result_payload["markdown"].startswith("# Persisted Prompt2Blog Title")


def test_start_pipeline_v2_queues_background_task(
    empty_prompt2blog_storage, monkeypatch
):
    captured: dict[str, object] = {}

    def _fake_run_full_pipeline(run_id: str, request):  # noqa: ANN001
        captured["run_id"] = run_id
        captured["request"] = request

    monkeypatch.setattr(runs_api, "run_full_pipeline", _fake_run_full_pipeline)

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
    payload = response_payload(response)
    run_id = payload["run_id"]
    assert payload["message"] == "Prompt2Blog pipeline v2 queued"

    assert len(background_tasks.tasks) == 1
    task = background_tasks.tasks[0]
    task.func(*task.args, **task.kwargs)

    assert captured["run_id"] == run_id
    assert isinstance(captured["request"], prompt2blog_routes.Prompt2BlogInputRequest)
    assert read_status(run_id)["feature"] == "prompt2blog"


def test_input_request_rejects_legacy_payload_shape():
    with pytest.raises(ValidationError):
        prompt2blog_routes.Prompt2BlogInputRequest.model_validate(
            {
                "raw_sources": ["legacy"],
                "writing_brief": {},
            }
        )


def test_editorial_augmentation_is_opt_in_by_default():
    request = prompt2blog_routes.Prompt2BlogInputRequest(
        article_type_id=1,
        source_material=["One source blob."],
        article_goal="Generate a practical article.",
        target_reader="General readers",
        destination_context="Barcelona, Spain",
        tone_id="practical",
        length_id="medium",
    )
    runtime_request = PipelineV2RuntimeRequest(
        cleaned_data="Cleaned source.",
        article_type_id=1,
    )

    assert request.enable_editorial_augmentation is False
    assert runtime_request.enable_editorial_augmentation is False
