import logging

import pytest

from app.shared import writer_invocation as writer_models
from app.features.images import (
    alt_text_generator,
    edit_prompt_builder,
    insert_prompt_builder,
    scene_describer,
    subject_describer,
)
from utils import llm_client


class _FakeLLM:
    model_name = "claude-test"

    def invoke(self, prompt: str) -> str:
        assert prompt == "write"
        return " result "


def test_writer_model_uses_shared_llm_factory(monkeypatch):
    captured = {}

    def fake_get_vertex_llm(**kwargs):
        captured.update(kwargs)
        return _FakeLLM()

    monkeypatch.setattr(
        writer_models, "get_vertex_llm", fake_get_vertex_llm, raising=False
    )

    # invoke_writer_model imports from utils at call time.
    monkeypatch.setattr("utils.get_vertex_llm", fake_get_vertex_llm)

    result = writer_models.invoke_writer_model(
        prompt="write",
        model_name="claude-test",
        max_tokens=123,
        temperature=0.2,
    )

    assert result.text == "result"
    assert result.model_name == "claude-test"
    assert captured == {
        "temperature": 0.2,
        "max_tokens": 123,
        "model_name": "claude-test",
    }


def test_shared_llm_factory_never_uses_small_generation_budget(monkeypatch):
    captured = {}

    class _VertexLLM:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(llm_client, "VertexAI", _VertexLLM)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
    # The budget floor must hold on the Anthropic branch too, which is only
    # reachable while Claude is switched on (it is off by default: no funds).
    monkeypatch.setenv("ANTHROPIC_MODELS_ENABLED", "1")

    claude = llm_client.get_vertex_llm(model_name="claude-sonnet-5", max_tokens=123)
    llm_client.get_vertex_llm(model_name="gemini-2.5-flash-lite", max_tokens=456)

    assert claude.max_tokens == llm_client.MIN_GENERATION_MAX_TOKENS
    assert captured["max_tokens"] == llm_client.MIN_GENERATION_MAX_TOKENS


def test_claude_models_are_substituted_with_google_by_default(monkeypatch):
    """With no Claude path on, claude-* must not reach a Claude transport."""
    monkeypatch.delenv("ANTHROPIC_MODELS_ENABLED", raising=False)
    monkeypatch.delenv("CLAUDE_SUBSCRIPTION_MODELS_ENABLED", raising=False)

    assert llm_client.anthropic_models_enabled() is False
    assert llm_client.claude_provider() == llm_client.CLAUDE_PROVIDER_NONE
    assert llm_client.claude_models_reachable() is False
    assert llm_client.resolve_effective_model("claude-opus-4-8") == (
        "gemini-2.5-flash"
    )
    assert llm_client.resolve_effective_model("claude-sonnet-5") == "gemini-2.5-flash"
    # An unmapped Claude name still must not fall through to Anthropic.
    assert not llm_client.is_claude_model(
        llm_client.resolve_effective_model("claude-something-new")
    )
    # Non-Claude names are untouched.
    assert llm_client.resolve_effective_model("gemini-2.5-flash") == "gemini-2.5-flash"


