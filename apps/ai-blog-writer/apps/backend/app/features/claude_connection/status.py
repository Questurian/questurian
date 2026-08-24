"""Read the machine's Claude Code login state -- status only, never credentials.

The Agent SDK authenticates with the Claude Code OAuth session the owner
created with ``claude auth login``. That session **expires**. Claude Code warns
about it in its own terminal UI; a backend calling the SDK gets no such warning
and simply starts failing. This module is the advance signal: it shells out to
``claude auth status --json`` and reports what it says.

Two rules shape everything here:

- **Status, not credentials.** ``claude auth status`` does not print the token,
  and this module additionally copies out an explicit allow-list of fields, so
  a future CLI that started emitting one could not leak it through this API.
  Nothing here reads the Keychain, and nothing here logs the CLI's raw output.
- **API-billed credentials outrank the subscription.** ``ANTHROPIC_API_KEY``
  and friends win over the OAuth login, which would silently move spend onto
  separately billed API credits. The same list the phase-1 smoke test aborts on
  (``scripts/claude-agent-sdk-smoke/smoke_test.py``) is treated as a degraded
  state here rather than a green light.
"""

import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Environment variables that take precedence over the subscription login.
# https://code.claude.com/docs/en/authentication#authentication-precedence
API_BILLED_VARS = (
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
    "ANTHROPIC_PROFILE",
)

CLI_PATH_ENV = "ABW_CLAUDE_CLI"
CLI_TIMEOUT_SECONDS = 20.0

# Fallback locations for a CLI that is installed but not on the backend's PATH.
# A GUI-launched or systemd-launched process often has a much shorter PATH than
# the owner's login shell, so "not on PATH" is not the same as "not installed".
FALLBACK_CLI_PATHS = (
    Path.home() / ".local/bin/claude",
    Path("/opt/homebrew/bin/claude"),
    Path("/usr/local/bin/claude"),
)

STATE_CONNECTED = "connected"
STATE_NOT_LOGGED_IN = "not_logged_in"
STATE_LOGIN_EXPIRED = "login_expired"
STATE_API_BILLED_OVERRIDE = "api_billed_override"
STATE_CONSOLE_ACCOUNT = "console_account"
STATE_CLI_MISSING = "cli_missing"
STATE_ERROR = "error"

# Substrings the CLI uses when a session existed but has lapsed. Distinguishing
# this from "never logged in" matters: expiry is the failure the owner needs
# warning about, and it is the one that comes back with a re-login rather than
# with setup.
_EXPIRED_MARKERS = ("expired", "re-authenticate", "reauthenticate")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def resolve_cli_path() -> Optional[str]:
    """Absolute path to the Claude Code CLI, or None when it is not installed."""
    override = os.getenv(CLI_PATH_ENV, "").strip()
    if override:
        return override if Path(override).exists() else None

    found = shutil.which("claude")
    if found:
        return found

    for candidate in FALLBACK_CLI_PATHS:
        if candidate.exists():
            return str(candidate)

    return None


def overriding_env_vars() -> list[str]:
    """API-billed credentials present in this process's environment."""
    return [name for name in API_BILLED_VARS if os.environ.get(name, "").strip()]


def _run_cli(cli_path: str, args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [cli_path, *args],
        capture_output=True,
        text=True,
        timeout=CLI_TIMEOUT_SECONDS,
        check=False,
    )


def _read_cli_version(cli_path: str) -> Optional[str]:
    try:
        completed = _run_cli(cli_path, ["--version"])
    except (OSError, subprocess.SubprocessError):
        return None
    output = (completed.stdout or "").strip()
    return output or None


