"""The Claude test bench: what it sends, and what it refuses to send."""

import subprocess

import httpx
import pytest

import app.main as main_module
from app.features.claude_connection import messaging
from app.features.claude_connection import status as status_module

CLI_PATH = "/fake/bin/claude"

SUBSCRIPTION_JSON = (
    '{"loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty", '
    '"subscriptionType": "pro"}'
)

REPLY_JSON = (
    '{"result": "BENCH_OK", "is_error": false, "session_id": "9ad40361-fec5-4c55-b8bb-bb2fa9274959", '
    '"total_cost_usd": 0.0161, "duration_ms": 2046, "num_turns": 1, '
    '"stop_reason": "end_turn", '
    '"usage": {"input_tokens": 10, "output_tokens": 49, '
    '"cache_read_input_tokens": 10704, "cache_creation_input_tokens": 6929}, '
    '"modelUsage": {"claude-haiku-4-5-20251001": '
    '{"canonicalModel": "claude-haiku-4-5"}}}'
)


def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=main_module.app, raise_app_exceptions=False)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.fixture(autouse=True)
def _no_inherited_api_credentials(monkeypatch):
    for name in status_module.API_BILLED_VARS:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def connected(monkeypatch):
    """A green connection, so the bench is willing to send."""
    monkeypatch.setattr(status_module, "resolve_cli_path", lambda: CLI_PATH)
    monkeypatch.setattr(
        status_module,
        "_run_cli",
        lambda cli_path, args: subprocess.CompletedProcess(
            args=[cli_path],
            returncode=0,
            stdout=("1.0.0" if args[:1] == ["--version"] else SUBSCRIPTION_JSON),
            stderr="",
        ),
    )


def _capture_cli(monkeypatch, stdout: str = REPLY_JSON) -> list[list[str]]:
    """Record the argv the bench builds, without running anything."""
    calls: list[list[str]] = []
    monkeypatch.setattr(messaging, "resolve_cli_path", lambda: CLI_PATH)

    def fake_run(args, **kwargs):
        calls.append(list(args))
        return subprocess.CompletedProcess(
            args=args, returncode=0, stdout=stdout, stderr=""
        )

    monkeypatch.setattr(messaging.subprocess, "run", fake_run)
    return calls


@pytest.mark.asyncio
async def test_sends_a_message_and_reports_model_cost_and_usage(monkeypatch, connected):
    calls = _capture_cli(monkeypatch)

    async with _client() as client:
        response = await client.post(
            "/claude/test-message", json={"prompt": "ping", "model": "haiku"}
        )

    body = response.json()
    assert response.status_code == 200
    assert body["reply"] == "BENCH_OK"
    assert body["isError"] is False
    # The canonical model, not the alias that was asked for.
    assert body["model"] == "claude-haiku-4-5"
    assert body["sessionId"] == "9ad40361-fec5-4c55-b8bb-bb2fa9274959"
    assert body["costUsd"] == 0.0161
    assert body["usage"]["outputTokens"] == 49

    argv = calls[0]
    assert argv[:3] == [CLI_PATH, "--print", "ping"]
    assert "--model" in argv and argv[argv.index("--model") + 1] == "haiku"


@pytest.mark.asyncio
async def test_bench_runs_with_no_tools_no_mcp_and_no_repo_settings(
    monkeypatch, connected
):
    """The bench can only produce text.

    Same isolation as the phase-1 smoke test: an empty allow-list plus an
    explicit deny-list, no MCP servers from anywhere, and none of this repo's
    CLAUDE.md, settings or skills.
    """
    calls = _capture_cli(monkeypatch)

    async with _client() as client:
        await client.post("/claude/test-message", json={"prompt": "ping"})

    argv = calls[0]
    assert argv[argv.index("--setting-sources") + 1] == ""
    assert "--strict-mcp-config" in argv
    assert argv[argv.index("--allowed-tools") + 1] == ""
    assert "Bash" in argv and "Write" in argv and "WebFetch" in argv
    # No model flag at all when none was chosen: the CLI's own default stands.
    assert "--model" not in argv


