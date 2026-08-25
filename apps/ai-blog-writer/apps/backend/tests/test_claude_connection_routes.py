"""Claude connection status: what the nav light reads, and what it must not say."""

import subprocess

import httpx
import pytest

import app.main as main_module
from app.features.claude_connection import login as login_module
from app.features.claude_connection import routes as routes_module
from app.features.claude_connection import status as status_module

CLI_PATH = "/fake/bin/claude"

SUBSCRIPTION_JSON = (
    '{"loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty", '
    '"email": "owner@example.com", "orgId": "org-secret", '
    '"orgName": "Owner Organization", "subscriptionType": "pro"}'
)


def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=main_module.app, raise_app_exceptions=False)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


def _completed(stdout: str = "", stderr: str = "", returncode: int = 0):
    return subprocess.CompletedProcess(
        args=[CLI_PATH], returncode=returncode, stdout=stdout, stderr=stderr
    )


@pytest.fixture(autouse=True)
def _no_inherited_api_credentials(monkeypatch):
    """The developer's own .env must not decide what these tests observe."""
    for name in status_module.API_BILLED_VARS:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.delenv(login_module.ENABLE_LOGIN_ENV, raising=False)


def _stub_cli(monkeypatch, *, stdout: str, stderr: str = "", returncode: int = 0):
    monkeypatch.setattr(status_module, "resolve_cli_path", lambda: CLI_PATH)

    def fake_run(cli_path, args):
        assert cli_path == CLI_PATH
        if args[:1] == ["--version"]:
            return _completed(stdout="9.9.9 (Claude Code)")
        assert args == ["auth", "status", "--json"]
        return _completed(stdout=stdout, stderr=stderr, returncode=returncode)

    monkeypatch.setattr(status_module, "_run_cli", fake_run)


@pytest.mark.asyncio
async def test_subscription_login_reports_connected(monkeypatch):
    _stub_cli(monkeypatch, stdout=SUBSCRIPTION_JSON)

    async with _client() as client:
        response = await client.get("/claude/status")

    body = response.json()
    assert response.status_code == 200
    assert body["state"] == "connected"
    assert body["connected"] is True
    assert body["label"] == "Claude Pro"
    assert body["usesSubscription"] is True
    assert body["email"] == "owner@example.com"
    assert body["cliVersion"] == "9.9.9 (Claude Code)"


@pytest.mark.asyncio
async def test_status_returns_only_allow_listed_fields(monkeypatch):
    """A field the CLI grows later must not reach the browser on its own."""
    _stub_cli(
        monkeypatch,
        stdout=(
            '{"loggedIn": true, "authMethod": "claude.ai", '
            '"apiProvider": "firstParty", "subscriptionType": "pro", '
            '"accessToken": "sk-ant-oat-must-never-appear", '
            '"refreshToken": "must-never-appear"}'
        ),
    )

    async with _client() as client:
        response = await client.get("/claude/status")

    body = response.json()
    assert "accessToken" not in body
    assert "refreshToken" not in body
    assert "must-never-appear" not in response.text
    # orgId is dropped too: nothing in the UI needs it.
    assert "orgId" not in body


@pytest.mark.asyncio
async def test_api_key_in_environment_is_reported_as_degraded(monkeypatch):
    _stub_cli(monkeypatch, stdout=SUBSCRIPTION_JSON)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-something")

    async with _client() as client:
        response = await client.get("/claude/status")

    body = response.json()
    assert body["state"] == "api_billed_override"
    assert body["connected"] is False
    assert body["overridingEnvVars"] == ["ANTHROPIC_API_KEY"]
    # The variable is named; its value never is.
    assert "sk-ant-something" not in response.text


@pytest.mark.asyncio
async def test_console_account_is_not_treated_as_connected(monkeypatch):
    _stub_cli(
        monkeypatch,
        stdout='{"loggedIn": true, "authMethod": "console", "apiProvider": "console"}',
    )

    async with _client() as client:
        response = await client.get("/claude/status")

    body = response.json()
    assert body["state"] == "console_account"
    assert body["connected"] is False
    assert body["usesSubscription"] is False


@pytest.mark.asyncio
async def test_signed_out_and_expired_are_distinguished(monkeypatch):
    _stub_cli(monkeypatch, stdout='{"loggedIn": false}')
    async with _client() as client:
        signed_out = (await client.get("/claude/status")).json()
    assert signed_out["state"] == "not_logged_in"

    _stub_cli(
        monkeypatch,
        stdout='{"loggedIn": false}',
        stderr="Login expired, please re-authenticate",
        returncode=1,
    )
    async with _client() as client:
        expired = (await client.get("/claude/status")).json()
    assert expired["state"] == "login_expired"


@pytest.mark.asyncio
async def test_missing_cli_is_a_state_not_an_error(monkeypatch):
    monkeypatch.setattr(status_module, "resolve_cli_path", lambda: None)

    async with _client() as client:
        response = await client.get("/claude/status")

    assert response.status_code == 200
    assert response.json()["state"] == "cli_missing"


@pytest.mark.asyncio
async def test_unreadable_cli_output_is_never_echoed(monkeypatch):
    _stub_cli(monkeypatch, stdout="oauth_token=sk-ant-oat01-leak", returncode=0)

    async with _client() as client:
        response = await client.get("/claude/status")

    assert response.json()["state"] == "error"
    assert "sk-ant-oat01-leak" not in response.text


