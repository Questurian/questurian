"""Start an interactive Claude sign-in from the app, without touching the token.

The Connect button does not perform OAuth. It asks the operating system to open
a terminal running ``claude auth login --claudeai``, which is the ordinary
Claude Code browser login. The token it produces goes into the Keychain, where
Claude Code puts it; this backend never sees it, stores it, or forwards it.
That distinction is the whole design: Anthropic's terms forbid collecting,
storing, or intermediating Claude.ai credentials
(https://code.claude.com/docs/en/legal-and-compliance).

Two gates decide whether the button is offered at all:

- **Loopback only.** The login it starts signs in *the machine running this
  backend*, not the person who clicked. On a shared deployment that would mean
  one staff member's click re-pointing everyone's Claude session -- the exact
  shared-credential arrangement the terms rule out. A browser on the host is
  the only caller that can be the plan holder, so remote callers are refused.
- **A kill switch.** ``ABW_ENABLE_CLAUDE_LOGIN=0`` turns it off outright, for a
  deployment that reaches the backend over loopback through a proxy.
"""

import os
import platform
import shlex
import subprocess
from typing import Optional

from app.features.claude_connection.status import resolve_cli_path

ENABLE_LOGIN_ENV = "ABW_ENABLE_CLAUDE_LOGIN"
LOGIN_COMMAND_ARGS = ("auth", "login", "--claudeai")
LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"}


def login_enabled() -> bool:
    """Whether the kill switch leaves the sign-in launcher available."""
    raw = os.getenv(ENABLE_LOGIN_ENV, "").strip().lower()
    if not raw:
        return True
    return raw in {"1", "true", "yes", "on"}


def is_loopback_client(client_host: Optional[str]) -> bool:
    return bool(client_host) and client_host in LOOPBACK_HOSTS


def login_command(cli_path: Optional[str] = None) -> str:
    """The command the owner can paste into a terminal themselves.

    Always offered, including where the launcher is unavailable, so the
    fallback path is a copyable command rather than a dead end.
    """
    resolved = cli_path or resolve_cli_path() or "claude"
    return f"{shlex.quote(resolved)} {' '.join(LOGIN_COMMAND_ARGS)}"


def launcher_supported() -> bool:
    """Whether this OS has a terminal this module knows how to open.

    ``claude auth login`` is interactive and wants a TTY, so it cannot simply
    be spawned headlessly from a request handler. Only macOS is wired up, which
    is the platform this app is authored on; everywhere else the UI falls back
    to the copyable command.
    """
    return platform.system() == "Darwin"


def login_available(client_host: Optional[str]) -> bool:
    return (
        login_enabled()
        and launcher_supported()
        and is_loopback_client(client_host)
        and resolve_cli_path() is not None
    )


def _applescript_for(command: str) -> str:
    escaped = command.replace("\\", "\\\\").replace('"', '\\"')
    return (
        f'tell application "Terminal" to do script "{escaped}"\n'
        'tell application "Terminal" to activate'
    )


def launch_login() -> str:
    """Open a terminal running the Claude sign-in. Returns the command shown.

    Raises RuntimeError when the CLI is missing or the terminal will not open;
    the route turns that into a message plus the copyable fallback.
    """
    cli_path = resolve_cli_path()
    if cli_path is None:
        raise RuntimeError("The Claude Code CLI was not found on this machine.")

    command = login_command(cli_path)

    try:
        completed = subprocess.run(
            ["osascript", "-e", _applescript_for(command)],
            capture_output=True,
            text=True,
            timeout=20.0,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise RuntimeError(
            f"Could not open a terminal: {type(error).__name__}"
        ) from error

    if completed.returncode != 0:
        raise RuntimeError("Could not open a terminal to run the sign-in.")

    return command
