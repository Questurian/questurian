"""Shared allowlist for the user-selectable writing-quality model.

The writing stages (compose / editorial augmentation) historically ran on a
pinned Claude model. These constants make that choice a per-run option shared
by every blog pipeline. Names route via the existing provider dispatch:
claude-* -> Anthropic, gemini-* -> Vertex.
"""

WRITER_MODEL_OPTIONS = (
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-sonnet-5",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
)

DEFAULT_WRITER_MODEL = "claude-opus-4-8"


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
