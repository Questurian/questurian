"""Writer transport that answers on the Claude Code CLI's subscription login.

This is the pipeline-facing sibling of ``messaging.py``. The bench answers "does
Claude reply and what did it cost"; this answers the two questions the article
stages actually ask -- give me prose, and give me JSON in this shape -- behind
the ``WriterResult`` / ``StructuredWriterResult`` contract the Gemini path
already satisfies.

Why the CLI and not the Agent SDK
---------------------------------
Installing ``claude-agent-sdk`` into the shared backend virtualenv pulls in
``mcp``, which drags ``starlette`` and ``uvicorn`` past the versions FastAPI
0.111 pins. The CLI needs no dependency at all, and it turns out to give away
nothing that mattered:

* ``--json-schema`` is a real forced-tool equivalent. The CLI returns a
  ``structured_output`` field that is already a parsed object, and the reply
  comes back with ``stop_reason: "tool_use"``. Measured against the pipeline's
  own SEO schema and a harder nested one, it honours ``required``, ``enum``,
  array bounds, integer types, and ``additionalProperties: false`` -- including
  refusing an extra field a prompt explicitly asked it to add.
* ``total_cost_usd`` and ``usage.*`` come back per call, which is what per-stage
  cost attribution needs.

What that means for cost, which drove the design here
-----------------------------------------------------
A call carrying the CLI's default system prompt writes ~18k cache-creation
tokens (~$0.037). Replacing it with ``--system-prompt`` cuts that to ~11k, and
-- the part that matters -- a *second independent* call sharing the same system
prompt and the same schema reads that prefix from cache instead of writing it
(~$0.010).

So the prefix is only cheap if it is *identical* across calls. That is why
``SYSTEM_PROMPT`` is a module constant rather than a per-stage string, and why
stage-specific instructions belong in the prompt body. Session threading via
``--resume`` is marginally cheaper still, but it couples a stage to a
conversation and leaks one stage's context into the next; independent calls that
warm their own cache are worth the difference.
"""

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Optional

from app.features.claude_connection.status import (
    STATE_CONNECTED,
    read_claude_status,
    resolve_cli_path,
)

# What this flag actually reaches, which is less than its name suggests.
#
# Only calls that go through ``app.shared.writer_invocation`` -- editor_assist
# and itineraries_pipeline. Prompt2Blog, url2blog, and youtube2blog call
# ``utils.get_vertex_llm`` directly and bypass that seam entirely, so they are
# untouched by this flag no matter what it is set to. Widening it means adding a
# provider inside ``packages/utils``, which is shared with url2blog and
# youtube2blog; that was considered and deliberately deferred rather than done
# quietly here.
#
# Practical consequence worth knowing before switching this on: Prompt2Blog's
# model stacks are unaffected, and a stack that names a Claude model is still
# substituted to Gemini by ``resolve_effective_model`` because that is governed
# by ANTHROPIC_MODELS_ENABLED -- a different switch, on the API-key path, which
# has nothing to do with this one.
WRITER_PROVIDER_ENV = "WRITER_PROVIDER"

# The one value that turns this transport on. Anything else -- including unset,
# which is the default -- leaves the Gemini path untouched.
PROVIDER_CLAUDE_CLI = "claude-cli"

CALL_TIMEOUT_SECONDS = 600.0

# Stable, and outside the repo so no CLAUDE.md, settings file, or skill is
# discovered. Stable also because a moving working directory would defeat the
# prompt cache the cost model above depends on.
WORKING_DIR = Path(tempfile.gettempdir()) / "abw-claude-writer"

# Deliberately terse and deliberately constant. Every character here is paid for
# once and then read from cache by every later call; per-stage text would turn
# each stage into its own cold start. See the module docstring.
SYSTEM_PROMPT = (
    "You are a writing engine inside an editorial publishing pipeline. "
    "Follow the instructions in the message exactly. Return only what is "
    "asked for, with no preamble, commentary, or explanation of your work."
)

# Requested model names arrive as pipeline strings ("claude-sonnet-5") and have
# to become CLI aliases. An allow-list, not a transformation, because the value
# becomes a subprocess argument and "is one of five known strings" is a stronger
# guarantee than "looks like a model name".
MODEL_ALIASES: dict[str, str] = {
    "claude-opus-5": "opus",
    "claude-opus-4-8": "opus",
    "claude-opus-4-7": "opus",
    "claude-sonnet-5": "sonnet",
    "claude-opus-5-medium": "opus",
    "claude-opus-5-high": "opus",
    "claude-opus-5-xhigh": "opus",
    "claude-opus-5-max": "opus",
    "claude-sonnet-5-medium": "sonnet",
    "claude-sonnet-5-high": "sonnet",
    "claude-sonnet-5-xhigh": "sonnet",
    "claude-sonnet-5-max": "sonnet",
    "claude-haiku-4-5": "haiku",
    "claude-fable-5": "fable",
    "opus": "opus",
    "sonnet": "sonnet",
    "haiku": "haiku",
    "fable": "fable",
}

