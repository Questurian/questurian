"""``get_vertex_llm`` serving claude-* names on the subscription CLI.

This is the door Prompt2Blog uses. It calls ``utils.get_vertex_llm`` directly
and never passes through ``app.shared.writer_invocation``, so ``WRITER_PROVIDER``
does not reach it and none of the writer-invocation tests cover it.

The property under test is the same as the transport's: this is an *added*
provider. With no Claude switch on, nothing here may run.
"""

import json
import subprocess

import pytest

from app.features.claude_connection import cli_writer
from app.features.claude_connection import status as status_module
from utils import llm_client

CLI_PATH = "/fake/bin/claude"

TEXT_JSON = json.dumps(
    {
        "result": "Barranco after dark.",
        "is_error": False,
        "total_cost_usd": 0.0099,
        "usage": {
            "input_tokens": 10,
            "output_tokens": 503,
            "cache_read_input_tokens": 8741,
            "cache_creation_input_tokens": 2729,
        },
        "modelUsage": {
            "claude-sonnet-5-20260101": {"canonicalModel": "claude-sonnet-5"}
        },
    }
)

STRUCTURED_JSON = json.dumps(
    {
        "result": '{"seoTitle":"Hidden Cafes in Barranco"}',
        "structured_output": {"seoTitle": "Hidden Cafes in Barranco"},
        "is_error": False,
        "stop_reason": "tool_use",
        "total_cost_usd": 0.0099,
        "usage": {"input_tokens": 10, "output_tokens": 430},
        "modelUsage": {"claude-opus-5-20260101": {"canonicalModel": "claude-opus-5"}},
    }
)

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["seoTitle"],
    "properties": {"seoTitle": {"type": "string"}},
}


@pytest.fixture(autouse=True)
def _no_claude_switches(monkeypatch):
    """Both switches off, and no inherited credential that could confuse either.

    Cleared explicitly rather than assumed absent: a suite that populates one
    elsewhere would otherwise decide the result of every test in this file.
    """
    monkeypatch.delenv(llm_client.ANTHROPIC_MODELS_ENABLED_ENV, raising=False)
    monkeypatch.delenv(llm_client.CLAUDE_SUBSCRIPTION_MODELS_ENABLED_ENV, raising=False)
    monkeypatch.delenv(cli_writer.WRITER_PROVIDER_ENV, raising=False)
    for name in status_module.API_BILLED_VARS:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def subscription_on(monkeypatch):
    monkeypatch.setenv(llm_client.CLAUDE_SUBSCRIPTION_MODELS_ENABLED_ENV, "1")


@pytest.fixture
def connected(monkeypatch):
    """A green connection, so the transport is willing to spend."""
    monkeypatch.setattr(status_module, "resolve_cli_path", lambda: CLI_PATH)
    monkeypatch.setattr(
        status_module,
        "_run_cli",
        lambda cli_path, args: subprocess.CompletedProcess(
            args=[cli_path],
            returncode=0,
            stdout=(
                "1.0.0"
                if args[:1] == ["--version"]
                else json.dumps(
                    {
                        "loggedIn": True,
                        "authMethod": "claude.ai",
                        "apiProvider": "firstParty",
                        "subscriptionType": "pro",
                    }
                )
            ),
            stderr="",
        ),
    )


def _capture(monkeypatch, stdout: str):
    calls: list[dict] = []
    monkeypatch.setattr(cli_writer, "resolve_cli_path", lambda: CLI_PATH)

    def fake_run(args, **kwargs):
        calls.append({"args": list(args), "kwargs": kwargs})
        return subprocess.CompletedProcess(
            args=args, returncode=0, stdout=stdout, stderr=""
        )

    monkeypatch.setattr(cli_writer.subprocess, "run", fake_run)
    return calls


# --- The default path is untouched ------------------------------------------


def test_claude_names_still_reach_vertex_with_no_switch_on(monkeypatch):
    captured = {}

    class _VertexLLM:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(llm_client, "VertexAI", _VertexLLM)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
    monkeypatch.setattr(
        llm_client,
        "_claude_cli_transport",
        _unreachable_transport,
    )

    llm = llm_client.get_vertex_llm(model_name="claude-sonnet-5", max_tokens=1024)

    assert not isinstance(llm, llm_client.ClaudeCliTextLLM)
    assert captured["model_name"] == "gemini-2.5-pro"


def test_the_api_key_path_still_wins_over_the_subscription(monkeypatch):
    monkeypatch.setenv(llm_client.ANTHROPIC_MODELS_ENABLED_ENV, "1")
    monkeypatch.setenv(llm_client.CLAUDE_SUBSCRIPTION_MODELS_ENABLED_ENV, "1")
    monkeypatch.setattr(
        llm_client,
        "_claude_cli_transport",
        _unreachable_transport,
    )

    llm = llm_client.get_vertex_llm(model_name="claude-sonnet-5", max_tokens=1024)

    assert isinstance(llm, llm_client.ClaudeTextLLM)


# --- The subscription path ---------------------------------------------------


