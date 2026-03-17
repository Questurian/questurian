import sys
import types

import pytest

# Avoid importing heavyweight external LLM clients during module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
utils_stub.parse_json_response = lambda *args, **kwargs: {}
sys.modules.setdefault("utils", utils_stub)

import app.features.youtube2blog.graph.runner as youtube2blog_graph_runner  # noqa: E402


def test_stage1_gate_uses_standard_retention_ratio_for_short_transcripts():
    decision, gate_data = youtube2blog_graph_runner._evaluate_stage1_gate(
        cleaned_chars=1200,
        original_chars=10_000,
        retry_count=0,
    )

    assert decision == "retry"
    assert gate_data["checks"]["minimum_retention_ratio"] is False
    assert gate_data["metrics"]["minimum_retention_ratio_threshold"] == 0.2
    assert gate_data["metrics"]["maximum_retention_ratio_threshold"] == 0.9
    assert gate_data["metrics"]["transcript_length_profile"] == "standard"


def test_stage1_gate_allows_lower_retention_for_long_transcripts():
    decision, gate_data = youtube2blog_graph_runner._evaluate_stage1_gate(
        cleaned_chars=3_751,
        original_chars=40_000,
        retry_count=0,
    )

    assert decision == "pass"
    assert gate_data["checks"]["minimum_retention_ratio"] is True
    assert gate_data["metrics"]["retention_ratio"] == 0.0938
    assert gate_data["metrics"]["minimum_retention_ratio_threshold"] == 0.08
    assert gate_data["metrics"]["maximum_retention_ratio_threshold"] == 0.98
    assert gate_data["metrics"]["transcript_length_profile"] == "long_form"


def test_stage1_gate_allows_high_retention_for_long_transcripts():
    decision, gate_data = youtube2blog_graph_runner._evaluate_stage1_gate(
        cleaned_chars=36_182,
        original_chars=39_840,
        retry_count=0,
    )

    assert decision == "pass"
    assert gate_data["checks"]["maximum_retention_ratio"] is True
    assert gate_data["metrics"]["retention_ratio"] == 0.9082
    assert gate_data["metrics"]["maximum_retention_ratio_threshold"] == 0.98


def test_stage1_gate_still_fails_after_retries_when_long_form_output_is_too_short():
    with pytest.raises(
        RuntimeError,
        match="minimum_retention_ratio=0.080, maximum_retention_ratio=0.980",
    ):
        youtube2blog_graph_runner._evaluate_stage1_gate(
            cleaned_chars=1_500,
            original_chars=40_000,
            retry_count=youtube2blog_graph_runner.Y2B_STAGE1_REPAIR_MAX_RETRIES,
        )


def test_stage1_gate_still_fails_after_retries_when_long_form_output_is_unchanged():
    with pytest.raises(RuntimeError, match="maximum_retention_ratio=0.980"):
        youtube2blog_graph_runner._evaluate_stage1_gate(
            cleaned_chars=39_600,
            original_chars=40_000,
            retry_count=youtube2blog_graph_runner.Y2B_STAGE1_REPAIR_MAX_RETRIES,
        )
