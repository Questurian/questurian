"""Send one test message to Claude through the Claude Code CLI.

This is a **bench**, not the writing pipeline. It exists so the owner can ask
"does Claude answer, on which model, and what did it cost" without wiring
anything into the article stages.

Why the CLI rather than the Agent SDK: installing ``claude-agent-sdk`` into the
shared backend virtualenv pulls in ``mcp``, which drags ``starlette`` and
``uvicorn`` past the versions FastAPI 0.111 pins, and that breaks the backend.
The CLI is the same subscription-authenticated transport with no dependency at
all -- it is already on the machine, and this module already shells out to it
for ``claude auth status``. Choosing a real transport for the pipeline is a
separate decision (a sidecar with its own venv is the standing recommendation);
nothing here presumes that answer.

Isolation matches the phase-1 smoke test: no tools, no MCP servers, no repo
``CLAUDE.md`` / settings / skills, and a working directory outside the repo. A
test message can only produce text.
"""

import json
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Optional

from app.features.claude_connection.status import resolve_cli_path

MAX_PROMPT_CHARS = 8000
CALL_TIMEOUT_SECONDS = 180.0

# A stable directory outside the repo. Stable because `--resume` keys a session
# to its working directory as well as its id, so a fresh temp dir per call
# would silently break conversation continuity.
WORKING_DIR = Path(tempfile.gettempdir()) / "abw-claude-test-bench"

# Only these reach the `--model` flag. An allow-list rather than validation
# because the value becomes a subprocess argument, and "looks fine" is a weaker
# guarantee than "is one of five known strings".
MODEL_CHOICES: tuple[dict[str, str], ...] = (
    {
        "id": "default",
        "label": "Default",
        "note": "Whatever Claude Code is configured to use.",
    },
    {
        "id": "haiku",
        "label": "Haiku",
        "note": "Fastest and cheapest. Good for checking the wiring works.",
    },
    {
        "id": "sonnet",
        "label": "Sonnet",
        "note": "Balanced. The usual working model.",
    },
    {
        "id": "opus",
        "label": "Opus",
        "note": "Most capable, most expensive per message.",
    },
    {
        "id": "fable",
        "label": "Fable",
        "note": "Writing-oriented model.",
    },
)

VALID_MODEL_IDS = frozenset(choice["id"] for choice in MODEL_CHOICES)

# Session ids come back as UUIDs today, but this deliberately does not demand
# one: the id is echoed straight from a previous reply, so pinning the format
# would break `--resume` the day the CLI changes it. What it does enforce is
# that the value cannot be mistaken for a flag or carry shell metacharacters,
# which is the actual risk in passing it as a subprocess argument.
_SESSION_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$")

# Empty allow-list plus an explicit deny-list, so a future change to the CLI's
# default tool set cannot quietly grant one to a bench that only needs text.
DENIED_TOOLS = (
    "Bash",
    "BashOutput",
    "Edit",
    "Glob",
    "Grep",
    "KillShell",
    "NotebookEdit",
    "Read",
    "Task",
    "TodoWrite",
    "WebFetch",
    "WebSearch",
    "Write",
)


class TestMessageError(RuntimeError):
    """A test message that could not be sent at all."""


def is_valid_model(model_id: Optional[str]) -> bool:
    return model_id is None or model_id in VALID_MODEL_IDS


def is_valid_session_id(session_id: Optional[str]) -> bool:
    return session_id is None or bool(_SESSION_ID_PATTERN.match(session_id))


def _build_args(
    cli_path: str,
    prompt: str,
    model_id: Optional[str],
    session_id: Optional[str],
) -> list[str]:
    args = [
        cli_path,
        "--print",
        prompt,
        "--output-format",
        "json",
        # No project or user settings, and no MCP servers from anywhere.
        "--setting-sources",
        "",
        "--strict-mcp-config",
        "--allowed-tools",
        "",
        "--disallowed-tools",
        *DENIED_TOOLS,
    ]

    if model_id and model_id != "default":
        args += ["--model", model_id]

    if session_id:
        args += ["--resume", session_id]

    return args


