"""The one caller that can reach the open web, and the wall around it.

ADR 0036 gives the article writer web search and page fetching. The tests that
matter here are the ones about what it did *not* get, and about what every other
caller still does not get -- because the cheap way to make research work is to
delete two lines from the global deny list, and that would hand the capability
to every consumer in the repo at once.
"""

import json
import subprocess

import pytest

from app.features.claude_connection import cli_writer
from app.features.claude_connection import status as status_module

CLI_PATH = "/fake/bin/claude"

RESEARCH_JSON = json.dumps(
    {
        "result": "# Riding the ascensores\n\nBody.\n\n## Research note\n\n- https://example.cl",
        "is_error": False,
        "num_turns": 14,
        "total_cost_usd": 0.42,
        "usage": {"input_tokens": 4_000, "output_tokens": 3_100},
        "modelUsage": {
            "claude-opus-5-20260101": {
                "canonicalModel": "claude-opus-5",
                "outputTokens": 3_100,
            },
            "claude-haiku-4-5-20251001": {
                "canonicalModel": "claude-haiku-4-5",
                "outputTokens": 40,
            },
        },
    }
)


@pytest.fixture(autouse=True)
def _billing_lands_on_the_subscription(monkeypatch):
    """No inherited API credentials, and a signed-in account.

    Both guards run before any subprocess is spawned, so without this every
    test here fails on setup rather than on the thing it is asserting.
    """
    for name in status_module.API_BILLED_VARS:
        monkeypatch.delenv(name, raising=False)
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


def _capture(monkeypatch, stdout: str = RESEARCH_JSON):
    calls: list[dict] = []
    monkeypatch.setattr(cli_writer, "resolve_cli_path", lambda: CLI_PATH)

    def fake_run(args, **kwargs):
        calls.append({"args": list(args), "kwargs": kwargs})
        return subprocess.CompletedProcess(args=args, returncode=0, stdout=stdout)

    monkeypatch.setattr(cli_writer.subprocess, "run", fake_run)
    return calls


def _flag_values(args: list[str], flag: str) -> list[str]:
    """Everything the CLI would read as this flag's values.

    The CLI takes variadic tool lists, so a value is anything between the flag
    and the next `--something`. Parsed the way the CLI parses it rather than by
    index, because an argument inserted in front would otherwise pass a test it
    should fail.
    """
    if flag not in args:
        return []
    rest = args[args.index(flag) + 1 :]
    out = []
    for item in rest:
        if item.startswith("--"):
            break
        out.append(item)
    return out


# --- what the research writer gets ------------------------------------------


def test_the_research_writer_can_search_and_fetch(monkeypatch):
    calls = _capture(monkeypatch)

    cli_writer.invoke_research_text(prompt="Write it.", model_name="claude-opus-5-high")

    allowed = _flag_values(calls[0]["args"], "--allowed-tools")
    assert "WebSearch" in allowed
    assert "WebFetch" in allowed


def test_the_research_writer_still_cannot_touch_the_machine(monkeypatch):
    """The capability granted is the open web, not this computer.

    Shell and filesystem tools would not help a writer establish a fare, so
    granting them would buy risk at a price of nothing.
    """
    calls = _capture(monkeypatch)

    cli_writer.invoke_research_text(prompt="Write it.", model_name="claude-opus-5-high")

    denied = _flag_values(calls[0]["args"], "--disallowed-tools")
    for tool in ("Bash", "Read", "Write", "Edit", "Glob", "Grep", "NotebookEdit"):
        assert tool in denied, tool


def test_subagents_stay_denied(monkeypatch):
    """Not for safety. For spend.

    `Task` spawns subagents whose cost this app cannot see or bound, and an
    unbounded spend is not a capability the operator agreed to.
    """
    calls = _capture(monkeypatch)

    cli_writer.invoke_research_text(prompt="Write it.")

    assert "Task" in _flag_values(calls[0]["args"], "--disallowed-tools")
    assert "Task" not in _flag_values(calls[0]["args"], "--allowed-tools")