def test_subscription_path_serves_claude_names_from_the_cli(
    monkeypatch, subscription_on, connected
):
    calls = _capture(monkeypatch, TEXT_JSON)

    llm = llm_client.get_vertex_llm(model_name="claude-opus-5", max_tokens=6144)
    text = llm.invoke("Draft the opening.")

    assert isinstance(llm, llm_client.ClaudeCliTextLLM)
    assert text == "Barranco after dark."
    assert calls[0]["args"][0] == CLI_PATH
    assert "--print" in calls[0]["args"]
    # Reused from the transport rather than rebuilt here: the isolation flags
    # and the closed stdin are the same ones the bench and the writer use.
    assert calls[0]["kwargs"]["stdin"] is subprocess.DEVNULL
    assert "--setting-sources" in calls[0]["args"]


def test_invoke_reports_the_model_that_answered_not_the_alias(
    monkeypatch, subscription_on, connected
):
    _capture(monkeypatch, TEXT_JSON)

    llm = llm_client.get_vertex_llm(model_name="claude-opus-5", max_tokens=6144)
    llm.invoke("Draft the opening.")

    # 'opus' is a moving target, so a spend record keyed on the request would
    # not say what it paid for.
    assert llm.model_name == "claude-sonnet-5"


def test_usage_lands_in_the_shape_the_token_tracker_reads(
    monkeypatch, subscription_on, connected
):
    from app.features.prompt2blog.pricing import normalize_token_usage

    _capture(monkeypatch, TEXT_JSON)

    llm = llm_client.get_vertex_llm(model_name="claude-sonnet-5", max_tokens=6144)
    llm.invoke("Draft the opening.")

    assert llm.last_usage_metadata == {
        "input_tokens": 10,
        "output_tokens": 503,
        "cache_read_input_tokens": 8741,
        "cache_creation_input_tokens": 2729,
    }
    # The transport's `input_tokens` counts only the uncached remainder, so the
    # normalizer folds the two cache figures back in to get the real prompt
    # size. 10 was never the input count -- it was what was not served from
    # cache.
    normalized = normalize_token_usage(llm.last_usage_metadata)
    assert normalized["input_tokens"] == 11_480
    assert normalized["cached_input_tokens"] == 8_741
    assert normalized["output_tokens"] == 503


def test_measured_cost_is_carried_off_the_call(monkeypatch, subscription_on, connected):
    _capture(monkeypatch, TEXT_JSON)

    llm = llm_client.get_vertex_llm(model_name="claude-sonnet-5", max_tokens=6144)
    llm.invoke("Draft the opening.")

    assert llm.last_cost_usd == 0.0099


def test_a_refused_call_raises_instead_of_returning_prose(
    monkeypatch, subscription_on, connected
):
    """The named failure mode: a refusal arrives shaped like an answer.

    `subtype` says "success" and the apology sits in `result`. Anything that
    returns that string publishes it as article prose.
    """
    refusal = json.dumps(
        {
            "is_error": True,
            "subtype": "success",
            "terminal_reason": "api_error",
            "total_cost_usd": 0,
            "result": (
                "You've hit your monthly spend limit. Switch to another model, "
                "or manage usage credits at claude.ai/settings/usage."
            ),
        }
    )
    _capture(monkeypatch, refusal)

    llm = llm_client.get_vertex_llm(model_name="claude-opus-5", max_tokens=6144)
    with pytest.raises(llm_client.ClaudeCliUnavailable) as error:
        llm.invoke("Draft the opening.")

    assert "monthly spend limit" not in str(error.value)


def test_structured_calls_use_the_cli_rather_than_an_unconfigured_api_key(
    monkeypatch, subscription_on, connected
):
    """Switching the subscription on must not leave half the surface broken.

    Without this, a working text call would sit beside a forced-tool call still
    reaching for an Anthropic key that was never configured.
    """
    calls = _capture(monkeypatch, STRUCTURED_JSON)

    payload, resolved = llm_client.invoke_structured_tool(
        prompt="Write the SEO title.",
        model_name="claude-opus-5",
        tool_name="emit_seo_patch",
        tool_description="One SEO title.",
        input_schema=SCHEMA,
    )

    assert payload == {"seoTitle": "Hidden Cafes in Barranco"}
    assert resolved == "claude-opus-5"
    args = calls[0]["args"]
    assert "--json-schema" in args
    # The caller's tool name and description survive into the prompt: the CLI
    # has no tool to name, but the description is often the only place the
    # meaning of the schema is written down.
    prompt = args[args.index("--print") + 1]
    assert "emit_seo_patch" in prompt
    assert "One SEO title." in prompt


def _unreachable_transport():  # pragma: no cover - must not run
    raise AssertionError("the CLI transport was consulted with no Claude switch on")


# --- Phase 4: JSON that is validated rather than parsed ----------------------


