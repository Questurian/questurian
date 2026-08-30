"""The Claude CLI writer backend: when it runs, what it sends, what it refuses.

The property under test throughout is that this is an *added* provider. With
``WRITER_PROVIDER`` unset -- the default -- nothing here may run.
"""

import json
import subprocess

import pytest

from app.features.claude_connection import cli_writer
from app.features.claude_connection import status as status_module
from app.shared.writer_invocation import (
    WriterModelError,
    invoke_anthropic_structured,
    invoke_writer_model,
)
from app.shared.writer_models import resolve_writer_model

CLI_PATH = "/fake/bin/claude"

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["seoTitle"],
    "properties": {"seoTitle": {"type": "string"}},
}

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
        "modelUsage": {
            "claude-haiku-4-5-20251001": {"canonicalModel": "claude-haiku-4-5"}
        },
    }
)


@pytest.fixture(autouse=True)
def _no_inherited_api_credentials(monkeypatch):
    for name in status_module.API_BILLED_VARS:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.delenv(cli_writer.WRITER_PROVIDER_ENV, raising=False)


@pytest.fixture
def connected(monkeypatch):
    """A green connection, so the writer is willing to spend."""
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


@pytest.fixture
def provider_on(monkeypatch):
    monkeypatch.setenv(cli_writer.WRITER_PROVIDER_ENV, "claude-cli")


def _capture(monkeypatch, stdout: str, returncode: int = 0, stderr: str = ""):
    """Record argv and kwargs the writer builds, without running anything."""
    calls: list[dict] = []
    monkeypatch.setattr(cli_writer, "resolve_cli_path", lambda: CLI_PATH)

    def fake_run(args, **kwargs):
        calls.append({"args": list(args), "kwargs": kwargs})
        return subprocess.CompletedProcess(
            args=args, returncode=returncode, stdout=stdout, stderr=stderr
        )

    monkeypatch.setattr(cli_writer.subprocess, "run", fake_run)
    return calls


# --- The flag is the whole opt-in -------------------------------------------


def test_provider_is_off_when_unset():
    assert cli_writer.claude_cli_writer_enabled() is False


@pytest.mark.parametrize("value", ["", "gemini", "anthropic", "claude", "CLAUDE-CLI "])
def test_only_the_exact_value_switches_the_provider_on(monkeypatch, value):
    monkeypatch.setenv(cli_writer.WRITER_PROVIDER_ENV, value)
    # "CLAUDE-CLI " is the one that must still count: case and padding are
    # normalized, but a near-miss name is not.
    expected = value.strip().lower() == "claude-cli"
    assert cli_writer.claude_cli_writer_enabled() is expected


def test_writer_invocation_leaves_the_default_path_alone(monkeypatch):
    """With the flag unset, the CLI transport must not be consulted at all.

    Asserted by making the CLI path fatal and the shared factory succeed, so
    the test proves which branch ran rather than inferring it from a failure.
    """
    import utils

    def explode(*_args, **_kwargs):  # pragma: no cover - must not run
        raise AssertionError("the CLI transport ran with WRITER_PROVIDER unset")

    monkeypatch.setattr(cli_writer, "invoke_text", explode)
    monkeypatch.setattr(cli_writer, "invoke_structured", explode)

    class _Llm:
        model_name = "gemini-2.5-flash-lite"

        def invoke(self, _prompt):
            return "from the shared factory"

    monkeypatch.setattr(utils, "get_vertex_llm", lambda **_kwargs: _Llm())

    result = invoke_writer_model(prompt="hello", model_name="gemini-2.5-flash-lite")

    assert result.text == "from the shared factory"
    # The default path reports no price, and must not start inventing one.
    assert result.cost_usd is None
    assert result.usage is None


# --- Spending guard ---------------------------------------------------------


