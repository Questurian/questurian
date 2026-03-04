import json
import sys
import types

import pytest
from fastapi.responses import JSONResponse

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
sys.modules.setdefault("utils", utils_stub)

import app.features.url2blog.graph.runner as url2blog_graph_runner  # noqa: E402


def _build_rewrite_context(
    *,
    score: float,
    required_revisions: int,
    too_close_to_source: bool = False,
    ngram_overlap: float = 0.015,
) -> dict[str, object]:
    return {
        "quality": {
            "overall_score": score,
            "required_revisions": [f"revision-{idx}" for idx in range(required_revisions)],
            "too_close_to_source": too_close_to_source,
        },
        "ngram_overlap": ngram_overlap,
    }


def test_rewrite_gate_requests_retry_before_max_retries():
    decision, gate_data = url2blog_graph_runner._evaluate_rewrite_gate(
        context=_build_rewrite_context(score=6.0, required_revisions=3),
        retry_count=0,
    )

    assert decision == "retry"
    assert gate_data["pass_mode"] == "retry_required"


def test_rewrite_gate_allows_fallback_pass_after_retries():
    decision, gate_data = url2blog_graph_runner._evaluate_rewrite_gate(
        context=_build_rewrite_context(score=6.0, required_revisions=3),
        retry_count=url2blog_graph_runner.URL2BLOG_REWRITE_GATE_MAX_RETRIES,
    )

    assert decision == "pass"
    assert gate_data["pass_mode"] == "fallback_after_failed_gate"
    assert gate_data["overall_score"] == 6.0


def test_rewrite_gate_rejects_fallback_when_too_close_to_source():
    with pytest.raises(RuntimeError, match="rewrite quality gate failed after retries"):
        url2blog_graph_runner._evaluate_rewrite_gate(
            context=_build_rewrite_context(
                score=6.0,
                required_revisions=3,
                too_close_to_source=True,
            ),
            retry_count=url2blog_graph_runner.URL2BLOG_REWRITE_GATE_MAX_RETRIES,
        )


def test_rewrite_gate_rejects_fallback_when_revisions_too_high():
    with pytest.raises(RuntimeError, match="rewrite quality gate failed after retries"):
        url2blog_graph_runner._evaluate_rewrite_gate(
            context=_build_rewrite_context(score=6.0, required_revisions=6),
            retry_count=url2blog_graph_runner.URL2BLOG_REWRITE_GATE_MAX_RETRIES,
        )


def test_attach_trace_payload_drops_stale_content_length_header():
    response = JSONResponse({"message": "ok", "run_id": "run-123"})
    response.headers["content-length"] = "1"
    response.headers["x-test"] = "kept"

    updated, run_id = url2blog_graph_runner._attach_trace_payload(
        response,
        {"langsmith_trace_url": "https://trace.example/run-123"},
    )

    assert run_id == "run-123"
    assert updated.headers.get("x-test") == "kept"
    assert updated.headers.get("content-length") != "1"

    body = json.loads(updated.body.decode("utf-8"))
    assert body["run_id"] == "run-123"
    assert body["langsmith_trace_url"] == "https://trace.example/run-123"
