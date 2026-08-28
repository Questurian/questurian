"""Naming the failure, and stopping the run once it is named.

The bug this covers, in order: Claude refused a fact-check call because the
account was out of allowance; the transport raised one generic error; the
grounding stage treated it as a checker outage and recorded "grounding check
did not run"; the graph continued and spent the audit stage's call on the same
dead credential; the run was then reported as having failed at the audit.

Four properties keep that from happening again.

1. A refusal is classified, not flattened.
2. A successful answer is never classified, whatever its prose says.
3. The first exhausted call arms a breaker that refuses every later call in the
   run before a subprocess is started.
4. An unidentified failure that produced nothing and cost nothing is read as
   exhaustion. That is the cautious side of a deliberate trade -- see
   ``_failure_kind`` -- and it is a decision, so it gets a test.
"""

import json
import subprocess

import pytest

from app.features.claude_connection import cli_writer
from app.features.claude_connection import status as status_module

CLI_PATH = "/fake/bin/claude"

# The refusal as it actually arrived: `subtype` reads "success", the apology
# sits in `result`, and nothing was spent.
OBSERVED_LIMIT_REFUSAL = {
    "is_error": True,
    "subtype": "success",
    "terminal_reason": "api_error",
    "total_cost_usd": 0,
    "result": (
        "You've hit your monthly spend limit. Switch to another model, or "
        "manage usage credits at claude.ai/settings/usage."
    ),
}


@pytest.fixture(autouse=True)
def _no_inherited_api_credentials(monkeypatch):
    for name in status_module.API_BILLED_VARS:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.delenv(cli_writer.WRITER_PROVIDER_ENV, raising=False)


@pytest.fixture
def connected(monkeypatch):
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


# --- What each failure is called --------------------------------------------


def test_the_observed_limit_refusal_is_named_as_exhaustion(monkeypatch, connected):
    """The anchor case. Everything else in this file is a variation on it."""
    _capture(monkeypatch, json.dumps(OBSERVED_LIMIT_REFUSAL))

    with pytest.raises(cli_writer.ClaudeCliWriterError) as caught:
        cli_writer.invoke_text(prompt="write something")

    assert caught.value.kind == cli_writer.FAULT_QUOTA_EXHAUSTED
    # The reason is named without repeating Claude's own words back: these
    # strings reach an API response.
    assert "monthly spend limit" not in str(caught.value)
    assert "limit" in str(caught.value).lower()


def test_a_named_budget_reason_needs_no_wording_at_all(monkeypatch, connected):
    """The half of the detection that survives a reworded apology."""
    _capture(
        monkeypatch,
        json.dumps(
            {
                "is_error": True,
                "terminal_reason": "budget_exhausted",
                "total_cost_usd": 0.02,
                "usage": {"output_tokens": 12},
                "result": "no wording this test can rely on",
            }
        ),
    )

    with pytest.raises(cli_writer.ClaudeCliWriterError) as caught:
        cli_writer.invoke_text(prompt="write something")

    assert caught.value.kind == cli_writer.FAULT_QUOTA_EXHAUSTED


def test_a_transient_error_that_cost_something_is_not_exhaustion(
    monkeypatch, connected
):
    """Spend and tokens are evidence the call reached the model."""
    _capture(
        monkeypatch,
        json.dumps(
            {
                "is_error": True,
                "terminal_reason": "api_error",
                "total_cost_usd": 0.004,
                "usage": {"output_tokens": 61},
                "result": "upstream connection reset",
            }
        ),
    )

    with pytest.raises(cli_writer.ClaudeCliWriterError) as caught:
        cli_writer.invoke_text(prompt="write something")

    assert caught.value.kind == cli_writer.FAULT_PROVIDER_UNAVAILABLE