MODEL_EFFORTS: dict[str, str] = {
    f"claude-{family}-5-{effort}": effort
    for family in ("opus", "sonnet")
    for effort in ("medium", "high", "xhigh", "max")
}

# What a non-Claude request maps to when this provider is switched on. The
# pipeline pins Gemini names in places (see editor_assist), and refusing them
# would make the flag unusable; serving them on the balanced model is the
# behaviour a reader of `WRITER_PROVIDER=claude-cli` would expect.
DEFAULT_ALIAS = "sonnet"

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


# A refusal does not arrive shaped like a refusal.
#
# Asking for a model this plan cannot serve returns `subtype: "success"` with
# the apology sitting in `result` -- "You've hit your monthly spend limit.
# Switch to another model..." -- alongside `is_error: true`,
# `terminal_reason: "api_error"` and `total_cost_usd: 0`. A caller that trusts
# `subtype` and reads `result` publishes that sentence as article prose.
#
# So `subtype` is not evidence of anything and is not consulted. Three things
# are checked instead, at the one chokepoint both call shapes go through:
#
#   is_error          the flag that was actually set on the observed refusal.
#   terminal_reason   named reasons a run stopped without answering. A deny
#                     list, not an allow list: the CLI is free to add new
#                     benign values, and failing an unrecognised one would
#                     break working calls on a version bump.
#   output tokens     zero generated tokens means the model wrote nothing, so
#                     whatever is in `result` came from the harness rather than
#                     from Claude. This is the check that does not depend on
#                     guessing which flags a future refusal will carry.
FAILED_TERMINAL_REASONS = frozenset(
    {
        "api_error",
        "budget_exhausted",
        "error",
        "error_during_execution",
        "max_turns",
        "refusal",
        "timeout",
    }
)


class ClaudeCliWriterError(RuntimeError):
    """A writer call that could not be made, or whose output was unusable."""


def writer_provider() -> str:
    return (os.getenv(WRITER_PROVIDER_ENV) or "").strip().lower()


def claude_cli_writer_enabled() -> bool:
    """Whether pipeline writer calls should go to the subscription CLI.

    Off unless asked for. The flag is the whole opt-in: there is no automatic
    promotion based on what is installed or logged in, because that would move
    real spend onto the owner's personal plan without anyone choosing it.
    """
    return writer_provider() == PROVIDER_CLAUDE_CLI


def resolve_alias(model_name: Optional[str]) -> str:
    return MODEL_ALIASES.get(str(model_name or "").strip().lower(), DEFAULT_ALIAS)


def resolve_effort(model_name: Optional[str]) -> str | None:
    return MODEL_EFFORTS.get(str(model_name or "").strip().lower())


def _assert_billing_to_subscription() -> None:
    """Refuse to spend unless the money lands where the operator thinks it does.

    The state worth guarding is ``api_billed_override``: Claude answers fine, so
    nothing looks wrong, and every stage of every run quietly bills API credit
    instead of the subscription. Same guard the bench uses, for the same reason,
    and it matters more here because the pipeline makes many calls per article.
    """
    snapshot = read_claude_status()
    if snapshot.get("state") != STATE_CONNECTED:
        raise ClaudeCliWriterError(
            snapshot.get("detail")
            or "Claude is not connected on this machine, so nothing was sent."
        )


def _build_args(
    cli_path: str,
    prompt: str,
    alias: str,
    input_schema: Optional[dict[str, Any]],
    effort: str | None = None,
) -> list[str]:
    args = [
        cli_path,
        "--print",
        prompt,
        "--output-format",
        "json",
        "--system-prompt",
        SYSTEM_PROMPT,
        # No user, project, or local settings, and no MCP server from anywhere.
        "--setting-sources",
        "",
        "--strict-mcp-config",
        "--allowed-tools",
        "",
        "--disallowed-tools",
        *DENIED_TOOLS,
        "--model",
        alias,
    ]
    if effort is not None:
        args += ["--effort", effort]
    if input_schema is not None:
        args += ["--json-schema", json.dumps(input_schema, sort_keys=True)]
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


def _canonical_model(payload: dict[str, Any], alias: str) -> str:
    """The model that actually answered, not the alias that was asked for.

    Worth carrying into cost attribution: 'sonnet' is a moving target, so a
    per-stage spend record keyed on the alias would not say what it paid for.
    """
    model_usage = payload.get("modelUsage")
    if isinstance(model_usage, dict) and model_usage:
        first_key = next(iter(model_usage))
        entry = model_usage[first_key]
        if isinstance(entry, dict):
            canonical = entry.get("canonicalModel")
            if isinstance(canonical, str) and canonical.strip():
                return canonical.strip()
        return str(first_key)
    return alias


