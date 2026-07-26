import pytest

from app.features.url2blog.llm import invocation as llm_invocation


def test_invoke_markdown_long_output_accepts_markdown(monkeypatch):
    class _FakeLLM:
        def invoke(self, prompt):
            del prompt
            return "## Overview\n\nExpanded body content."

    monkeypatch.setattr(
        llm_invocation,
        "get_vertex_llm",
        lambda *args, **kwargs: _FakeLLM(),
    )

    result = llm_invocation._invoke_markdown_long_output(
        prompt="Write markdown",
        stage_name="guideline_rewrite_initial",
        model_name="gemini-2.5-flash",
        temperature=0.1,
        max_tokens=1024,
        fallback_content="Fallback body",
        parse_metrics={},
        legacy_json_prompt="legacy json prompt",
        legacy_json_stage_name="legacy_json_stage",
        legacy_content_key="improved_content",
    )

    assert result["transport"] == "markdown"
    assert "## Overview" in result["content"]
    assert "Expanded body content." in result["content"]


def test_invoke_markdown_long_output_falls_back_to_legacy_json(monkeypatch):
    monkeypatch.setattr(
        llm_invocation,
        "get_vertex_llm",
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        llm_invocation,
        "_invoke_json_llm_tracked",
        lambda **kwargs: (
            {
                "improved_title": "Fallback generated title",
                "improved_content": "## Overview\n\nRecovered body from legacy JSON path.",
            },
            '{"improved_title":"Fallback generated title"}',
        ),
    )

    result = llm_invocation._invoke_markdown_long_output(
        prompt="Write markdown",
        stage_name="fact_repair",
        model_name="gemini-2.5-flash",
        temperature=0.1,
        max_tokens=1024,
        fallback_content="Fallback body",
        parse_metrics={},
        legacy_json_prompt="legacy json prompt",
        legacy_json_stage_name="legacy_json_stage",
        legacy_content_key="improved_content",
        legacy_title_key="improved_title",
    )

    assert result["transport"] == "json_fallback"
    assert result["fallback_title"] == "Fallback generated title"
    assert "Recovered body from legacy JSON path." in result["content"]


def test_invoke_markdown_long_output_raises_when_legacy_json_content_missing(
    monkeypatch,
):
    monkeypatch.setattr(
        llm_invocation,
        "get_vertex_llm",
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        llm_invocation,
        "_invoke_json_llm_tracked",
        lambda **kwargs: (
            {"improved_title": "Fallback generated title"},
            '{"improved_title":"Fallback generated title"}',
        ),
    )

    with pytest.raises(Exception) as exc_info:  # HTTPException from FastAPI
        llm_invocation._invoke_markdown_long_output(
            prompt="Write markdown",
            stage_name="guideline_rewrite_initial",
            model_name="gemini-2.5-flash",
            temperature=0.1,
            max_tokens=1024,
            fallback_content="Fallback body",
            parse_metrics={},
            legacy_json_prompt="legacy json prompt",
            legacy_json_stage_name="legacy_json_stage",
            legacy_content_key="improved_content",
            legacy_title_key="improved_title",
        )

    exc = exc_info.value
    assert getattr(exc, "status_code", None) == 500
    assert "did not return 'improved_content'" in str(getattr(exc, "detail", exc))


def test_invoke_markdown_long_output_allows_source_fallback_with_flag(monkeypatch):
    monkeypatch.setenv("URL2BLOG_LONG_OUTPUT_ALLOW_SOURCE_FALLBACK", "1")
    monkeypatch.setattr(
        llm_invocation,
        "get_vertex_llm",
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        llm_invocation,
        "_invoke_json_llm_tracked",
        lambda **kwargs: (
            {"improved_title": "Fallback generated title"},
            '{"improved_title":"Fallback generated title"}',
        ),
    )

    result = llm_invocation._invoke_markdown_long_output(
        prompt="Write markdown",
        stage_name="guideline_rewrite_initial",
        model_name="gemini-2.5-flash",
        temperature=0.1,
        max_tokens=1024,
        fallback_content="Fallback body",
        parse_metrics={},
        legacy_json_prompt="legacy json prompt",
        legacy_json_stage_name="legacy_json_stage",
        legacy_content_key="improved_content",
        legacy_title_key="improved_title",
    )

    assert result["transport"] == "json_fallback"
    assert result["content"].strip()
    assert "Fallback body" in result["content"]


def test_invoke_title_generation_returns_fallback_when_llm_unavailable(monkeypatch):
    monkeypatch.setattr(
        llm_invocation,
        "get_vertex_llm",
        lambda *args, **kwargs: None,
    )

    title, raw = llm_invocation._invoke_title_generation(
        prompt="Generate a title",
        model_name="gemini-2.5-flash",
        fallback_title="Existing fallback title",
    )

    assert title == "Existing fallback title"
    assert raw == ""


def test_invoke_title_generation_sanitizes_markdown_heading(monkeypatch):
    class _FakeTitleLLM:
        def invoke(self, prompt):
            del prompt
            return "###  Better Comparison Title  \n\nExtra line"

    monkeypatch.setattr(
        llm_invocation,
        "get_vertex_llm",
        lambda *args, **kwargs: _FakeTitleLLM(),
    )

    title, raw = llm_invocation._invoke_title_generation(
        prompt="Generate a title",
        model_name="gemini-2.5-flash",
        fallback_title="Existing fallback title",
    )

    assert title == "Better Comparison Title"
    assert "Better Comparison Title" in raw