def _as_optional_str(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _expires_in_days(payload: dict[str, Any]) -> Optional[int]:
    """Days until the OAuth session lapses, when the CLI names an expiry.

    Claude Code ``2.1.237`` does not report one, so this is None in practice
    today. It is read defensively rather than left out because expiry is the
    whole reason this endpoint exists, and a later CLI adding the field should
    light up the countdown without another round of backend work.
    """
    raw = payload.get("expiresAt")

    if isinstance(raw, (int, float)):
        # Seconds or milliseconds since epoch, the way Payload sessions vary.
        seconds = raw / 1000 if raw > 10_000_000_000 else raw
        try:
            expires = datetime.fromtimestamp(seconds, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    elif isinstance(raw, str) and raw.strip():
        try:
            expires = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
    else:
        return None

    remaining = expires - datetime.now(timezone.utc)
    return max(0, remaining.days)


def _base_snapshot() -> dict[str, Any]:
    return {
        "state": STATE_ERROR,
        "connected": False,
        "label": "Claude Unknown",
        "detail": None,
        "loggedIn": None,
        "authMethod": None,
        "apiProvider": None,
        "subscriptionType": None,
        "email": None,
        "orgName": None,
        "usesSubscription": False,
        "apiKeySource": None,
        "expiresInDays": None,
        "overridingEnvVars": [],
        "cliPath": None,
        "cliVersion": None,
        "checkedAt": _now_iso(),
    }


def _looks_expired(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in _EXPIRED_MARKERS)


def read_claude_status() -> dict[str, Any]:
    """Current Claude Code login state, as a JSON-safe dict.

    Never raises: every failure mode is a state the nav light can render. A
    status endpoint that 500s tells the owner nothing about *why* Claude is
    unreachable, which is the one thing it exists to say.
    """
    snapshot = _base_snapshot()
    snapshot["overridingEnvVars"] = overriding_env_vars()

    cli_path = resolve_cli_path()
    if not cli_path:
        snapshot.update(
            state=STATE_CLI_MISSING,
            label="Claude CLI Missing",
            detail=(
                "The Claude Code CLI was not found on this machine. Install it, "
                f"or point {CLI_PATH_ENV} at it."
            ),
        )
        return snapshot

    snapshot["cliPath"] = cli_path

    try:
        completed = _run_cli(cli_path, ["auth", "status", "--json"])
    except subprocess.TimeoutExpired:
        snapshot.update(
            state=STATE_ERROR,
            label="Claude Unreachable",
            detail=(
                f"`claude auth status` did not answer within "
                f"{int(CLI_TIMEOUT_SECONDS)}s."
            ),
        )
        return snapshot
    except (OSError, subprocess.SubprocessError) as error:
        snapshot.update(
            state=STATE_ERROR,
            label="Claude Unreachable",
            detail=f"Could not run the Claude CLI: {type(error).__name__}",
        )
        return snapshot

    snapshot["cliVersion"] = _read_cli_version(cli_path)

    stdout = completed.stdout or ""
    stderr = completed.stderr or ""

    try:
        payload = json.loads(stdout)
    except (TypeError, ValueError):
        payload = None

    if not isinstance(payload, dict):
        # Deliberately does not echo stdout/stderr: the CLI's raw output is the
        # one place a future credential could appear, and this string is
        # rendered in a browser.
        expired = _looks_expired(f"{stdout}\n{stderr}")
        snapshot.update(
            state=STATE_LOGIN_EXPIRED if expired else STATE_ERROR,
            label="Claude Login Expired" if expired else "Claude Unreachable",
            detail=(
                "The Claude login has expired. Sign in again to restore it."
                if expired
                else "`claude auth status` returned output this app could not read."
            ),
        )
        return snapshot

    logged_in = bool(payload.get("loggedIn"))
    auth_method = _as_optional_str(payload.get("authMethod"))
    api_provider = _as_optional_str(payload.get("apiProvider"))

    snapshot.update(
        loggedIn=logged_in,
        authMethod=auth_method,
        apiProvider=api_provider,
        # The CLI's own account of which API key it can see. More
        # authoritative than reading this process's environment, because it
        # also catches a key reaching the CLI some other way -- a settings
        # file, an `apiKeyHelper`, a shell profile this backend never loaded.
        apiKeySource=_as_optional_str(payload.get("apiKeySource")),
        subscriptionType=_as_optional_str(payload.get("subscriptionType")),
        email=_as_optional_str(payload.get("email")),
        orgName=_as_optional_str(payload.get("orgName")),
        expiresInDays=_expires_in_days(payload),
    )
    snapshot["usesSubscription"] = (
        logged_in and auth_method == "claude.ai" and api_provider == "firstParty"
    )

    if not logged_in:
        expired = _looks_expired(stderr)
        snapshot.update(
            state=STATE_LOGIN_EXPIRED if expired else STATE_NOT_LOGGED_IN,
            label="Claude Login Expired" if expired else "Claude Signed Out",
            detail=(
                "The Claude login has expired. Sign in again to restore it."
                if expired
                else "No Claude account is signed in on this machine."
            ),
        )
        return snapshot

    # Signed in, but something outranks the subscription. Both branches below
    # would still answer requests -- they would just bill somewhere else, which
    # is exactly what this project does not want to discover from an invoice.
    named_sources = list(snapshot["overridingEnvVars"])
    api_key_source = snapshot["apiKeySource"]
    if api_key_source and api_key_source not in named_sources:
        named_sources.append(api_key_source)

    if named_sources:
        snapshot.update(
            state=STATE_API_BILLED_OVERRIDE,
            label="Claude Billing Override",
            detail=(
                "Signed in, but "
                + ", ".join(named_sources)
                + " outranks the subscription login, so requests would bill as "
                "API usage. Unset it and restart the backend."
            ),
        )
        return snapshot

    if not snapshot["usesSubscription"]:
        snapshot.update(
            state=STATE_CONSOLE_ACCOUNT,
            label="Claude On API Billing",
            detail=(
                "Signed in to an Anthropic Console account rather than a Claude "
                "subscription, so requests bill as API usage. Sign in again with "
                "the Claude subscription to change that."
            ),
        )
        return snapshot

    plan = snapshot["subscriptionType"]
    snapshot.update(
        state=STATE_CONNECTED,
        connected=True,
        label=f"Claude {plan.title()}" if plan else "Claude Connected",
        detail=None,
    )
    return snapshot
