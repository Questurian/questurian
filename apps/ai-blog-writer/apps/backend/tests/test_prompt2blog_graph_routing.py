import json
import sys
import types

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
utils_stub.parse_json_response = lambda value: json.loads(value)
sys.modules.setdefault("utils", utils_stub)

import app.features.prompt2blog.orchestrator as orchestrator  # noqa: E402
from app.features.prompt2blog.models import (  # noqa: E402
    PipelineV2RuntimeRequest,
    Prompt2BlogInputRequest,
)


def test_prompt2blog_pipeline_v2_routes_each_stage_through_graph(monkeypatch):
    captured: dict[str, object] = {}

    def _fake_graph_runner(**kwargs):  # noqa: ANN003
        captured.update(kwargs)
        return kwargs["initial_state"]

    monkeypatch.setattr(orchestrator, "run_prompt2blog_stage_graph", _fake_graph_runner)

    request = PipelineV2RuntimeRequest(
        cleaned_data="Cleaned source",
        article_type_id=3,
        raw_sources=["source"],
        writing_brief={},
        option_context={},
        include_debug=False,
        enable_editorial_augmentation=False,
    )
    orchestrator.run_pipeline_v2("run-p2b-v2", request)

    assert captured["run_id"] == "run-p2b-v2"
    assert [name for name, _node in captured["nodes"]] == [
        "guideline",
        "coverage",
        "supplement",
        "outline",
        "compose",
        "groundedness",
        "quality_audit",
        "repair",
        "quality_settle",
        "editorial_augmentation",
        "final_verify",
        "title",
        "finalize",
    ]


def test_prompt2blog_full_run_prepends_preparation_node(monkeypatch):
    captured: dict[str, object] = {}

    def _fake_graph_runner(**kwargs):  # noqa: ANN003
        captured.update(kwargs)
        return kwargs["initial_state"]

    monkeypatch.setattr(orchestrator, "run_prompt2blog_stage_graph", _fake_graph_runner)

    request = Prompt2BlogInputRequest(
        article_type_id=3,
        source_material=["raw source"],
        article_goal="Draft a practical article.",
        target_reader="General traveler",
        destination_context="Kyoto, Japan",
        tone_id="practical",
        length_id="medium",
        include_debug=False,
        enable_editorial_augmentation=False,
    )
    orchestrator.run_full_pipeline("run-p2b-full", request)

    assert captured["run_id"] == "run-p2b-full"
    assert [name for name, _node in captured["nodes"]] == [
        "prepare",
        "guideline",
        "coverage",
        "supplement",
        "outline",
        "compose",
        "groundedness",
        "quality_audit",
        "repair",
        "quality_settle",
        "editorial_augmentation",
        "final_verify",
        "title",
        "finalize",
    ]
