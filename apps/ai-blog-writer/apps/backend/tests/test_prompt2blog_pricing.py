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

    assert (
        llm.invoke_text(
            prompt="Write",
            max_tokens=2048,
            temperature=0.2,
            model_name="gemini-3.7-flash",
        )
        == "Article"
    )
    summary = llm.usage_summary(
        stack_id="balanced",
        worker_model="gemini-3.7-flash",
        writing_model="gemini-3.7-flash",
        audit_model="gemini-3.7-flash",
    )
    assert summary["measured_calls"] == 1
    assert summary["total_tokens"] == 500
    assert summary["estimated_cost_usd"] == 0.000675


def test_a_run_with_no_reported_usage_is_unavailable_not_free():
    """Providers that return no usage metadata must not read as a zero-cost
    run. Previously only the pipeline contract test covered this."""
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.record("gemini-3.7-flash", None)
    tracker.record("gemini-3.7-flash", {})

    summary = tracker.summary(
        stack_id="balanced",
        worker_model="gemini-3.7-flash",
        writing_model="gemini-3.7-flash",
        audit_model="gemini-3.7-flash",
    )

    assert summary["measurement_status"] == "unavailable"
    assert summary["successful_calls"] == 2
    assert summary["measured_calls"] == 0
    assert summary["unmetered_calls"] == 2
    assert summary["by_model"] == []
    # The two calls happened, so the ledger shows them. They spent an unknown
    # amount, not nothing -- which is what `measurement_status` says.
    assert [row["stage"] for row in summary["by_stage"]] == ["unattributed"]
    assert summary["by_stage"][0]["calls"] == 2
    assert summary["by_stage"][0]["total_tokens"] == 0


def test_anthropic_cache_reads_are_visible_instead_of_being_clamped_away():
    """Anthropic and Google report cached input in different shapes.

    Google nests the cached share under `input_token_details` and counts
    `input_tokens` gross. Anthropic reports the two cache figures flat and
    alongside, and its `input_tokens` counts only the uncached remainder.
    Reading only the nested shape left every Claude call looking as though it
    had cached nothing -- and the clamp at the end of normalize_token_usage
    then discarded the figure anyway, because a net input count is smaller than
    the cache read it excludes.
    """
    usage = normalize_token_usage(
        {
            "input_tokens": 10,
            "output_tokens": 503,
            "cache_read_input_tokens": 8741,
            "cache_creation_input_tokens": 2729,
        }
    )

    # The prompt really was 11480 tokens; 10 was only the part not served from
    # cache, and reporting that as the input count understated the call by 1000x.
    assert usage["input_tokens"] == 11_480
    assert usage["cached_input_tokens"] == 8_741
    assert usage["output_tokens"] == 503


def test_google_shaped_cache_reporting_is_unchanged():
    usage = normalize_token_usage(
        {
            "input_tokens": 11_480,
            "output_tokens": 503,
            "input_token_details": {"cache_read": 8_741},
        }
    )

    assert usage["input_tokens"] == 11_480
    assert usage["cached_input_tokens"] == 8_741


def test_a_price_the_provider_measured_beats_the_rate_table():
    """Claude has no dollar-per-million rate and cannot have one.

    Without this its calls landed in `unpriced_calls`, which made the whole run
    read as partially priced and blanked the run's cost even though the
    transport had reported an exact figure for every call it made.
    """
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.record(
        "claude-sonnet-5",
        {"input_tokens": 10, "output_tokens": 503, "measured_cost_usd": 0.0099},
    )
    tracker.record(
        "claude-sonnet-5",
        {"input_tokens": 12, "output_tokens": 640, "measured_cost_usd": 0.0101},
    )

    summary = tracker.summary(
        stack_id="opus-balanced",
        worker_model="gemini-3.7-flash",
        writing_model="claude-sonnet-5",
        audit_model="gemini-3.7-flash",
    )

    assert summary["measurement_status"] == "complete"
    assert summary["estimated_cost_usd"] == 0.02
    row = summary["by_model"][0]
    assert row["cost_basis"] == "measured"
    assert row["estimated_cost_usd"] == 0.02
    # The number is real and comparable between stacks. It is not a charge, and
    # the note has to say so.
    assert "not a charge" in summary["pricing_note"]


def test_a_mixed_run_prices_each_model_by_its_own_basis():
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.record(
        "claude-sonnet-5",
        {"input_tokens": 10, "output_tokens": 503, "measured_cost_usd": 0.0099},
    )
    tracker.record("gemini-3.7-flash", {"input_tokens": 1_000, "output_tokens": 200})

    summary = tracker.summary(
        stack_id="sonnet-balanced",
        worker_model="gemini-3.7-flash",
        writing_model="claude-sonnet-5",
        audit_model="gemini-3.7-flash",
    )

    bases = {row["model"]: row["cost_basis"] for row in summary["by_model"]}
    assert bases == {
        "claude-sonnet-5": "measured",
        "gemini-3.7-flash": "rate-table",
    }
    assert summary["measurement_status"] == "complete"
    assert summary["estimated_cost_usd"] == round(0.0099 + 0.00150, 6)