@pytest.mark.asyncio
async def test_default_model_choice_sends_no_model_flag(monkeypatch, connected):
    calls = _capture_cli(monkeypatch)

    async with _client() as client:
        await client.post(
            "/claude/test-message", json={"prompt": "ping", "model": "default"}
        )

    assert "--model" not in calls[0]


@pytest.mark.asyncio
async def test_session_id_continues_the_conversation(monkeypatch, connected):
    calls = _capture_cli(monkeypatch)

    async with _client() as client:
        await client.post(
            "/claude/test-message",
            json={
                "prompt": "and again",
                "sessionId": "9ad40361-fec5-4c55-b8bb-bb2fa9274959",
            },
        )

    argv = calls[0]
    assert argv[argv.index("--resume") + 1] == "9ad40361-fec5-4c55-b8bb-bb2fa9274959"


@pytest.mark.asyncio
async def test_bench_refuses_to_send_when_billing_would_land_on_the_api(monkeypatch):
    """The important refusal.

    Claude would answer perfectly well here. The spend would just go to API
    billing instead of the subscription, and a bench that quietly charges the
    wrong account is worse than one that will not run.
    """
    monkeypatch.setattr(status_module, "resolve_cli_path", lambda: CLI_PATH)
    monkeypatch.setattr(
        status_module,
        "_run_cli",
        lambda cli_path, args: subprocess.CompletedProcess(
            args=[cli_path],
            returncode=0,
            stdout=("1.0.0" if args[:1] == ["--version"] else SUBSCRIPTION_JSON),
            stderr="",
        ),
    )
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-something")
    calls = _capture_cli(monkeypatch)

    async with _client() as client:
        response = await client.post("/claude/test-message", json={"prompt": "ping"})

    assert response.status_code == 409
    assert "ANTHROPIC_API_KEY" in response.json()["detail"]
    assert calls == []


@pytest.mark.asyncio
async def test_unknown_model_is_rejected_before_it_becomes_an_argument(
    monkeypatch, connected
):
    """The model value becomes a subprocess argument, so it is allow-listed."""
    calls = _capture_cli(monkeypatch)

    async with _client() as client:
        response = await client.post(
            "/claude/test-message",
            json={"prompt": "ping", "model": "--dangerously-skip-permissions"},
        )

    assert response.status_code == 400
    assert calls == []


@pytest.mark.asyncio
async def test_malformed_session_id_is_rejected(monkeypatch, connected):
    calls = _capture_cli(monkeypatch)

    async with _client() as client:
        response = await client.post(
            "/claude/test-message",
            json={"prompt": "ping", "sessionId": "--print /etc/passwd"},
        )

    assert response.status_code == 400
    assert calls == []


@pytest.mark.asyncio
async def test_empty_and_oversized_prompts_are_rejected(monkeypatch, connected):
    calls = _capture_cli(monkeypatch)

    async with _client() as client:
        blank = await client.post("/claude/test-message", json={"prompt": "   "})
        huge = await client.post(
            "/claude/test-message",
            json={"prompt": "x" * (messaging.MAX_PROMPT_CHARS + 1)},
        )

    assert blank.status_code == 400
    assert huge.status_code == 400
    assert "too long" in huge.json()["detail"]
    assert calls == []


@pytest.mark.asyncio
async def test_a_failed_resume_says_so_rather_than_blaming_the_output(
    monkeypatch, connected
):
    _capture_cli(monkeypatch, stdout="not json at all")

    async with _client() as client:
        response = await client.post(
            "/claude/test-message",
            json={
                "prompt": "ping",
                "sessionId": "6ff2a1c0-0000-4000-8000-000000000000",
            },
        )

    assert response.status_code == 400
    assert "could not continue that conversation" in response.json()["detail"]


@pytest.mark.asyncio
async def test_models_endpoint_lists_the_allow_list(monkeypatch):
    async with _client() as client:
        response = await client.get("/claude/models")

    ids = [choice["id"] for choice in response.json()["models"]]
    assert ids[0] == "default"
    assert {"haiku", "sonnet", "opus"}.issubset(set(ids))
