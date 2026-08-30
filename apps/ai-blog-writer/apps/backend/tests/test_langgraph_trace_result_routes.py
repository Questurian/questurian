import asyncio
import json

import app.features.prompt2blog.routes as prompt2blog_routes
from app.features.prompt2blog import observability as prompt2blog_observability
from app.features.prompt2blog.api import runs as prompt2blog_runs
from app.features.url2blog.api import runs as url2blog_runs


def _response_json(response) -> dict:
    return json.loads(response.body.decode("utf-8"))


def test_prompt2blog_result_includes_langgraph_trace_metadata(monkeypatch):
    run_id = "run-trace-1"
    trace_payload = {
        "langsmith_trace_url": "https://smith.langchain.com/public/runs/run-trace-1",
        "langsmith_trace_run_id": "run-trace-1",
    }

    monkeypatch.setattr(
        prompt2blog_runs,
        "read_status",
        lambda _run_id: {"run_id": _run_id, "feature": "prompt2blog"},
    )
    monkeypatch.setattr(
        prompt2blog_runs,
        "read_output",
        lambda _run_id: {
            "markdown": "# Prompt2Blog",
            "artifact": {
                "pipeline_v3": {
                    "message": "ok",
                    "run_id": _run_id,
                }
            },
        },
    )
    monkeypatch.setattr(
        prompt2blog_observability,
        "read_stage_result",
        lambda _run_id, stage: (
            {"data": trace_payload} if stage == "langgraph_trace" else None
        ),
    )

    response = asyncio.run(prompt2blog_routes.get_result(run_id))
    payload = _response_json(response)

    assert payload["langsmith_trace_url"] == trace_payload["langsmith_trace_url"]
    assert payload["langsmith_trace_run_id"] == trace_payload["langsmith_trace_run_id"]
    assert (
        payload["artifact"]["pipeline_v3"]["langsmith_trace_url"]
        == trace_payload["langsmith_trace_url"]
    )
    assert (
        payload["artifact"]["pipeline_v3"]["langsmith_trace_run_id"]
        == trace_payload["langsmith_trace_run_id"]
    )


def test_url2blog_result_includes_langgraph_trace_metadata(monkeypatch):
    run_id = "run-trace-2"
    trace_payload = {
        "langsmith_trace_url": "https://smith.langchain.com/public/runs/run-trace-2",
        "langsmith_trace_run_id": "run-trace-2",
    }

    monkeypatch.setattr(
        url2blog_runs,
        "read_status",
        lambda _run_id: {"run_id": _run_id, "feature": "url2blog"},
    )
    monkeypatch.setattr(
        url2blog_runs,
        "read_output",
        lambda _run_id: {
            "markdown": "# URL2Blog",
            "artifact": {
                "pipeline_v2": {
                    "message": "ok",
                    "run_id": _run_id,
                }
            },
        },
    )
    monkeypatch.setattr(
        url2blog_runs,
        "read_langgraph_trace",
        lambda _run_id: trace_payload,
    )

    response = asyncio.run(url2blog_runs.get_result(run_id))
    payload = _response_json(response)

    assert payload["langsmith_trace_url"] == trace_payload["langsmith_trace_url"]
    assert payload["langsmith_trace_run_id"] == trace_payload["langsmith_trace_run_id"]
    assert (
        payload["artifact"]["pipeline_v2"]["langsmith_trace_url"]
        == trace_payload["langsmith_trace_url"]
    )
    assert (
        payload["artifact"]["pipeline_v2"]["langsmith_trace_run_id"]
        == trace_payload["langsmith_trace_run_id"]
    )