def test_writer_json_calls_go_through_the_schema_on_a_claude_stack(
    monkeypatch, subscription_on, connected
):
    """The whole point: no ask-politely-and-retry loop on this provider.

    Prompt2Blog's JSON calls are free text plus parse_json_response, retried up
    to three times. Each of those retries on a compose or repair stage is a
    full article rewrite on the writer model.
    """
    from app.features.prompt2blog import llm as prompt2blog_llm
    from app.features.prompt2blog.schemas import REWRITE_SCHEMA

    calls = _capture(
        monkeypatch,
        json.dumps(
            {
                "result": "ignored",
                "structured_output": {
                    "improved_title": "Barranco after dark",
                    "improved_content": "## Where to start\n\nText.",
                },
                "is_error": False,
                "stop_reason": "tool_use",
                "total_cost_usd": 0.0099,
                "usage": {"input_tokens": 10, "output_tokens": 900},
            }
        ),
    )

    parsed, raw = prompt2blog_llm._invoke_json_llm(
        prompt="Rewrite the article.",
        max_tokens=6144,
        temperature=0.1,
        model_name="claude-opus-5",
        schema=REWRITE_SCHEMA,
    )

    assert parsed["improved_title"] == "Barranco after dark"
    # One call, not one plus two retries.
    assert len(calls) == 1
    args = calls[0]["args"]
    assert "--json-schema" in args
    assert json.loads(args[args.index("--json-schema") + 1]) == REWRITE_SCHEMA
    # The prompt does not carry the "return only one valid JSON object" plea
    # any more; the schema is the enforcement.
    prompt = args[args.index("--print") + 1]
    assert "CRITICAL OUTPUT RULE" not in prompt
    # The trace still gets a raw response to record.
    assert json.loads(raw) == parsed


def test_the_schema_reply_comes_from_structured_output_not_the_result_string(
    monkeypatch, subscription_on, connected
):
    """Both hold the same JSON; only one of them was validated."""
    from app.features.prompt2blog import llm as prompt2blog_llm
    from app.features.prompt2blog.schemas import REWRITE_SCHEMA

    _capture(
        monkeypatch,
        json.dumps(
            {
                "result": '{"improved_title":"From the result string"}',
                "structured_output": {
                    "improved_title": "From structured_output",
                    "improved_content": "Text.",
                },
                "is_error": False,
                "usage": {"input_tokens": 10, "output_tokens": 900},
            }
        ),
    )

    parsed, _ = prompt2blog_llm._invoke_json_llm(
        prompt="Rewrite the article.",
        max_tokens=6144,
        temperature=0.1,
        model_name="claude-opus-5",
        schema=REWRITE_SCHEMA,
    )

    assert parsed["improved_title"] == "From structured_output"


def test_a_schema_call_records_its_usage_and_price(
    monkeypatch, subscription_on, connected
):
    from app.features.prompt2blog import llm as prompt2blog_llm
    from app.features.prompt2blog.pricing import Prompt2BlogTokenUsageTracker
    from app.features.prompt2blog.schemas import REWRITE_SCHEMA

    _capture(
        monkeypatch,
        json.dumps(
            {
                "structured_output": {
                    "improved_title": "T",
                    "improved_content": "C",
                },
                "is_error": False,
                "total_cost_usd": 0.0099,
                "usage": {"input_tokens": 10, "output_tokens": 900},
                "modelUsage": {"m": {"canonicalModel": "claude-opus-5"}},
            }
        ),
    )
    tracker = Prompt2BlogTokenUsageTracker()

    prompt2blog_llm._invoke_json_llm(
        prompt="Rewrite the article.",
        max_tokens=6144,
        temperature=0.1,
        model_name="claude-opus-5",
        schema=REWRITE_SCHEMA,
        usage_recorder=tracker.record,
    )

    summary = tracker.summary(
        stack_id="opus-balanced",
        worker_model="gemini-3.7-flash",
        writing_model="claude-opus-5",
        audit_model="gemini-3.7-flash",
    )
    assert summary["estimated_cost_usd"] == 0.0099
    assert summary["by_model"][0]["model"] == "claude-opus-5"


def test_a_provider_that_cannot_enforce_a_schema_still_asks_in_prose(monkeypatch):
    """The schema argument is a capability offer, not a requirement.

    Asked of the object the factory returned rather than inferred from the
    model name, so a Gemini stack is completely unaffected by a call site
    gaining a schema.
    """
    from app.features.prompt2blog import llm as prompt2blog_llm
    from app.features.prompt2blog.schemas import REWRITE_SCHEMA

    prompts: list[str] = []

    class _ProseLLM:
        model_name = "gemini-3.7-flash"
        last_usage_metadata = {"input_tokens": 10, "output_tokens": 20}

        def invoke(self, prompt):  # noqa: ANN001
            prompts.append(prompt)
            return '{"improved_title": "T", "improved_content": "C"}'

    monkeypatch.setattr(prompt2blog_llm, "get_vertex_llm", lambda **kwargs: _ProseLLM())

    parsed, _ = prompt2blog_llm._invoke_json_llm(
        prompt="Rewrite the article.",
        max_tokens=6144,
        temperature=0.1,
        model_name="gemini-3.7-flash",
        schema=REWRITE_SCHEMA,
    )

    assert parsed["improved_title"] == "T"
    assert "CRITICAL OUTPUT RULE" in prompts[0]