def _invoke(
    prompt: str,
    model_name: Optional[str],
    input_schema: Optional[dict[str, Any]],
) -> tuple[dict[str, Any], str]:
    cleaned = (prompt or "").strip()
    if not cleaned:
        raise ClaudeCliWriterError("Writer call had an empty prompt")

    _assert_billing_to_subscription()

    cli_path = resolve_cli_path()
    if cli_path is None:
        raise ClaudeCliWriterError("The Claude Code CLI was not found on this machine.")

    alias = resolve_alias(model_name)
    effort = resolve_effort(model_name)
    WORKING_DIR.mkdir(parents=True, exist_ok=True)

    try:
        completed = subprocess.run(
            _build_args(cli_path, cleaned, alias, input_schema, effort),
            capture_output=True,
            text=True,
            timeout=CALL_TIMEOUT_SECONDS,
            check=False,
            cwd=WORKING_DIR,
            # The CLI waits ~3s for piped stdin that is never coming, even when
            # the prompt arrived as an argument. Measured at ~3.7s of pure
            # latency per call under a server that inherited stdin.
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired as error:
        raise ClaudeCliWriterError(
            f"Claude did not answer within {int(CALL_TIMEOUT_SECONDS)}s."
        ) from error
    except (OSError, subprocess.SubprocessError) as error:
        raise ClaudeCliWriterError(
            f"Could not run the Claude CLI: {type(error).__name__}"
        ) from error

    # Never surface raw stdout or stderr. On a hard CLI failure stdout is empty
    # and the reason is on stderr, and stderr is the one place a credential
    # could appear -- these strings reach an API response.
    try:
        payload = json.loads(completed.stdout or "")
    except (TypeError, ValueError) as error:
        raise ClaudeCliWriterError(
            "Claude answered with output this app could not read."
        ) from error

    if not isinstance(payload, dict):
        raise ClaudeCliWriterError(
            "Claude answered with output this app could not read."
        )
    _assert_claude_actually_answered(payload)

    return payload, alias


def _assert_claude_actually_answered(payload: dict[str, Any]) -> None:
    """Reject a reply that carries a refusal instead of an answer.

    See FAILED_TERMINAL_REASONS above for why this is three checks and why
    ``subtype`` is not one of them.
    """
    if payload.get("is_error"):
        raise ClaudeCliWriterError("Claude reported an error answering the call.")

    reason = payload.get("terminal_reason")
    if isinstance(reason, str) and reason.strip().lower() in FAILED_TERMINAL_REASONS:
        raise ClaudeCliWriterError(
            "Claude stopped without answering the call, so nothing was used."
        )

    # Absent rather than zero means the CLI did not report it; only a reported
    # zero is evidence that nothing was generated.
    output_tokens = _usage_from(payload).get("outputTokens")
    if output_tokens == 0:
        raise ClaudeCliWriterError(
            "Claude generated no output, so its reply was not used."
        )


def invoke_text(
    *,
    prompt: str,
    model_name: Optional[str] = None,
) -> dict[str, Any]:
    """Free-text writer call. Returns the reply plus what it cost."""
    payload, alias = _invoke(prompt, model_name, None)

    result = payload.get("result")
    text = result.strip() if isinstance(result, str) else ""
    if not text:
        raise ClaudeCliWriterError("Writer model returned empty content")

    return {
        "text": text,
        "modelName": _canonical_model(payload, alias),
        "costUsd": _cost_of(payload),
        "usage": _usage_from(payload),
    }


def frame_schema_prompt(
    prompt: str,
    *,
    tool_name: str,
    tool_description: str,
) -> str:
    """Restate a forced-tool instruction as something the CLI can honour.

    ``--json-schema`` forces the shape without naming a tool, so a prompt ending
    "call the emit_seo_patch tool" would be an instruction about something that
    does not exist. Dropping the caller's wording instead would lose the
    description, which is often the only place the semantics of the schema are
    written down.
    """
    return (
        f"{prompt}\n\n"
        f"Return your answer as JSON matching the required schema "
        f"({tool_name}): {tool_description}"
    )


def invoke_structured(
    *,
    prompt: str,
    input_schema: dict[str, Any],
    model_name: Optional[str] = None,
) -> dict[str, Any]:
    """Schema-shaped writer call. Returns the parsed payload plus what it cost.

    Reads ``structured_output`` rather than parsing ``result``. Both carry the
    same JSON, but ``result`` is a string the model produced and
    ``structured_output`` is the object the CLI validated against the schema, so
    only one of them is a guarantee.
    """
    if not isinstance(input_schema, dict) or not input_schema:
        raise ClaudeCliWriterError("Structured writer call had no schema")

    payload, alias = _invoke(prompt, model_name, input_schema)

    structured = payload.get("structured_output")
    if not isinstance(structured, dict) or not structured:
        raise ClaudeCliWriterError("Structured writer call returned no schema payload")

    return {
        "payload": structured,
        "modelName": _canonical_model(payload, alias),
        "costUsd": _cost_of(payload),
        "usage": _usage_from(payload),
    }


def _cost_of(payload: dict[str, Any]) -> Optional[float]:
    cost = payload.get("total_cost_usd")
    return float(cost) if isinstance(cost, (int, float)) else None