def test_claude_models_pass_through_when_switched_back_on(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_MODELS_ENABLED", "1")

    assert llm_client.anthropic_models_enabled() is True
    assert llm_client.resolve_effective_model("claude-opus-4-8") == "claude-opus-4-8"


def test_subscription_switch_reaches_claude_without_the_api_key_switch(monkeypatch):
    """The two switches are independent, and the new one alone is enough.

    Asserted through the switch rather than through an absent API key: an
    environment that happens to carry no credentials is not evidence about
    routing, and a suite that populates one elsewhere would flip the result.
    """
    monkeypatch.delenv("ANTHROPIC_MODELS_ENABLED", raising=False)
    monkeypatch.setenv("CLAUDE_SUBSCRIPTION_MODELS_ENABLED", "1")

    assert llm_client.anthropic_models_enabled() is False
    assert llm_client.claude_subscription_models_enabled() is True
    assert llm_client.claude_provider() == llm_client.CLAUDE_PROVIDER_SUBSCRIPTION_CLI
    assert llm_client.claude_models_reachable() is True
    assert llm_client.resolve_effective_model("claude-opus-4-8") == "claude-opus-4-8"
    # An unmapped Claude name is no longer rewritten either -- the transport
    # decides what it can serve, not the substitution table.
    assert llm_client.resolve_effective_model("claude-opus-5") == "claude-opus-5"
    assert llm_client.resolve_effective_model("gemini-2.5-flash") == "gemini-2.5-flash"


def test_api_key_path_wins_when_both_claude_switches_are_on(monkeypatch):
    """Turning the subscription on must not re-point an already-funded machine."""
    monkeypatch.setenv("ANTHROPIC_MODELS_ENABLED", "1")
    monkeypatch.setenv("CLAUDE_SUBSCRIPTION_MODELS_ENABLED", "1")

    assert llm_client.claude_provider() == llm_client.CLAUDE_PROVIDER_ANTHROPIC_API


def test_subscription_switch_ignores_non_truthy_values(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_MODELS_ENABLED", raising=False)
    for value in ("", "  ", "0", "false", "no", "off", "maybe"):
        monkeypatch.setenv("CLAUDE_SUBSCRIPTION_MODELS_ENABLED", value)
        assert llm_client.claude_subscription_models_enabled() is False
        assert llm_client.claude_provider() == llm_client.CLAUDE_PROVIDER_NONE


def test_get_vertex_llm_routes_disabled_claude_to_vertex(monkeypatch):
    captured = {}

    class _VertexLLM:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(llm_client, "VertexAI", _VertexLLM)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
    monkeypatch.delenv("ANTHROPIC_MODELS_ENABLED", raising=False)
    monkeypatch.delenv("CLAUDE_SUBSCRIPTION_MODELS_ENABLED", raising=False)

    llm = llm_client.get_vertex_llm(model_name="claude-sonnet-5", max_tokens=1024)

    assert not isinstance(llm, llm_client.ClaudeTextLLM)
    assert captured["model_name"] == "gemini-2.5-flash"


def test_gemini_tool_schema_drops_unsupported_keywords():
    cleaned = llm_client._gemini_tool_schema(
        {
            "type": "object",
            "additionalProperties": False,
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "properties": {
                "seoTitle": {"type": "string", "description": "Title"},
                "tags": {
                    "type": "array",
                    "items": {"type": "string", "additionalProperties": False},
                },
            },
            "required": ["seoTitle"],
        }
    )

    assert cleaned == {
        "type": "object",
        "properties": {
            "seoTitle": {"type": "string", "description": "Title"},
            "tags": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["seoTitle"],
    }


def test_gemini_tool_schema_drops_benign_keywords_quietly(caplog):
    with caplog.at_level(logging.WARNING, logger=llm_client.__name__):
        llm_client._gemini_tool_schema(
            {
                "type": "object",
                "title": "Patch",
                "additionalProperties": False,
                "properties": {"a": {"type": "string", "examples": ["x"]}},
            }
        )

    assert caplog.records == []


def test_gemini_tool_schema_reports_dropped_constraints(caplog):
    with caplog.at_level(logging.WARNING, logger=llm_client.__name__):
        cleaned = llm_client._gemini_tool_schema(
            {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "seoTitle": {"type": "string", "maxLength": 60},
                    "target": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "tags": {
                        "type": "array",
                        "items": {"$ref": "#/$defs/tag"},
                    },
                },
            },
            tool_name="emit_seo_patch",
        )

    # The rejected keywords still have to go -- Gemini would 400 otherwise.
    assert cleaned == {
        "type": "object",
        "properties": {
            "seoTitle": {"type": "string"},
            "target": {},
            "tags": {"type": "array", "items": {}},
        },
    }

    assert len(caplog.records) == 1
    message = caplog.records[0].getMessage()
    assert "emit_seo_patch" in message
    assert "properties.seoTitle.maxLength" in message
    assert "properties.target.anyOf" in message
    assert "properties.tags.items.$ref" in message
    # additionalProperties is expected collateral, not a reportable loss.
    assert "additionalProperties" not in message


def test_structured_tool_call_keeps_requested_small_budget(monkeypatch):
    captured = {}

    class _ToolBlock:
        type = "tool_use"
        name = "emit_patch"
        input = {"seoTitle": "Two Days in Lima"}

    class _Message:
        content = [_ToolBlock()]
        model = "claude-opus-4-8"

    class _Messages:
        def create(self, **kwargs):
            captured.update(kwargs)
            return _Message()

    class _Client:
        messages = _Messages()

    monkeypatch.setattr(
        llm_client,
        "_get_anthropic_client",
        lambda **_kwargs: _Client(),
    )

    payload, _model = llm_client.invoke_anthropic_structured_tool(
        prompt="Generate SEO metadata",
        model_name="claude-opus-4-8",
        tool_name="emit_patch",
        tool_description="Emit SEO metadata",
        input_schema={"type": "object"},
        max_tokens=4096,
    )

    assert payload == {"seoTitle": "Two Days in Lima"}
    assert captured["max_tokens"] == 4096


def test_claude_writer_reserves_budget_for_text_and_reports_empty_metadata(
    monkeypatch,
):
    captured = {}

    class _Usage:
        output_tokens = 64000

    class _Message:
        content = []
        stop_reason = "max_tokens"
        usage = _Usage()

    class _Stream:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def get_final_message(self):
            return _Message()

    class _Messages:
        def stream(self, **kwargs):
            captured.update(kwargs)
            return _Stream()

    class _Client:
        messages = _Messages()

    monkeypatch.setattr(
        llm_client,
        "_get_anthropic_client",
        lambda **_kwargs: _Client(),
    )

    llm = llm_client.ClaudeTextLLM(
        model_name="claude-sonnet-5",
        max_tokens=llm_client.MIN_GENERATION_MAX_TOKENS,
    )

    with pytest.raises(RuntimeError, match="stop_reason='max_tokens'"):
        llm.invoke("write full article")

    assert captured["max_tokens"] == llm_client.MIN_GENERATION_MAX_TOKENS
    assert "thinking" not in captured


@pytest.mark.parametrize(
    ("module", "call", "expected_model"),
    [
        (
            alt_text_generator,
            lambda: alt_text_generator._generate_sync(b"image", "image/png", "focus"),
            "gemini-2.5-flash-lite",
        ),
        (
            scene_describer,
            lambda: scene_describer._describe_sync(b"image", "image/png"),
            "gemini-2.5-flash",
        ),
        (
            subject_describer,
            lambda: subject_describer._describe_sync(b"image", "image/png"),
            "gemini-2.5-flash",
        ),
        (
            edit_prompt_builder,
            lambda: edit_prompt_builder._build_sync(
                b"image",
                "image/png",
                "scene",
                "make it brighter",
            ),
            "gemini-2.5-flash",
        ),
    ],
)
def test_image_text_helpers_use_shared_multimodal_invoker(
    monkeypatch,
    module,
    call,
    expected_model,
):
    captured = {}

    def fake_part_from_data(*, data: bytes, mime_type: str):
        return {"data": data, "mime_type": mime_type}

    def fake_invoke(parts, *, model_name: str):
        captured["parts"] = parts
        captured["model_name"] = model_name
        return '"generated text"'

    monkeypatch.setattr(module, "vertex_part_from_data", fake_part_from_data)
    monkeypatch.setattr(module, "invoke_vertex_multimodal_text", fake_invoke)

    assert call() == "generated text"
    assert captured["model_name"] == expected_model
    assert captured["parts"][0] == {"data": b"image", "mime_type": "image/png"}
    assert isinstance(captured["parts"][-1], str)


def test_insert_prompt_uses_shared_multimodal_invoker(monkeypatch):
    captured = {}

    def fake_part_from_data(*, data: bytes, mime_type: str):
        return {"data": data, "mime_type": mime_type}

    def fake_invoke(parts, *, model_name: str):
        captured["parts"] = parts
        captured["model_name"] = model_name
        return "'insert prompt'"

    monkeypatch.setattr(
        insert_prompt_builder, "vertex_part_from_data", fake_part_from_data
    )
    monkeypatch.setattr(
        insert_prompt_builder, "invoke_vertex_multimodal_text", fake_invoke
    )

    result = insert_prompt_builder._build_sync(
        b"main",
        "image/jpeg",
        "main scene",
        [
            {
                "image_bytes": b"insert",
                "content_type": "image/png",
                "description": "subject",
            }
        ],
        "place left",
    )

    assert result == "insert prompt"
    assert captured["model_name"] == "gemini-2.5-flash"
    assert captured["parts"][0] == {"data": b"main", "mime_type": "image/jpeg"}
    assert captured["parts"][1] == {"data": b"insert", "mime_type": "image/png"}
    assert isinstance(captured["parts"][-1], str)
