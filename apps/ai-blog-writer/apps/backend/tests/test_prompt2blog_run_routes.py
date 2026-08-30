"""Prompt2Blog run lifecycle route contracts."""

import asyncio
import json
from pathlib import Path

import pytest
from fastapi import BackgroundTasks
from pydantic import ValidationError

from tests.prompt2blog_test_support import response_payload

import app.features.prompt2blog.routes as prompt2blog_routes
from app.core import read_status
from app.features.prompt2blog.api import runs as runs_api

pytest_plugins = ["tests.prompt2blog_test_fixtures"]

FIXTURE_DIR = (
    Path(__file__).parents[3] / "data" / "fixtures" / "prompt2blog"
)


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


def test_result_route_attaches_the_trace_to_a_v3_artifact(monkeypatch):
    """A v3 run must surface its trace where a v2 run always has."""
    artifact = {"pipeline_v3": {"run_id": "v3-run", "status": "completed"}}
    monkeypatch.setattr(
        runs_api,
        "read_status",
        lambda _run_id: {"feature": "prompt2blog", "state": "completed"},
    )
    monkeypatch.setattr(
        runs_api,
        "read_output",
        lambda _run_id: {"markdown": "# Lima", "artifact": artifact},
    )
    monkeypatch.setattr(
        runs_api,
        "_read_langgraph_trace",
        lambda _run_id: {"langsmith_trace_url": "https://trace.example/v3-run"},
    )

    payload = response_payload(asyncio.run(prompt2blog_routes.get_result("v3-run")))

    assert (
        payload["artifact"]["pipeline_v3"]["langsmith_trace_url"]
        == "https://trace.example/v3-run"
    )
    assert payload["langsmith_trace_url"] == "https://trace.example/v3-run"
    assert "pipeline_v2" not in payload["artifact"]

