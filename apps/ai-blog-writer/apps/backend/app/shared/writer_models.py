"""Shared allowlist for the user-selectable writing-quality model.

The writing stages (compose / editorial augmentation) historically ran on a
pinned Claude model. These constants make that choice a per-run option shared
by every blog pipeline. Names route via the existing provider dispatch:
claude-* -> Anthropic, gemini-* -> Vertex.
"""

# Anthropic billing is exhausted. The Claude names stay valid selections so
# saved runs and existing clients keep working, but utils.resolve_effective_model
# transparently serves them with a Google model. Restore by setting
# ANTHROPIC_MODELS_ENABLED=1 and flipping DEFAULT_WRITER_MODEL back.
CLAUDE_WRITER_MODELS = (
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-sonnet-5",
)

GOOGLE_WRITER_MODELS = (
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
