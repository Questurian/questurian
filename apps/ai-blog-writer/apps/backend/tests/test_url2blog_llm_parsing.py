from app.features.url2blog.llm import invocation as llm_invocation
from app.features.url2blog.llm.parsing import (
    _extract_json_from_response,
    _json_parse_tracking_scope,
)


def test_extract_json_from_response_handles_unclosed_markdown_fence():
    raw_response = (
        "```json\n"
        '{\n'
        '  "classification": "When to Visit Article",\n'
        '  "confidence": 1.0,\n'
        '  "reasoning": "Editorial intent match."\n'
        "}"
    )

    parsed, parse_error = _extract_json_from_response(raw_response)

    assert parse_error is None
    assert parsed is not None
    assert parsed["classification"] == "When to Visit Article"
    assert parsed["confidence"] == 1.0


def test_extract_json_from_response_repairs_unterminated_string():
    raw_response = (
        "```json\n"
        "{\n"
        '  "title": "Sample headline",\n'
        '  "content": "This article compares shoulder season weather and crowds'
    )

    parsed, parse_error = _extract_json_from_response(raw_response)

    assert parse_error is None
    assert parsed is not None
    assert parsed["title"] == "Sample headline"
    assert parsed["content"].endswith("crowds")


def test_extract_json_from_response_repairs_raw_newline_in_string():
    raw_response = (
        "{\n"
        '  "title": "Sample headline",\n'
        '  "content": "Line one\n'
        'Line two",\n'
        '  "summary": "ok"\n'
        "}"
    )

    parsed, parse_error = _extract_json_from_response(raw_response)

    assert parse_error is None
    assert parsed is not None
    assert parsed["title"] == "Sample headline"
    assert parsed["summary"] == "ok"
    assert "Line one" in parsed["content"]
    assert "Line two" in parsed["content"]


def test_extract_json_from_response_repairs_unescaped_quote_in_string():
    raw_response = (
        "{\n"
        '  "title": "Sample headline",\n'
        '  "content": "He said "hello" loudly to the group."\n'
        "}"
    )

    parsed, parse_error = _extract_json_from_response(raw_response)

    assert parse_error is None
    assert parsed is not None
    assert parsed["title"] == "Sample headline"
    assert parsed["content"] == 'He said "hello" loudly to the group.'


def test_invoke_json_llm_tracks_parse_recovery_when_truncated_repair_is_disabled(
    monkeypatch,
):
    responses = iter(
        [
            (
                '{"classification":"When to Visit Article",'
                '"confidence":1.0,'
                '"reasoning":"The article intent",}'
            ),
            (
                '{'
                '"classification":"When to Visit Article",'
                '"confidence":1.0,'
                '"reasoning":"Editorial intent fit."'
                '}'
            ),
        ]
    )

    class StubLLM:
        def invoke(
            self, prompt: str
        ) -> str:  # noqa: ARG002 - prompt asserted by caller
            return next(responses)

    monkeypatch.setattr(
        llm_invocation,
        "get_vertex_llm",
        lambda *args, **kwargs: StubLLM(),  # noqa: ARG005 - signature parity
    )

    metrics = {
        "total_parse_failures": 0,
        "recovered_calls": 0,
        "recovered_parse_failures": 0,
        "failures_by_stage": {},
    }

    with _json_parse_tracking_scope(metrics, "unit_test_stage"):
        parsed, _ = llm_invocation._invoke_json_llm(
            prompt="Return strict JSON.",
            max_tokens=256,
            temperature=0.1,
            model_name="gemini-2.5-flash",
            allow_truncated_repair=False,
        )

    assert parsed["classification"] == "When to Visit Article"
    assert metrics["total_parse_failures"] == 1
    assert metrics["recovered_calls"] == 1
    assert metrics["recovered_parse_failures"] == 1
    assert metrics["failures_by_stage"]["unit_test_stage"] == 1


def test_invoke_json_llm_can_disable_truncated_repair(monkeypatch):
    responses = iter(
        [
            (
                "```json\n"
                '{\n'
                '  "classification": "When to Visit Article",\n'
                '  "confidence": 1.0,\n'
                '  "reasoning": "The article intent'
            ),
            (
                '{'
                '"classification":"When to Visit Article",'
                '"confidence":1.0,'
                '"reasoning":"Editorial intent fit."'
                '}'
            ),
        ]
    )

    class StubLLM:
        def invoke(
            self, prompt: str
        ) -> str:  # noqa: ARG002 - prompt asserted by caller
            return next(responses)

    monkeypatch.setattr(
        llm_invocation,
        "get_vertex_llm",
        lambda *args, **kwargs: StubLLM(),  # noqa: ARG005 - signature parity
    )

    metrics = {
        "total_parse_failures": 0,
        "recovered_calls": 0,
        "recovered_parse_failures": 0,
        "failures_by_stage": {},
    }

    with _json_parse_tracking_scope(metrics, "unit_test_stage"):
        parsed, _ = llm_invocation._invoke_json_llm(
            prompt="Return strict JSON.",
            max_tokens=256,
            temperature=0.1,
            model_name="gemini-2.5-flash",
            allow_truncated_repair=False,
        )

    assert parsed["classification"] == "When to Visit Article"
    assert metrics["total_parse_failures"] == 1
    assert metrics["recovered_calls"] == 1
    assert metrics["recovered_parse_failures"] == 1
    assert metrics["failures_by_stage"]["unit_test_stage"] == 1