def _usage_from(payload: dict[str, Any]) -> dict[str, Optional[int]]:
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        usage = {}

    def read(key: str) -> Optional[int]:
        value = usage.get(key)
        return value if isinstance(value, int) else None

    return {
        "inputTokens": read("input_tokens"),
        "outputTokens": read("output_tokens"),
        "cacheReadInputTokens": read("cache_read_input_tokens"),
        "cacheCreationInputTokens": read("cache_creation_input_tokens"),
    }


def _canonical_model(payload: dict[str, Any]) -> Optional[str]:
    """The model the CLI actually used, rather than the alias that was asked for.

    Worth reporting: 'sonnet' is a moving target, and a bench whose whole job is
    to answer "did this work, on what" should name the thing that answered.
    """
    model_usage = payload.get("modelUsage")
    if not isinstance(model_usage, dict) or not model_usage:
        return None
    first_key = next(iter(model_usage))
    entry = model_usage[first_key]
    if isinstance(entry, dict):
        canonical = entry.get("canonicalModel")
        if isinstance(canonical, str) and canonical.strip():
            return canonical.strip()
    return str(first_key)


def _as_optional_str(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def send_test_message(
    prompt: str,
    model_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    """Ask Claude one question and report the answer plus what it cost.

    Raises TestMessageError when the call could not be made or its output could
    not be read. A model that answers with an error of its own comes back
    normally with ``isError`` set, because that is a result worth seeing.
    """
    cleaned = prompt.strip()
    if not cleaned:
        raise TestMessageError("Enter a message to send.")
    if len(cleaned) > MAX_PROMPT_CHARS:
        raise TestMessageError(
            f"Message is too long: {len(cleaned)} characters, "
            f"limit {MAX_PROMPT_CHARS}."
        )
    if not is_valid_model(model_id):
        raise TestMessageError(f"Unknown model: {model_id}")
    if not is_valid_session_id(session_id):
        raise TestMessageError("That conversation id is not in a form this accepts.")

    cli_path = resolve_cli_path()
    if cli_path is None:
        raise TestMessageError("The Claude Code CLI was not found on this machine.")

    WORKING_DIR.mkdir(parents=True, exist_ok=True)

    try:
        completed = subprocess.run(
            _build_args(cli_path, cleaned, model_id, session_id),
            capture_output=True,
            text=True,
            timeout=CALL_TIMEOUT_SECONDS,
            check=False,
            cwd=WORKING_DIR,
            # The CLI waits ~3s for piped stdin before giving up and warning
            # about it, even when the prompt came in as an argument. Under a
            # server that inherited stdin from its parent that wait is paid on
            # every call. Closing it removes about 3.7s of pure latency.
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired as error:
        raise TestMessageError(
            f"Claude did not answer within {int(CALL_TIMEOUT_SECONDS)}s."
        ) from error
    except (OSError, subprocess.SubprocessError) as error:
        raise TestMessageError(
            f"Could not run the Claude CLI: {type(error).__name__}"
        ) from error

    try:
        payload = json.loads(completed.stdout or "")
    except (TypeError, ValueError) as error:
        # A failed resume is the common cause and has a specific fix, so it is
        # worth naming rather than reporting as unreadable output.
        if session_id:
            raise TestMessageError(
                "Claude could not continue that conversation. Start a new one."
            ) from error
        raise TestMessageError(
            "Claude answered with output this app could not read."
        ) from error

    if not isinstance(payload, dict):
        raise TestMessageError("Claude answered with output this app could not read.")

    cost = payload.get("total_cost_usd")
    duration = payload.get("duration_ms")
    turns = payload.get("num_turns")

    return {
        "reply": _as_optional_str(payload.get("result")) or "",
        "isError": bool(payload.get("is_error")),
        "model": _canonical_model(payload),
        "sessionId": _as_optional_str(payload.get("session_id")),
        "costUsd": cost if isinstance(cost, (int, float)) else None,
        "durationMs": duration if isinstance(duration, int) else None,
        "numTurns": turns if isinstance(turns, int) else None,
        "stopReason": _as_optional_str(payload.get("stop_reason")),
        "usage": _usage_from(payload),
    }