def test_a_gemini_only_run_keeps_the_rate_table_note_alone():
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.record("gemini-3.7-flash", {"input_tokens": 1_000, "output_tokens": 200})

    summary = tracker.summary(
        stack_id="balanced",
        worker_model="gemini-3.7-flash",
        writing_model="gemini-3.7-flash",
        audit_model="gemini-3.7-flash",
    )

    assert "not a charge" not in summary["pricing_note"]


def test_a_nonsense_measured_cost_falls_back_to_the_rate_table():
    tracker = Prompt2BlogTokenUsageTracker()
    for bad in (True, "0.01", None, -1):
        tracker.record(
            "gemini-3.7-flash",
            {"input_tokens": 1_000, "output_tokens": 200, "measured_cost_usd": bad},
        )

    summary = tracker.summary(
        stack_id="balanced",
        worker_model="gemini-3.7-flash",
        writing_model="gemini-3.7-flash",
        audit_model="gemini-3.7-flash",
    )

    assert summary["by_model"][0]["cost_basis"] == "rate-table"


def test_a_provider_reported_price_reaches_the_tracker(monkeypatch):
    """End to end through the seam, not just the tracker in isolation.

    The subscription CLI is the only provider that reports a per-call price,
    and it arrives on the LLM object rather than in the usage metadata, so the
    invocation seam has to fold the two together. Without that the figure
    exists and never reaches the receipt.
    """

    class FakeCliLLM:
        model_name = "claude-sonnet-5"
        last_usage_metadata = {
            "input_tokens": 10,
            "output_tokens": 503,
            "cache_read_input_tokens": 8_741,
            "cache_creation_input_tokens": 2_729,
        }
        last_cost_usd = 0.0099

        def invoke(self, prompt):  # noqa: ANN001
            return "Article"

    monkeypatch.setattr(
        prompt2blog_llm,
        "get_vertex_llm",
        lambda **kwargs: FakeCliLLM(),
    )
    llm = DefaultPrompt2BlogLLM()
    llm.invoke_text(
        prompt="Write",
        max_tokens=2048,
        temperature=0.2,
        model_name="claude-sonnet-5",
    )

    summary = llm.usage_summary(
        stack_id="sonnet-balanced",
        worker_model="gemini-3.7-flash",
        writing_model="claude-sonnet-5",
        audit_model="gemini-3.7-flash",
    )

    assert summary["estimated_cost_usd"] == 0.0099
    assert summary["by_model"][0]["cost_basis"] == "measured"
    # The cache read is visible rather than clamped away, which is the whole
    # reason the fixed prompt prefix was worth designing for.
    assert summary["cached_input_tokens"] == 8_741
    assert summary["input_tokens"] == 11_480


def test_a_provider_without_a_price_is_unaffected_by_the_fold(monkeypatch):
    class FakeLLM:
        model_name = "gemini-3.7-flash"
        last_usage_metadata = {"input_tokens": 400, "output_tokens": 100}

        def invoke(self, prompt):  # noqa: ANN001
            return "Article"

    monkeypatch.setattr(prompt2blog_llm, "get_vertex_llm", lambda **kwargs: FakeLLM())
    llm = DefaultPrompt2BlogLLM()
    llm.invoke_text(
        prompt="Write",
        max_tokens=2048,
        temperature=0.2,
        model_name="gemini-3.7-flash",
    )

    summary = llm.usage_summary(
        stack_id="balanced",
        worker_model="gemini-3.7-flash",
        writing_model="gemini-3.7-flash",
        audit_model="gemini-3.7-flash",
    )

    assert summary["by_model"][0]["cost_basis"] == "rate-table"


def test_stage_rows_carry_the_price_of_the_stage():
    """`by_attempt` could always say what one attempt cost; `by_stage` could not.

    A stage that ran twice is exactly where the question gets asked, so the
    two repair calls have to add up rather than come back as a token count
    with no price beside it.
    """
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.begin_stage("stage_v3_repair")
    tracker.record(
        "claude-opus-5",
        {"input_tokens": 1_000, "output_tokens": 500, "measured_cost_usd": 0.40},
    )
    tracker.record(
        "claude-opus-5",
        {"input_tokens": 800, "output_tokens": 200, "measured_cost_usd": 0.25},
    )

    rows = {row["stage"]: row for row in tracker.ledger()["by_stage"]}

    assert rows["stage_v3_repair"]["cost_usd"] == 0.65
    assert rows["stage_v3_repair"]["calls"] == 2


def test_a_stage_holding_an_unpriced_call_reports_no_price():
    """A partial total reads as a total. Abstaining is the honest answer."""
    tracker = Prompt2BlogTokenUsageTracker()
    tracker.begin_stage("stage_v3_compose")
    tracker.record(
        "claude-opus-5",
        {"input_tokens": 1_000, "output_tokens": 500, "measured_cost_usd": 0.40},
    )
    tracker.record("mystery-model", {"input_tokens": 10, "output_tokens": 5})

    rows = {row["stage"]: row for row in tracker.ledger()["by_stage"]}

    assert rows["stage_v3_compose"]["cost_usd"] is None
    assert rows["stage_v3_compose"]["calls"] == 2