def test_the_research_writer_reads_no_settings_and_no_mcp(monkeypatch):
    """Research means the open web, not this machine's configuration."""
    calls = _capture(monkeypatch)

    cli_writer.invoke_research_text(prompt="Write it.")
    args = calls[0]["args"]

    assert "--strict-mcp-config" in args
    assert _flag_values(args, "--setting-sources") == [""]


def test_the_denied_list_is_derived_rather_than_retyped():
    """A second hand-maintained list is a list that drifts.

    The direction it drifts in is "the research writer quietly kept a
    capability somebody removed everywhere else", so the only way to grant a
    tool is to name it in RESEARCH_TOOLS.
    """
    granted = set(cli_writer.RESEARCH_TOOLS)
    assert set(cli_writer.RESEARCH_DENIED_TOOLS) == set(cli_writer.DENIED_TOOLS) - granted


# --- what every other caller still does not get -----------------------------


def test_the_ordinary_writer_is_unchanged(monkeypatch):
    """The failure this whole arrangement exists to prevent.

    Deleting two names from DENIED_TOOLS would have made research work and
    handed the capability to every consumer in the repo in the same commit.
    """
    calls = _capture(
        monkeypatch,
        stdout=json.dumps({"result": "Barranco after dark.", "is_error": False}),
    )

    cli_writer.invoke_text(prompt="Write it.")
    args = calls[0]["args"]

    denied = _flag_values(args, "--disallowed-tools")
    assert "WebSearch" in denied
    assert "WebFetch" in denied
    assert _flag_values(args, "--allowed-tools") == [""]


def test_the_structured_writer_is_unchanged(monkeypatch):
    calls = _capture(
        monkeypatch,
        stdout=json.dumps(
            {"result": "{}", "structured_output": {"a": 1}, "is_error": False}
        ),
    )

    cli_writer.invoke_structured(
        prompt="Shape it.", input_schema={"type": "object", "properties": {}}
    )

    denied = _flag_values(calls[0]["args"], "--disallowed-tools")
    assert "WebSearch" in denied
    assert "WebFetch" in denied


# --- refusing rather than degrading -----------------------------------------


def test_research_refuses_when_no_claude_can_reach_the_web(monkeypatch):
    """Every other writer call substitutes silently when Claude is off.

    That is right for prose: a Gemini paragraph is still a paragraph. It is
    wrong here, because the assignment tells the writer to verify fares and
    opening hours, so a model that cannot open a page would answer it by
    inventing them. A refusal is recoverable; a confidently sourced article
    with invented sources is not.
    """
    from app.shared import writer_invocation

    monkeypatch.setattr(
        writer_invocation, "_claude_subscription_available", lambda: False
    )

    with pytest.raises(writer_invocation.WriterModelError, match="search the web"):
        writer_invocation.invoke_research_writer(
            prompt="Write it.", model_name="claude-opus-5-high"
        )


def test_research_is_gated_on_the_subscription_not_the_writer_flag(monkeypatch):
    """`WRITER_PROVIDER` answers a different question.

    It says whether ordinary prose calls should be diverted to the CLI, and it
    is off on this machine while Claude itself is reachable and working.
    Gating research on it would refuse to research on a machine whose Claude
    is fine.
    """
    from app.shared import writer_invocation

    monkeypatch.delenv(cli_writer.WRITER_PROVIDER_ENV, raising=False)
    monkeypatch.setattr(
        writer_invocation,
        "_cli_writer",
        lambda: cli_writer,
    )
    monkeypatch.setattr(
        writer_invocation, "_claude_subscription_available", lambda: True
    )
    _capture(monkeypatch)

    reply = writer_invocation.invoke_research_writer(
        prompt="Write it.", model_name="claude-opus-5-high"
    )

    assert reply["text"]


# --- what comes back --------------------------------------------------------


