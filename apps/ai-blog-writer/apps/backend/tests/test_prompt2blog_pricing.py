from app.features.prompt2blog.pricing import (
    Prompt2BlogTokenUsageTracker,
    normalize_token_usage,
)
from app.features.prompt2blog import llm as prompt2blog_llm
from app.features.prompt2blog.dependencies import DefaultPrompt2BlogLLM
from utils import gemini_tools


def test_normalize_token_usage_accepts_langchain_and_google_shapes():
    assert normalize_token_usage(
        {
            "input_tokens": 120,
            "output_tokens": 30,
            "total_tokens": 150,
            "input_token_details": {"cache_read": 20},
        }
    ) == {
        "input_tokens": 120,
        "output_tokens": 30,
        "reasoning_tokens": 0,
        "cached_input_tokens": 20,
        "total_tokens": 150,
    }
    assert normalize_token_usage(
        {
            "prompt_token_count": 80,
            "candidates_token_count": 20,
            "thoughts_token_count": 5,
            "cached_content_token_count": 10,
            "total_token_count": 105,
        }
    ) == {
        "input_tokens": 80,
        "output_tokens": 25,
        "reasoning_tokens": 5,
        "cached_input_tokens": 10,
        "total_tokens": 105,
    }


def test_langchain_reasoning_tokens_are_billed_as_output():
    """LangChain's Gemini adapter sets `output_tokens` to
    `candidates_token_count` and files thinking tokens under
    `output_token_details["reasoning"]`. Reading `output_tokens` alone charged
    the run for the visible answer and nothing for the reasoning."""
    assert normalize_token_usage(
        {
            "input_tokens": 5_000,
            "output_tokens": 40,
            "total_tokens": 9_040,
            "input_token_details": {"cache_read": 0},
            "output_token_details": {"reasoning": 4_000},
        }
    ) == {
        "input_tokens": 5_000,
        "output_tokens": 4_040,
        "reasoning_tokens": 4_000,
        "cached_input_tokens": 0,
        "total_tokens": 9_040,
    }


def test_reasoning_tokens_are_not_counted_twice():
    """Raw Vertex metadata carries thinking in `thoughts_token_count`, which
    `candidates_token_count` excludes. Both shapes must land on the same
    number rather than one of them double-adding."""
    langchain_shape = normalize_token_usage(
        {
            "input_tokens": 80,
            "output_tokens": 20,
            "total_tokens": 105,
            "output_token_details": {"reasoning": 5},
        }
    )
    raw_shape = normalize_token_usage(
        {
            "prompt_token_count": 80,
            "candidates_token_count": 20,
            "thoughts_token_count": 5,
            "total_token_count": 105,
        }
    )

    assert langchain_shape["output_tokens"] == 25
    assert raw_shape["output_tokens"] == 25
    assert langchain_shape["reasoning_tokens"] == raw_shape["reasoning_tokens"] == 5


def test_usage_tracker_aggregates_models_and_prices_cached_tokens():
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.record(
        "gemini-3.7-flash",
        {
            "input_tokens": 100_000,
            "output_tokens": 10_000,
            "total_tokens": 110_000,
            "input_token_details": {"cache_read": 20_000},
        },
    )
    tracker.record(
        "gemini-3.1-pro-preview",
        {"input_tokens": 20_000, "output_tokens": 5_000, "total_tokens": 25_000},
    )

    summary = tracker.summary(
        stack_id="editorial-premium",
        worker_model="gemini-3.7-flash",
        writing_model="gemini-3.1-pro-preview",
        audit_model="gemini-3.7-flash",
    )

    assert summary["total_tokens"] == 135_000
    assert summary["input_tokens"] == 120_000
    assert summary["output_tokens"] == 15_000
    assert summary["cached_input_tokens"] == 20_000
    assert summary["measurement_status"] == "complete"
    assert summary["estimated_cost_usd"] == 0.199


def test_usage_tracker_marks_missing_usage_as_partial():
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.record("gemini-3.7-flash", None)
    tracker.record(
        "gemini-3.7-flash",
        {"input_tokens": 100, "output_tokens": 10, "total_tokens": 110},
    )

    summary = tracker.summary(
        stack_id="balanced",
        worker_model="gemini-3.7-flash",
        writing_model="gemini-3.7-flash",
        audit_model="gemini-3.7-flash",
    )

    assert summary["successful_calls"] == 2
    assert summary["measured_calls"] == 1
    assert summary["measurement_status"] == "partial"


def test_pro_cost_uses_large_context_rate_per_call():
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.record(
        "gemini-3.1-pro-preview",
        {
            "input_tokens": 250_000,
            "output_tokens": 10_000,
            "total_tokens": 260_000,
        },
    )

    summary = tracker.summary(
        stack_id="maximum-quality",
        worker_model="gemini-3.1-pro-preview",
        writing_model="gemini-3.1-pro-preview",
        audit_model="gemini-3.1-pro-preview",
    )

    assert summary["estimated_cost_usd"] == 1.18


def test_gemini_chat_wrapper_preserves_response_usage(monkeypatch):
    class FakeMessage:
        content = "Generated article"
        usage_metadata = {
            "input_tokens": 321,
            "output_tokens": 123,
            "total_tokens": 444,
        }
        response_metadata = {}

    class FakeChatVertexAI:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def invoke(self, prompt):  # noqa: ANN001
            assert prompt == "Write"
            return FakeMessage()

    monkeypatch.setattr(gemini_tools, "ChatVertexAI", FakeChatVertexAI)
    llm = gemini_tools.Gemini3ChatTextLLM(
        model_name="gemini-3.7-flash",
        max_tokens=2048,
        project="project",
    )

    assert llm.invoke("Write") == "Generated article"
    assert llm.last_usage_metadata == FakeMessage.usage_metadata


def test_default_prompt2blog_llm_records_each_successful_call(monkeypatch):
    class FakeLLM:
        model_name = "gemini-3.7-flash"
        last_usage_metadata = {
            "input_tokens": 400,
            "output_tokens": 100,
            "total_tokens": 500,
        }

        def invoke(self, prompt):  # noqa: ANN001
            assert prompt == "Write"
            return "Article"

    monkeypatch.setattr(
        prompt2blog_llm,
        "get_vertex_llm",
        lambda **kwargs: FakeLLM(),
    )
    llm = DefaultPrompt2BlogLLM()

    assert llm.invoke_text(
        prompt="Write",
        max_tokens=2048,
        temperature=0.2,
        model_name="gemini-3.7-flash",
    ) == "Article"
    summary = llm.usage_summary(
        stack_id="balanced",
        worker_model="gemini-3.7-flash",
        writing_model="gemini-3.7-flash",
        audit_model="gemini-3.7-flash",
    )
    assert summary["measured_calls"] == 1
    assert summary["total_tokens"] == 500
    assert summary["estimated_cost_usd"] == 0.000675
