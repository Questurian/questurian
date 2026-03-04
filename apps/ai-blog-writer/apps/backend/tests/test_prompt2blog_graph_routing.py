import json
import sys
import types

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
utils_stub.parse_json_response = lambda value: json.loads(value)
sys.modules.setdefault("utils", utils_stub)

import app.features.prompt2blog.routes as prompt2blog_routes


def test_prompt2blog_pipeline_v2_routes_through_graph_runner(monkeypatch):
    captured: dict[str, object] = {}

    def _fake_graph_runner(*, run_id, pipeline_runner):
        captured["run_id"] = run_id
        captured["pipeline_runner"] = pipeline_runner

    monkeypatch.setattr(
        prompt2blog_routes,
        "run_prompt2blog_pipeline_v2_graph",
        _fake_graph_runner,
    )

    request = prompt2blog_routes.PipelineV2Request(
        cleaned_data="Cleaned source",
        article_type_id=3,
        raw_sources=["source"],
        writing_brief={},
        include_debug=False,
        enable_editorial_augmentation=False,
    )

    prompt2blog_routes._run_pipeline_v2("run-p2b-v2", request)

    assert captured["run_id"] == "run-p2b-v2"
    assert callable(captured["pipeline_runner"])


def test_prompt2blog_full_run_routes_through_graph_runner(monkeypatch):
    captured: dict[str, object] = {}

    def _fake_graph_runner(*, run_id, prepare_runner, pipeline_runner):
        captured["run_id"] = run_id
        captured["prepare_runner"] = prepare_runner
        captured["pipeline_runner"] = pipeline_runner

    monkeypatch.setattr(
        prompt2blog_routes,
        "run_prompt2blog_full_graph",
        _fake_graph_runner,
    )

    request = prompt2blog_routes.RunRequest(
        raw_sources=["raw source"],
        writing_brief={},
        include_debug=False,
        enable_editorial_augmentation=False,
    )

    prompt2blog_routes._run_full_pipeline("run-p2b-full", request)

    assert captured["run_id"] == "run-p2b-full"
    assert callable(captured["prepare_runner"])
    assert callable(captured["pipeline_runner"])
