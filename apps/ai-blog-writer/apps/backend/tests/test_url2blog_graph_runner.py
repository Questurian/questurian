import json

from fastapi.responses import JSONResponse

import app.features.url2blog.graph.runner as url2blog_graph_runner
import app.features.url2blog.graph.routing as url2blog_routing
from app.features.url2blog.pipeline_v2.gating import (
    _build_v2_rewrite_retry_feedback,
)


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
            "required_revisions": [
                f"revision-{idx}" for idx in range(required_revisions)
            ],
            "too_close_to_source": too_close_to_source,
        },
        "ngram_overlap": ngram_overlap,
    }


def test_rewrite_gate_requests_retry_before_max_retries():
    decision, gate_data = url2blog_routing.evaluate_rewrite_gate(
        context=_build_rewrite_context(score=6.0, required_revisions=3),
        retry_count=0,
    )

    assert decision == "retry"
    assert gate_data["pass_mode"] == "retry_required"


def test_rewrite_gate_allows_fallback_pass_after_retries():
    decision, gate_data = url2blog_routing.evaluate_rewrite_gate(
        context=_build_rewrite_context(score=6.0, required_revisions=3),
        retry_count=url2blog_routing.URL2BLOG_REWRITE_GATE_MAX_RETRIES,
    )

    assert decision == "pass"
    assert gate_data["pass_mode"] == "fallback_after_failed_gate"
    assert gate_data["overall_score"] == 6.0


def test_rewrite_gate_rejects_fallback_when_too_close_to_source():
    decision, gate_data = url2blog_routing.evaluate_rewrite_gate(
        context=_build_rewrite_context(
            score=6.0,
            required_revisions=3,
            too_close_to_source=True,
        ),
        retry_count=url2blog_routing.URL2BLOG_REWRITE_GATE_MAX_RETRIES,
    )

    assert decision == "fail"
    assert gate_data["pass_mode"] == "failed_after_retries"
    assert "rewrite quality gate failed after retries" in gate_data["failure_reason"]


def test_rewrite_gate_rejects_fallback_when_revisions_too_high():
    decision, gate_data = url2blog_routing.evaluate_rewrite_gate(
        context=_build_rewrite_context(score=6.0, required_revisions=6),
        retry_count=url2blog_routing.URL2BLOG_REWRITE_GATE_MAX_RETRIES,
    )

    assert decision == "fail"
    assert gate_data["pass_mode"] == "failed_after_retries"
    assert "rewrite quality gate failed after retries" in gate_data["failure_reason"]


def test_build_v2_rewrite_retry_feedback_is_empty_for_initial_attempt():
    feedback = _build_v2_rewrite_retry_feedback(
        retry_count=0,
        retry_feedback={},
        previous_quality={},
    )

    assert feedback == ""


def test_build_v2_rewrite_retry_feedback_uses_previous_quality_details():
    feedback = _build_v2_rewrite_retry_feedback(
        retry_count=1,
        retry_feedback={},
        previous_quality={
            "overall_score": 6,
            "quality_summary": "Needs stronger structure and clearer utility.",
            "required_revisions": [
                "Improve section progression and transitions.",
                "Add concrete reader takeaways in each section.",
            ],
        },
    )

    assert "rewrite attempt #2" in feedback
    assert "Prior overall score: 6/10" in feedback
    assert "Recommended rewrite intensity: strong" in feedback
    assert "Needs stronger structure and clearer utility." in feedback
    assert "- Improve section progression and transitions." in feedback
    assert "- Add concrete reader takeaways in each section." in feedback


def test_fact_gate_soft_fails_with_unverified_facts_warning():
    decision, gate_data = url2blog_routing.evaluate_fact_gate(
        context={
            "fact_coverage": {
                "coverage_score": 7.0,
                "missing_high_count": 1,
                "missing_count": 1,
                "missing_facts": [{"fact_id": "F2", "fact": "x", "priority": "high"}],
                "coverage_summary": "one high fact missing",
            },
        },
        retry_count=url2blog_routing.URL2BLOG_FACT_GATE_MAX_RETRIES,
    )

    assert decision == "pass"
    assert gate_data["pass_mode"] == "fallback_unverified_facts"
    assert "could not be fully verified" in gate_data["fact_warning"]
    assert gate_data["missing_facts"][0]["fact_id"] == "F2"
    assert gate_data["coverage_summary"] == "one high fact missing"


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