def test_refuses_to_spend_when_the_connection_is_not_green(monkeypatch, provider_on):
    """The state being guarded is api_billed_override: it answers, and bills elsewhere."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-whatever")
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
    calls = _capture(monkeypatch, TEXT_JSON)

    with pytest.raises(cli_writer.ClaudeCliWriterError):
        cli_writer.invoke_text(prompt="write something")

    assert calls == [], "a refused call must not reach the CLI"


# --- Argument construction --------------------------------------------------


def test_text_call_is_isolated_and_carries_no_schema(
    monkeypatch, connected, provider_on
):
    calls = _capture(monkeypatch, TEXT_JSON)

    cli_writer.invoke_text(prompt="write something", model_name="claude-sonnet-5")

    args = calls[0]["args"]
    kwargs = calls[0]["kwargs"]
    assert args[0] == CLI_PATH
    assert "--json-schema" not in args
    # No settings, no MCP servers, no tools, and a working directory outside the
    # repo so no CLAUDE.md is discovered.
    assert args[args.index("--setting-sources") + 1] == ""
    assert "--strict-mcp-config" in args
    assert args[args.index("--allowed-tools") + 1] == ""
    for tool in cli_writer.DENIED_TOOLS:
        assert tool in args
    assert kwargs["cwd"] == cli_writer.WORKING_DIR
    # Closing stdin: the CLI otherwise waits ~3s for input that never arrives.
    assert kwargs["stdin"] is subprocess.DEVNULL


def test_prompt2blog_scope_uses_its_token_only_in_the_child_environment(
    monkeypatch,
    provider_on,
):
    secret = "sk-ant-oat01-PROMPT2BLOG-ONLY"
    calls = _capture(monkeypatch, TEXT_JSON)

    with cli_writer.prompt2blog_credential_scope(secret):
        cli_writer.invoke_text(prompt="write article", model_name="claude-sonnet-5")

    child_env = calls[0]["kwargs"]["env"]
    assert child_env["CLAUDE_CODE_OAUTH_TOKEN"] == secret
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in cli_writer.os.environ
    assert secret not in calls[0]["args"]


def test_prompt2blog_scope_refuses_higher_priority_api_credentials(
    monkeypatch,
    provider_on,
):
    calls = _capture(monkeypatch, TEXT_JSON)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-api-MUST-NOT-WIN")

    with cli_writer.prompt2blog_credential_scope("sk-ant-oat01-ARTICLE"):
        with pytest.raises(cli_writer.ClaudeCliWriterError) as caught:
            cli_writer.invoke_text(prompt="write article")

    assert "ANTHROPIC_API_KEY" in str(caught.value)
    assert "sk-ant-api-MUST-NOT-WIN" not in str(caught.value)
    assert calls == []


def test_structured_call_passes_the_schema_verbatim(
    monkeypatch, connected, provider_on
):
    calls = _capture(monkeypatch, STRUCTURED_JSON)

    cli_writer.invoke_structured(
        prompt="fill this in", input_schema=SCHEMA, model_name="claude-haiku-4-5"
    )

    args = calls[0]["args"]
    assert json.loads(args[args.index("--json-schema") + 1]) == SCHEMA


def test_system_prompt_is_constant_across_calls(monkeypatch, connected, provider_on):
    """The prompt cache only pays off if the prefix is byte-identical.

    A stage-specific system prompt would turn every stage into a cold start,
    which measured ~3x the price of a warm one.
    """
    calls = _capture(monkeypatch, TEXT_JSON)

    cli_writer.invoke_text(prompt="first stage", model_name="claude-sonnet-5")
    cli_writer.invoke_text(prompt="second stage", model_name="claude-haiku-4-5")

    prompts = [c["args"][c["args"].index("--system-prompt") + 1] for c in calls]
    assert prompts == [cli_writer.SYSTEM_PROMPT, cli_writer.SYSTEM_PROMPT]


# --- Model names become subprocess arguments, so they are allow-listed ------


@pytest.mark.parametrize(
    "requested,expected",
    [
        ("claude-sonnet-5", "sonnet"),
        ("claude-opus-5", "opus"),
        ("claude-opus-5-medium", "opus"),
        ("claude-opus-5-max", "opus"),
        ("claude-sonnet-5-xhigh", "sonnet"),
        ("claude-haiku-4-5", "haiku"),
        ("claude-fable-5", "fable"),
        ("CLAUDE-SONNET-5", "sonnet"),
        # Unknown names -- including a Gemini one the pipeline pins, and a flag
        # -- fall back rather than reaching argv.
        ("gemini-3.1-pro-preview", cli_writer.DEFAULT_ALIAS),
        ("--dangerously-skip-permissions", cli_writer.DEFAULT_ALIAS),
        (None, cli_writer.DEFAULT_ALIAS),
    ],
)
def test_model_names_resolve_through_an_allow_list(requested, expected):
    assert cli_writer.resolve_alias(requested) == expected


@pytest.mark.parametrize("effort", ["medium", "high", "xhigh", "max"])
@pytest.mark.parametrize("family", ["opus", "sonnet"])
def test_pipeline_accepts_claude_effort_variants(family, effort):
    requested = f"claude-{family}-5-{effort}"

    assert resolve_writer_model(requested) == requested


def test_a_flag_shaped_model_name_never_reaches_argv(
    monkeypatch, connected, provider_on
):
    calls = _capture(monkeypatch, TEXT_JSON)

    cli_writer.invoke_text(
        prompt="write something", model_name="--dangerously-skip-permissions"
    )

    args = calls[0]["args"]
    assert "--dangerously-skip-permissions" not in args
    assert args[args.index("--model") + 1] == cli_writer.DEFAULT_ALIAS


@pytest.mark.parametrize("effort", ["medium", "high", "xhigh", "max"])
def test_effort_variant_reaches_cli_argv(monkeypatch, connected, provider_on, effort):
    calls = _capture(monkeypatch, TEXT_JSON)

    cli_writer.invoke_text(
        prompt="write something", model_name=f"claude-opus-5-{effort}"
    )

    args = calls[0]["args"]
    assert args[args.index("--model") + 1] == "opus"
    assert args[args.index("--effort") + 1] == effort


def test_base_model_leaves_effort_at_cli_default(monkeypatch, connected, provider_on):
    calls = _capture(monkeypatch, TEXT_JSON)

    cli_writer.invoke_text(prompt="write something", model_name="claude-opus-5")

    assert "--effort" not in calls[0]["args"]


# --- Reading the reply ------------------------------------------------------


def test_structured_reply_comes_from_structured_output(
    monkeypatch, connected, provider_on
):
    """Not from parsing `result`: only structured_output was schema-validated."""
    _capture(monkeypatch, STRUCTURED_JSON)

    result = cli_writer.invoke_structured(prompt="fill this in", input_schema=SCHEMA)

    assert result["payload"] == {"seoTitle": "Hidden Cafes in Barranco"}
    assert result["modelName"] == "claude-haiku-4-5"
    assert result["costUsd"] == 0.0099


def test_missing_structured_output_is_an_error_not_a_fallback(
    monkeypatch, connected, provider_on
):
    payload = json.loads(STRUCTURED_JSON)
    del payload["structured_output"]
    _capture(monkeypatch, json.dumps(payload))

    with pytest.raises(cli_writer.ClaudeCliWriterError):
        cli_writer.invoke_structured(prompt="fill this in", input_schema=SCHEMA)


def test_text_reply_reports_usage_and_the_canonical_model(
    monkeypatch, connected, provider_on
):
    _capture(monkeypatch, TEXT_JSON)

    result = cli_writer.invoke_text(prompt="write something")

    assert result["text"] == "Barranco after dark."
    # The model that answered, not the alias asked for -- 'sonnet' moves.
    assert result["modelName"] == "claude-sonnet-5"
    assert result["usage"]["cacheReadInputTokens"] == 8741
    assert result["usage"]["cacheCreationInputTokens"] == 2729


def test_model_reported_error_is_raised(monkeypatch, connected, provider_on):
    _capture(monkeypatch, json.dumps({"result": "nope", "is_error": True}))

    with pytest.raises(cli_writer.ClaudeCliWriterError):
        cli_writer.invoke_text(prompt="write something")


def test_a_limit_refusal_never_becomes_prose(monkeypatch, connected, provider_on):
    """The refusal that arrives shaped like an answer.

    Measured by asking for a model this plan cannot serve: `subtype` reads
    "success", `total_cost_usd` is 0, and the apology sits in `result` where a
    trusting caller would read it and publish it as article prose.
    """
    _capture(
        monkeypatch,
        json.dumps(
            {
                "is_error": True,
                "subtype": "success",
                "terminal_reason": "api_error",
                "total_cost_usd": 0,
                "result": (
                    "You've hit your monthly spend limit. Switch to another "
                    "model, or manage usage credits at claude.ai/settings/usage."
                ),
            }
        ),
    )

    with pytest.raises(cli_writer.ClaudeCliWriterError) as caught:
        cli_writer.invoke_text(prompt="write something")

    assert "monthly spend limit" not in str(caught.value)


@pytest.mark.parametrize("reason", sorted(cli_writer.FAILED_TERMINAL_REASONS))
def test_a_named_stop_reason_is_refused_even_without_the_error_flag(
    monkeypatch, connected, provider_on, reason
):
    """`is_error` is one signal, not the only one.

    A run that stopped for a named reason did not answer, whatever else the
    payload claims about itself.
    """
    _capture(
        monkeypatch,
        json.dumps(
            {
                "result": "Sorry, I cannot continue.",
                "is_error": False,
                "subtype": "success",
                "terminal_reason": reason,
                "usage": {"input_tokens": 10, "output_tokens": 12},
            }
        ),
    )

    with pytest.raises(cli_writer.ClaudeCliWriterError):
        cli_writer.invoke_text(prompt="write something")


def test_zero_generated_tokens_means_the_text_did_not_come_from_claude(
    monkeypatch, connected, provider_on
):
    """The check that does not depend on guessing future refusal flags.

    If the model generated nothing, whatever is sitting in `result` was written
    by the harness rather than by Claude.
    """
    _capture(
        monkeypatch,
        json.dumps(
            {
                "result": "Switch to another model to continue.",
                "is_error": False,
                "subtype": "success",
                "usage": {"input_tokens": 10, "output_tokens": 0},
            }
        ),
    )

    with pytest.raises(cli_writer.ClaudeCliWriterError):
        cli_writer.invoke_text(prompt="write something")


def test_an_unreported_token_count_is_not_treated_as_zero(
    monkeypatch, connected, provider_on
):
    """Absent is not the same as zero.

    Only a reported zero is evidence that nothing was generated; a payload that
    omits usage entirely must still be usable, or a CLI version that stops
    reporting it takes the pipeline down.
    """
    _capture(
        monkeypatch,
        json.dumps({"result": "Barranco after dark.", "is_error": False}),
    )

    assert cli_writer.invoke_text(prompt="write something")["text"] == (
        "Barranco after dark."
    )


def test_an_unrecognised_stop_reason_is_allowed_through(
    monkeypatch, connected, provider_on
):
    """A deny list, not an allow list.

    The CLI is free to add benign `terminal_reason` values, and failing an
    unrecognised one would break every working call on a version bump.
    """
    _capture(
        monkeypatch,
        json.dumps(
            {
                "result": "Barranco after dark.",
                "is_error": False,
                "terminal_reason": "some_new_benign_reason",
                "usage": {"input_tokens": 10, "output_tokens": 503},
            }
        ),
    )

    assert cli_writer.invoke_text(prompt="write something")["text"] == (
        "Barranco after dark."
    )


def test_cli_output_is_never_echoed_into_the_error(monkeypatch, connected, provider_on):
    """stderr is the one place a credential could appear, and these strings
    reach an API response."""
    secret = "sk-ant-oat01-SECRET-TOKEN"
    _capture(monkeypatch, stdout="", returncode=1, stderr=f"boom {secret}")

    with pytest.raises(cli_writer.ClaudeCliWriterError) as caught:
        cli_writer.invoke_text(prompt="write something")

    assert secret not in str(caught.value)


def test_empty_prompt_is_refused_before_spending(monkeypatch, connected, provider_on):
    calls = _capture(monkeypatch, TEXT_JSON)

    with pytest.raises(cli_writer.ClaudeCliWriterError):
        cli_writer.invoke_text(prompt="   ")

    assert calls == []


def test_structured_call_without_a_schema_is_refused(
    monkeypatch, connected, provider_on
):
    calls = _capture(monkeypatch, STRUCTURED_JSON)

    with pytest.raises(cli_writer.ClaudeCliWriterError):
        cli_writer.invoke_structured(prompt="fill this in", input_schema={})

    assert calls == []


# --- The shared writer contract --------------------------------------------


def test_invoke_writer_model_routes_to_the_cli_and_carries_cost(
    monkeypatch, connected, provider_on
):
    _capture(monkeypatch, TEXT_JSON)

    result = invoke_writer_model(prompt="write something", model_name="claude-sonnet-5")

    assert result.text == "Barranco after dark."
    assert result.model_name == "claude-sonnet-5"
    assert result.cost_usd == 0.0099
    assert result.usage["outputTokens"] == 503


def test_invoke_structured_routes_to_the_cli_and_folds_in_the_tool_description(
    monkeypatch, connected, provider_on
):
    """The CLI has no tool to name, so a prompt telling the model to call one
    would reference something that does not exist."""
    calls = _capture(monkeypatch, STRUCTURED_JSON)

    result = invoke_anthropic_structured(
        prompt="Generate SEO metadata.",
        model_name="claude-haiku-4-5",
        tool_name="emit_seo_patch",
        tool_description="Emit the generated SEO metadata patch.",
        input_schema=SCHEMA,
    )

    assert result.payload == {"seoTitle": "Hidden Cafes in Barranco"}
    assert result.cost_usd == 0.0099
    sent = calls[0]["args"][2]
    assert "Generate SEO metadata." in sent
    assert "emit_seo_patch" in sent
    assert "Emit the generated SEO metadata patch." in sent


def test_transport_errors_surface_as_writer_model_errors(
    monkeypatch, connected, provider_on
):
    """Callers already catch WriterModelError; a new provider must not leak a
    new exception type past the seam."""
    _capture(monkeypatch, stdout="not json", returncode=0)

    with pytest.raises(WriterModelError):
        invoke_writer_model(prompt="write something", model_name="claude-sonnet-5")

    with pytest.raises(WriterModelError):
        invoke_anthropic_structured(
            prompt="p",
            model_name="claude-sonnet-5",
            tool_name="t",
            tool_description="d",
            input_schema=SCHEMA,
        )


def test_canonical_model_names_the_model_that_did_the_work():
    """`modelUsage` lists helpers beside the writer, in the CLI's own order.

    Reading the first key stamped whole runs with the helper's name -- every
    Claude call in this repo's run history is recorded as `claude-haiku-4-5`,
    including drafts written by Opus. Output tokens are what tell them apart.
    """
    payload = {
        "modelUsage": {
            "claude-haiku-4-5-20251001": {
                "canonicalModel": "claude-haiku-4-5",
                "outputTokens": 27,
                "costUSD": 0.0004,
            },
            "claude-opus-5": {
                "canonicalModel": "claude-opus-5",
                "outputTokens": 5_937,
                "costUSD": 0.292,
            },
        }
    }

    assert cli_writer._canonical_model(payload, "opus") == "claude-opus-5"


def test_canonical_model_falls_back_to_cost_then_to_the_alias():
    by_cost = {
        "helper": {"canonicalModel": "claude-haiku-4-5", "costUSD": 0.001},
        "writer": {"canonicalModel": "claude-sonnet-5", "costUSD": 0.44},
    }

    assert cli_writer._canonical_model(by_cost, "sonnet") == "sonnet"
    assert cli_writer._canonical_model({"modelUsage": by_cost}, "sonnet") == (
        "claude-sonnet-5"
    )
    assert cli_writer._canonical_model({"modelUsage": {}}, "sonnet") == "sonnet"
