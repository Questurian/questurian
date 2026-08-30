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
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from typing import Any, NoReturn, Optional

from app.features.claude_connection.status import (
    API_BILLED_VARS,
    STATE_CONNECTED,
    read_claude_status,
    resolve_cli_path,
)

_PROMPT2BLOG_OAUTH_TOKEN: ContextVar[str | None] = ContextVar(
    "prompt2blog_claude_oauth_token",
    default=None,
)

# The run-scoped stop switch. Once one call comes back out of allowance, every
# later call in the same run is refused before a subprocess is started.
#
# A mutable cell rather than a plain bool, because a graph node may run in a
# copied context: a `.set()` there would be invisible to the next node, while a
# mutation through the shared cell is visible everywhere the scope reaches.
_QUOTA_BREAKER: ContextVar[dict[str, bool] | None] = ContextVar(
    "prompt2blog_claude_quota_breaker",
    default=None,
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


# Why a failed call has to say *which* failure it was.
#
# Every failure above used to raise the same sentence, so the pipeline could
# not tell "this account is out of allowance" from "the checker returned
# nonsense". The grounding stage is built to shrug off the second -- so it
# shrugged off the first, wrote "grounding check did not run", and the run
# carried on and spent the next stage's call on the same dead credential.
#
# These four are the distinctions a caller can actually act on:
#
#   quota_exhausted        stop the run; more calls cannot succeed.
#   not_connected          stop the run; setup problem, no call was made.
#   provider_unavailable   a temporary problem; degrading is reasonable.
#   invalid_response       Claude answered, the answer was unusable.
FAULT_QUOTA_EXHAUSTED = "quota_exhausted"
FAULT_NOT_CONNECTED = "not_connected"
FAULT_PROVIDER_UNAVAILABLE = "provider_unavailable"
FAULT_INVALID_RESPONSE = "invalid_response"

# Terminal reasons that name exhaustion outright. Structural, so this half of
# the detection survives any rewording of the apology text.
QUOTA_TERMINAL_REASONS = frozenset({"budget_exhausted"})

# Terminal reasons that mean the call did not complete for a reason that may
# not repeat.
TRANSIENT_TERMINAL_REASONS = frozenset(
    {"api_error", "error", "error_during_execution", "timeout"}
)

# Substrings the observed refusal used. Matched only against a reply that has
# already failed (see `_failure_kind`), never against a successful answer --
# otherwise an article about Stripe billing could classify itself.
QUOTA_MARKERS = (
    "spend limit",
    "usage limit",
    "rate limit",
    "quota",
    "credit balance",
    "out of credit",
    "insufficient credit",
    "upgrade to",
    "resets at",
    "limit will reset",
    "manage usage credits",
)

# Only the front of the refusal is scanned. The apology leads with the reason;
# anything further in is the model's own text and is not evidence.
REFUSAL_SCAN_CHARS = 400


class ClaudeCliWriterError(RuntimeError):
    """A writer call that could not be made, or whose output was unusable.

    ``kind`` is one of the four ``FAULT_*`` values and is what callers branch
    on. It defaults to ``invalid_response`` so an unlabelled raise degrades the
    way every raise here behaved before kinds existed.
    """

    def __init__(self, message: str, *, kind: str = FAULT_INVALID_RESPONSE) -> None:
        super().__init__(message)
        self.kind = kind


@contextmanager
def prompt2blog_credential_scope(token: str):
    """Bind one article run to its Prompt2Blog-only OAuth credential."""
    cleaned = token.strip()
    if not cleaned:
        raise ClaudeCliWriterError(
            "Prompt2Blog's Claude credential is empty.",
            kind=FAULT_NOT_CONNECTED,
        )
    marker = _PROMPT2BLOG_OAUTH_TOKEN.set(cleaned)
    try:
        yield
    finally:
        _PROMPT2BLOG_OAUTH_TOKEN.reset(marker)


@contextmanager
def quota_breaker_scope():
    """Arm the run-scoped stop switch for the calls made inside.

    Separate from ``prompt2blog_credential_scope`` on purpose: a run can reach
    this transport on the machine's own login with no per-run credential, and
    that run needs the switch just as much.
    """
    marker = _QUOTA_BREAKER.set({"tripped": False})
    try:
        yield
    finally:
        _QUOTA_BREAKER.reset(marker)


def _trip_quota_breaker() -> None:
    cell = _QUOTA_BREAKER.get()
    if cell is not None:
        cell["tripped"] = True


def _assert_quota_breaker_closed() -> None:
    cell = _QUOTA_BREAKER.get()
    if cell is not None and cell["tripped"]:
        raise ClaudeCliWriterError(
            "Claude's account already hit its limit earlier in this run, "
            "so no further calls were made.",
            kind=FAULT_QUOTA_EXHAUSTED,
        )


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
    selected_token = _PROMPT2BLOG_OAUTH_TOKEN.get()
    if selected_token is not None:
        conflicts = [
            name
            for name in API_BILLED_VARS
            if name != "CLAUDE_CODE_OAUTH_TOKEN"
            and os.environ.get(name, "").strip()
        ]
        if conflicts:
            raise ClaudeCliWriterError(
                "Claude credential conflict: "
                + ", ".join(conflicts)
                + " could override Prompt2Blog's article account.",
                kind=FAULT_NOT_CONNECTED,
            )
        return

    snapshot = read_claude_status()
    if snapshot.get("state") != STATE_CONNECTED:
        raise ClaudeCliWriterError(
            snapshot.get("detail")
            or "Claude is not connected on this machine, so nothing was sent.",
            kind=FAULT_NOT_CONNECTED,
        )


def _child_environment() -> dict[str, str] | None:
    selected_token = _PROMPT2BLOG_OAUTH_TOKEN.get()
    if selected_token is None:
        return None
    environment = dict(os.environ)
    environment["CLAUDE_CODE_OAUTH_TOKEN"] = selected_token
    return environment


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


def _usage_number(entry: dict[str, Any], key: str) -> float:
    value = entry.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0.0
    return float(value)


def _canonical_model(payload: dict[str, Any], alias: str) -> str:
    """The model that did the work, not the first one the CLI happened to list.

    ``modelUsage`` is a map, not a single entry. A real call routinely lists a
    small helper model alongside the one that answered, and the key order is
    the CLI's own -- not a ranking. Reading ``next(iter(...))`` therefore
    stamped whole runs with the helper's name: every Claude call in this repo's
    run history is recorded as ``claude-haiku-4-5``, including articles drafted
    on Opus at high effort. The prices were right and the model names were
    fiction, which is the worst shape for a spend record to be in.

    Generated output is what separates the two: the helper emits tens of
    tokens, the model that wrote the article emits thousands. Reported cost
    breaks a tie when no entry declared its output. Ties keep the CLI's own
    order, so the choice is deterministic for a given payload.
    """
    model_usage = payload.get("modelUsage")
    if not isinstance(model_usage, dict) or not model_usage:
        return alias

    best_key: Any = None
    best_rank = (-1.0, -1.0)
    for key, entry in model_usage.items():
        row = entry if isinstance(entry, dict) else {}
        rank = (_usage_number(row, "outputTokens"), _usage_number(row, "costUSD"))
        if rank > best_rank:
            best_rank = rank
            best_key = key
    if best_key is None:
        best_key = next(iter(model_usage))

    entry = model_usage[best_key]
    if isinstance(entry, dict):
        canonical = entry.get("canonicalModel")
        if isinstance(canonical, str) and canonical.strip():
            return canonical.strip()
    return str(best_key)


def _invoke(
    prompt: str,
    model_name: Optional[str],
    input_schema: Optional[dict[str, Any]],
) -> tuple[dict[str, Any], str]:
    cleaned = (prompt or "").strip()
    if not cleaned:
        raise ClaudeCliWriterError("Writer call had an empty prompt")

    # Before anything is spawned: a run that already exhausted the account
    # gets no further subprocesses, whatever stage is asking.
    _assert_quota_breaker_closed()
    _assert_billing_to_subscription()

    cli_path = resolve_cli_path()
    if cli_path is None:
        raise ClaudeCliWriterError(
            "The Claude Code CLI was not found on this machine.",
            kind=FAULT_NOT_CONNECTED,
        )

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
            env=_child_environment(),
        )
    except subprocess.TimeoutExpired as error:
        raise ClaudeCliWriterError(
            f"Claude did not answer within {int(CALL_TIMEOUT_SECONDS)}s.",
            kind=FAULT_PROVIDER_UNAVAILABLE,
        ) from error
    except (OSError, subprocess.SubprocessError) as error:
        raise ClaudeCliWriterError(
            f"Could not run the Claude CLI: {type(error).__name__}",
            kind=FAULT_PROVIDER_UNAVAILABLE,
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


def _quota_markers_present(payload: dict[str, Any]) -> bool:
    result = payload.get("result")
    if not isinstance(result, str):
        return False
    haystack = result[:REFUSAL_SCAN_CHARS].lower()
    return any(marker in haystack for marker in QUOTA_MARKERS)


def _spent_nothing(payload: dict[str, Any]) -> bool:
    """Whether a failed call both produced nothing and cost nothing.

    Evidence either way, so a reply that generated tokens or moved money is
    never read as exhaustion no matter what its text says.
    """
    cost = payload.get("total_cost_usd")
    cost_reported = isinstance(cost, (int, float)) and not isinstance(cost, bool)
    output_tokens = _usage_from(payload).get("outputTokens")

    if cost_reported and cost > 0:
        return False
    if isinstance(output_tokens, int) and output_tokens > 0:
        return False
    return (cost_reported and cost == 0) or output_tokens == 0


def _failure_kind(payload: dict[str, Any]) -> str:
    """Name the failure a rejected reply represents.

    Order is the point:

    1. A terminal reason that names exhaustion. Structural, survives rewording.
    2. The apology's own wording.
    3. **An unidentified failure that produced nothing and cost nothing is
       treated as exhaustion.** Deliberate and the cautious side of a real
       trade: the wording in (2) is Anthropic's to change, and if it changes
       under us the alternative reading is "temporary problem", which resumes
       the run and keeps calling a dead account -- the exact bug this whole
       classification exists to kill. The cost is that a genuine transient
       server error, which also reports no tokens and no spend, stops the run.
       A stopped run is cheap to restart.
    4. Only then, a named transient reason.
    """
    reason = str(payload.get("terminal_reason") or "").strip().lower()

    if reason in QUOTA_TERMINAL_REASONS or _quota_markers_present(payload):
        return FAULT_QUOTA_EXHAUSTED
    if _spent_nothing(payload):
        return FAULT_QUOTA_EXHAUSTED
    if reason in TRANSIENT_TERMINAL_REASONS:
        return FAULT_PROVIDER_UNAVAILABLE
    return FAULT_INVALID_RESPONSE


def _assert_claude_actually_answered(payload: dict[str, Any]) -> None:
    """Reject a reply that carries a refusal instead of an answer.

    See FAILED_TERMINAL_REASONS above for why this is three checks and why
    ``subtype`` is not one of them. Each check now raises with the kind
    ``_failure_kind`` read off the same payload, so the caller learns why the
    call failed and not merely that it did. The refusal text itself is never
    surfaced -- these strings reach an API response.
    """
    if payload.get("is_error"):
        _raise_classified(payload, "Claude reported an error answering the call.")

    reason = payload.get("terminal_reason")
    if isinstance(reason, str) and reason.strip().lower() in FAILED_TERMINAL_REASONS:
        _raise_classified(
            payload,
            "Claude stopped without answering the call, so nothing was used.",
        )

    # Absent rather than zero means the CLI did not report it; only a reported
    # zero is evidence that nothing was generated.
    output_tokens = _usage_from(payload).get("outputTokens")
    if output_tokens == 0:
        _raise_classified(
            payload,
            "Claude generated no output, so its reply was not used.",
        )


def _raise_classified(payload: dict[str, Any], message: str) -> NoReturn:
    kind = _failure_kind(payload)
    if kind == FAULT_QUOTA_EXHAUSTED:
        _trip_quota_breaker()
        message = (
            "Claude's account has hit its usage or spending limit, "
            "so the call was not completed."
        )
    raise ClaudeCliWriterError(message, kind=kind)


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