def test_the_effort_is_asked_for_explicitly(monkeypatch):
    calls = _capture(monkeypatch)

    cli_writer.invoke_research_text(prompt="Write it.", model_name="claude-opus-5-high")
    args = calls[0]["args"]

    assert args[args.index("--effort") + 1] == "high"
    assert args[args.index("--model") + 1] == "opus"


def test_the_model_that_wrote_it_is_recorded_not_the_helper(monkeypatch):
    """Every Claude call in this repo's history was filed under the helper's
    name. The prices were right and the model names were fiction."""
    _capture(monkeypatch)

    result = cli_writer.invoke_research_text(
        prompt="Write it.", model_name="claude-opus-5-high"
    )

    assert result["modelName"] == "claude-opus-5"
    assert result["requestedModel"] == "claude-opus-5-high"
    assert result["effort"] == "high"


def test_turns_are_reported_so_nothing_can_claim_one_call(monkeypatch):
    """"One writer" is not "one billable call", and the app must not imply it is."""
    _capture(monkeypatch)

    result = cli_writer.invoke_research_text(prompt="Write it.")

    assert result["turns"] == 14
    assert result["elapsedSeconds"] >= 0


def test_a_single_turn_is_visible_as_a_single_turn(monkeypatch):
    """Evidence about whether tools ran, taken from the harness.

    A model that says it checked the timetable while `num_turns` is 1 did not
    check the timetable.
    """
    _capture(
        monkeypatch,
        stdout=json.dumps({"result": "Body.", "is_error": False, "num_turns": 1}),
    )

    assert cli_writer.invoke_research_text(prompt="Write it.")["turns"] == 1


def test_a_withheld_tool_is_reported_rather_than_swallowed(monkeypatch):
    _capture(
        monkeypatch,
        stdout=json.dumps(
            {
                "result": "Body.",
                "is_error": False,
                "permission_denials": [{"tool_name": "Bash"}],
            }
        ),
    )

    assert cli_writer.invoke_research_text(prompt="Write it.")["toolDenials"] == ["Bash"]


def test_an_unrecognised_denial_shape_does_not_lose_the_article(monkeypatch):
    """A field the CLI is free to reshape must not fail work already paid for."""
    _capture(
        monkeypatch,
        stdout=json.dumps(
            {"result": "Body.", "is_error": False, "permission_denials": "unexpected"}
        ),
    )

    assert cli_writer.invoke_research_text(prompt="Write it.")["toolDenials"] == []


def test_an_empty_answer_is_refused(monkeypatch):
    _capture(monkeypatch, stdout=json.dumps({"result": "   ", "is_error": False}))

    with pytest.raises(cli_writer.ClaudeCliWriterError):
        cli_writer.invoke_research_text(prompt="Write it.")


def test_a_refusal_is_not_published_as_an_article(monkeypatch):
    """The refusal that does not arrive shaped like one.

    `subtype: "success"` with the apology in `result`, and a caller that trusts
    it publishes that sentence as prose.
    """
    _capture(
        monkeypatch,
        stdout=json.dumps(
            {
                "subtype": "success",
                "result": "You've hit your monthly spend limit. Switch to another model.",
                "is_error": True,
                "terminal_reason": "api_error",
                "total_cost_usd": 0,
                "usage": {"output_tokens": 0},
            }
        ),
    )

    with pytest.raises(cli_writer.ClaudeCliWriterError) as caught:
        cli_writer.invoke_research_text(prompt="Write it.")

    assert caught.value.kind == cli_writer.FAULT_QUOTA_EXHAUSTED


def test_a_research_pass_gets_longer_than_a_single_shot_call(monkeypatch):
    """Many round trips, not one. The text-only ceiling is not evidence here."""
    calls = _capture(monkeypatch)

    cli_writer.invoke_research_text(prompt="Write it.")

    assert calls[0]["kwargs"]["timeout"] == cli_writer.RESEARCH_TIMEOUT_SECONDS
    assert cli_writer.RESEARCH_TIMEOUT_SECONDS > cli_writer.CALL_TIMEOUT_SECONDS