def test_an_unidentified_zero_cost_failure_is_treated_as_exhaustion(
    monkeypatch, connected
):
    """The cautious default, stated as a decision.

    No marker matched and the terminal reason names nothing. Reading this as a
    temporary problem would let the run continue and keep calling an account
    that may well be dead, which is the original bug. A run stopped early is
    cheap to restart, so this errs towards stopping.
    """
    _capture(
        monkeypatch,
        json.dumps(
            {
                "is_error": True,
                "terminal_reason": "something_new_in_a_later_cli",
                "total_cost_usd": 0,
                "usage": {"output_tokens": 0},
                "result": "wording nobody has seen yet",
            }
        ),
    )

    with pytest.raises(cli_writer.ClaudeCliWriterError) as caught:
        cli_writer.invoke_text(prompt="write something")

    assert caught.value.kind == cli_writer.FAULT_QUOTA_EXHAUSTED


def test_a_missing_cli_is_a_setup_problem_not_a_limit(monkeypatch, connected):
    monkeypatch.setattr(cli_writer, "resolve_cli_path", lambda: None)

    with pytest.raises(cli_writer.ClaudeCliWriterError) as caught:
        cli_writer.invoke_text(prompt="write something")

    assert caught.value.kind == cli_writer.FAULT_NOT_CONNECTED


def test_unreadable_output_is_an_unusable_answer(monkeypatch, connected):
    _capture(monkeypatch, "not json at all")

    with pytest.raises(cli_writer.ClaudeCliWriterError) as caught:
        cli_writer.invoke_text(prompt="write something")

    assert caught.value.kind == cli_writer.FAULT_INVALID_RESPONSE


# --- A good answer is never classified --------------------------------------


def test_an_article_about_spending_limits_classifies_nothing(monkeypatch, connected):
    """The check that keeps detection from reading the model's own prose.

    An article that discusses a spend limit carries every marker in the list.
    It is also a successful reply, so nothing here ever looks at it.
    """
    calls = _capture(
        monkeypatch,
        json.dumps(
            {
                "result": (
                    "Stripe will pause the account once you hit your monthly "
                    "spend limit, and the quota resets at midnight UTC."
                ),
                "is_error": False,
                "total_cost_usd": 0.02,
                "usage": {"input_tokens": 10, "output_tokens": 88},
            }
        ),
    )

    result = cli_writer.invoke_text(prompt="write something")

    assert "spend limit" in result["text"]
    assert len(calls) == 1


# --- The breaker ------------------------------------------------------------


def test_once_exhausted_no_later_call_starts_a_subprocess(monkeypatch, connected):
    """The guarantee that does not depend on every caller behaving.

    Even if some stage still swallows the first failure, the second call is
    refused before anything is spawned.
    """
    calls = _capture(monkeypatch, json.dumps(OBSERVED_LIMIT_REFUSAL))

    with cli_writer.quota_breaker_scope():
        with pytest.raises(cli_writer.ClaudeCliWriterError):
            cli_writer.invoke_text(prompt="first")
        assert len(calls) == 1

        with pytest.raises(cli_writer.ClaudeCliWriterError) as caught:
            cli_writer.invoke_text(prompt="second")

    assert caught.value.kind == cli_writer.FAULT_QUOTA_EXHAUSTED
    assert len(calls) == 1, "a call after exhaustion must not reach the CLI"


def test_the_breaker_does_not_leak_between_runs(monkeypatch, connected):
    """One run's exhaustion must not refuse the next run's first call."""
    calls = _capture(monkeypatch, json.dumps(OBSERVED_LIMIT_REFUSAL))

    with cli_writer.quota_breaker_scope():
        with pytest.raises(cli_writer.ClaudeCliWriterError):
            cli_writer.invoke_text(prompt="first run")

    with cli_writer.quota_breaker_scope():
        with pytest.raises(cli_writer.ClaudeCliWriterError):
            cli_writer.invoke_text(prompt="second run")

    assert len(calls) == 2, "the second run gets its own attempt"


def test_a_non_limit_failure_leaves_the_breaker_closed(monkeypatch, connected):
    calls = _capture(
        monkeypatch,
        json.dumps(
            {
                "is_error": True,
                "terminal_reason": "api_error",
                "total_cost_usd": 0.004,
                "usage": {"output_tokens": 61},
            }
        ),
    )

    with cli_writer.quota_breaker_scope():
        for _ in range(2):
            with pytest.raises(cli_writer.ClaudeCliWriterError):
                cli_writer.invoke_text(prompt="write something")

    assert len(calls) == 2
