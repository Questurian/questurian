"""Shared allowlist for the user-selectable writing-quality model.

The writing stages (compose / editorial augmentation) historically ran on a
pinned Claude model. These constants make that choice a per-run option shared
by every blog pipeline. Names route via the existing provider dispatch in
utils.get_vertex_llm: gemini-* to Vertex, claude-* to whichever Claude path is
switched on.
"""

# These are always valid selections, so saved runs and existing clients keep
# working. What actually serves them is decided further down, by
# utils.resolve_effective_model: with neither Claude path switched on they are
# transparently served by a Google model, with ANTHROPIC_MODELS_ENABLED=1 they
# go to the Anthropic API, and with CLAUDE_SUBSCRIPTION_MODELS_ENABLED=1 they go
# to the Claude Code CLI on this machine. Being on this list is permission to
# ask for a name, not a claim about which transport answers.
CLAUDE_WRITER_MODELS = (
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-sonnet-5",
    "claude-opus-5-medium",
    "claude-opus-5-high",
    "claude-opus-5-xhigh",
    "claude-opus-5-max",
    "claude-sonnet-5-medium",
    "claude-sonnet-5-high",
    "claude-sonnet-5-xhigh",
    "claude-sonnet-5-max",
)

GOOGLE_WRITER_MODELS = (
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
)

WRITER_MODEL_OPTIONS = CLAUDE_WRITER_MODELS + GOOGLE_WRITER_MODELS

# Was "claude-opus-4-8" while Anthropic was funded.
DEFAULT_WRITER_MODEL = "gemini-3.1-pro-preview"


def resolve_writer_model(
    model_name: str | None,
    *,
    default: str = DEFAULT_WRITER_MODEL,
) -> str:
    """Resolve and validate a writer-model selection.

    Empty/None falls back to ``default``. Unknown names raise ValueError so
    route handlers can surface a 400 with the allowed values.
    """
    candidate = str(model_name or "").strip().lower()
    if not candidate:
        return default
    if candidate in WRITER_MODEL_OPTIONS:
        return candidate
    raise ValueError(
        "Invalid writing model. Allowed values: " + ", ".join(WRITER_MODEL_OPTIONS)
    )


def temperature_is_honored(model_name: str | None) -> bool:
    """Whether a sampling temperature actually reaches the model that answers.

    The Claude Code CLI has no temperature flag, so ``ClaudeCliTextLLM`` accepts
    the value and drops it. Every other transport here -- Vertex, the Anthropic
    API -- passes it through. That makes the creativity control real on some
    runs and inert on others, with nothing on the receipt saying which, so a
    reader comparing two drafts cannot tell whether the setting was part of the
    difference.

    Asked of the resolved model name rather than of the LLM object, because the
    callers that need the answer -- the run record, the composer UI -- are
    deciding what to say about a stage before or after the call, not holding
    the adapter that made it.
    """
    from utils.llm_model_policy import (
        CLAUDE_PROVIDER_SUBSCRIPTION_CLI,
        claude_provider,
        is_claude_model,
    )

    if not is_claude_model(model_name):
        return True
    return claude_provider() != CLAUDE_PROVIDER_SUBSCRIPTION_CLI