def test_login_is_offered_only_to_a_browser_on_this_machine(monkeypatch):
    monkeypatch.setattr(login_module, "resolve_cli_path", lambda: CLI_PATH)
    monkeypatch.setattr(login_module, "launcher_supported", lambda: True)

    assert login_module.login_available("127.0.0.1") is True
    assert login_module.login_available("::1") is True
    assert login_module.login_available("10.0.0.5") is False
    assert login_module.login_available(None) is False


@pytest.mark.asyncio
@pytest.mark.parametrize("supported", [True, False])
async def test_remote_caller_cannot_start_a_login(monkeypatch, supported):
    """Who is asking is settled before what this host can do.

    Parametrized over the launcher rather than left to the machine running the
    suite: without stubbing it, this asserted a 403 on macOS and a 501 on
    Linux, and only the platform decided which. A remote caller must be refused
    the same way on both.
    """
    monkeypatch.setattr(routes_module, "_client_host", lambda request: "10.0.0.5")
    monkeypatch.setattr(login_module, "launcher_supported", lambda: supported)
    monkeypatch.setattr(login_module, "resolve_cli_path", lambda: CLI_PATH)
    monkeypatch.setattr(login_module, "launch_login", _unreachable_launch)

    async with _client() as client:
        response = await client.post("/claude/login")

    assert response.status_code == 403
    assert "machine hosting this backend" in response.json()["detail"]


@pytest.mark.asyncio
async def test_local_caller_on_an_unsupported_platform_gets_the_command(monkeypatch):
    monkeypatch.setattr(routes_module, "_client_host", lambda request: "127.0.0.1")
    monkeypatch.setattr(login_module, "launcher_supported", lambda: False)
    monkeypatch.setattr(login_module, "resolve_cli_path", lambda: CLI_PATH)
    monkeypatch.setattr(login_module, "launch_login", _unreachable_launch)

    async with _client() as client:
        response = await client.post("/claude/login")

    assert response.status_code == 501
    assert "macOS" in response.json()["detail"]


@pytest.mark.asyncio
async def test_missing_cli_is_reported_as_missing_rather_than_forbidden(monkeypatch):
    monkeypatch.setattr(routes_module, "_client_host", lambda request: "127.0.0.1")
    monkeypatch.setattr(login_module, "launcher_supported", lambda: True)
    monkeypatch.setattr(login_module, "resolve_cli_path", lambda: None)
    monkeypatch.setattr(login_module, "launch_login", _unreachable_launch)

    async with _client() as client:
        response = await client.post("/claude/login")

    assert response.status_code == 501
    assert "not found on this machine" in response.json()["detail"]


@pytest.mark.asyncio
async def test_kill_switch_blocks_the_login_launcher(monkeypatch):
    monkeypatch.setenv(login_module.ENABLE_LOGIN_ENV, "0")
    monkeypatch.setattr(login_module, "launch_login", _unreachable_launch)

    async with _client() as client:
        response = await client.post("/claude/login")

    assert response.status_code == 403
    assert login_module.ENABLE_LOGIN_ENV in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_launch_returns_the_command_it_started(monkeypatch):
    monkeypatch.setattr(routes_module, "_client_host", lambda request: "127.0.0.1")
    monkeypatch.setattr(login_module, "launcher_supported", lambda: True)
    monkeypatch.setattr(login_module, "resolve_cli_path", lambda: CLI_PATH)
    monkeypatch.setattr(
        login_module, "launch_login", lambda: f"{CLI_PATH} auth login --claudeai"
    )

    async with _client() as client:
        response = await client.post("/claude/login")

    body = response.json()
    assert response.status_code == 200
    assert body["started"] is True
    assert body["command"].endswith("auth login --claudeai")


def _unreachable_launch():
    raise AssertionError("launch_login must not run when the gate refuses")


@pytest.mark.asyncio
async def test_cli_reported_api_key_source_counts_as_an_override(monkeypatch):
    """A key the CLI can see but this process's environment cannot.

    An `apiKeyHelper`, a settings file, or a shell profile the backend never
    loaded all reach the CLI without appearing in `os.environ`. The CLI says so
    itself, and that has to be believed over the environment sniff.
    """
    _stub_cli(
        monkeypatch,
        stdout=(
            '{"loggedIn": true, "authMethod": "claude.ai", '
            '"apiProvider": "firstParty", "subscriptionType": "pro", '
            '"apiKeySource": "ANTHROPIC_API_KEY"}'
        ),
    )

    async with _client() as client:
        response = await client.get("/claude/status")

    body = response.json()
    assert body["state"] == "api_billed_override"
    assert body["connected"] is False
    assert body["apiKeySource"] == "ANTHROPIC_API_KEY"
    # Named once, not twice, when the environment sniff agrees.
    assert body["detail"].count("ANTHROPIC_API_KEY") == 1


@pytest.mark.asyncio
async def test_status_survives_a_cli_that_cannot_read_the_keychain(monkeypatch):
    """Partial output is a real state, not a crash.

    A backend spawned outside the owner's login session can be refused Keychain
    access, and the CLI then answers "logged in" with no account detail. The
    light must still render.
    """
    _stub_cli(
        monkeypatch,
        stdout=(
            '{"loggedIn": true, "authMethod": "claude.ai", '
            '"apiProvider": "firstParty"}'
        ),
    )

    async with _client() as client:
        response = await client.get("/claude/status")

    body = response.json()
    assert body["state"] == "connected"
    assert body["label"] == "Claude Connected"
    assert body["subscriptionType"] is None
